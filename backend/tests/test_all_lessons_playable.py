"""教材9本が、取り込んだそのまま最後まで通せること。

第一リリースでは診断と文章改善の2本だけを開けていた。残り7本は
中身を持ったまま「近日公開」で止めてあった。それを全部開けたので、
**本当に通るのか**をここで確かめる。

見るのは3つ。

  1. 取り込んだ教材が、全部そろって始められること
  2. AI を使う教材は、その教材のアクションが実際に 200 を返すこと
  3. どの教材も、AI を呼ぶ手前で止まらないこと
     （アクションの登録漏れ・教材との紐づけ漏れ）

ここが無いと、「一覧では押せるのに、途中の AI 実行だけ 400 で止まる」
という壊れ方に気づけない。画面を触らないと分からない不具合になる。
"""

from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.ai.actions import ACTIONS
from apps.catalog.models import (
    AvailabilityStatus,
    Course,
    Lesson,
    PublishStatus,
)

GENERATE_URL = "/api/v1/ai/generate/"
CATALOG_URL = "/api/v1/catalog/"

#: 各アクションを1回通すための、最小の入力。
#: 中身は何でもよいが、必須の項目は埋めておく必要がある
#: （埋め忘れは 400 になり、教材の問題と見分けが付かなくなる）。
SAMPLE_INPUT: dict[str, dict[str, str]] = {
    "rewrite": {
        "original_text": "明日の打ち合わせの資料を確認していただきたいです。",
        "audience": "上司",
        "tone": "ていねいに",
        "length": "3行くらい",
    },
    "summarize": {
        "original_text": "先週の会議では、来期の方針と担当の割り振りを話しました。",
        "purpose": "要点だけ知りたい",
        "format": "箇条書き",
        "length": "3つ",
    },
    "explain": {
        "topic": "クラウドとは何か",
        "audience": "はじめて聞く人",
        "style": "やさしく",
        "example": "たとえ話を入れる",
        "length": "短く",
    },
    "compare": {
        "options_text": "A案とB案",
        "criteria": "費用と手間",
        "priority": "費用",
        "as_table": "表にする",
    },
    "plan": {
        "goal": "資料を作りきる",
        "deadline": "今週中",
        "available_time": "1日30分",
    },
    "improve": {
        "original_text": "先日の件ですが、追ってご連絡差し上げます。",
        "improvement": "もっと短く",
    },
}


@pytest.fixture
def seeded(db):
    """取り込んだうえで、**このコース**を返す。

    教材の表には「これから増えるコース」の分も入る。
    どのコースの話をしているのかを、試験の側で持てるようにする。
    """
    call_command("seed_catalog")
    return Course.objects.get(slug="first_step_7days")


@pytest.fixture(autouse=True)
def _use_mock(settings):
    settings.AI_PROVIDER = "mock"
    # 1本ずつ通していくので、日ごとの上限に当たらないようにする
    settings.AI_RUNS_PER_IP_PER_DAY = 0
    settings.AI_RUNS_PER_DAY = 0
    settings.AI_DAILY_REQUEST_LIMIT_GUEST = 0


def _lessons_for(action_id: str) -> tuple[str, ...]:
    return ACTIONS[action_id].lesson_ids


@pytest.mark.django_db
class TestEveryLessonIsShipped:
    def test_all_nine_lessons_are_startable(self, seeded):
        """このコースの9本は、すべて始められること。

        数えるのはこのコースの分だけにする。教材の表には
        「これから増えるコース」の分も入っていて、そちらは
        中身がまだ無いので**始められないのが正しい**。
        全件で数えると、正しい追加のたびにここが落ちる。
        """
        stuck = list(
            seeded.lessons.exclude(
                availability_status=AvailabilityStatus.AVAILABLE
            ).values_list("slug", flat=True)
        )

        assert seeded.lessons.count() == 9
        assert stuck == [], f"始められない教材が残っている: {stuck}"

    def test_every_lesson_ships_steps(self, api_client, seeded):
        """中身が空の教材が無いこと。

        押せるのに何も起きない教材は、止まっているより悪い。
        「壊れているのか、自分の操作が悪いのか」が分からない。
        """
        lessons = api_client.get(CATALOG_URL).data["courses"][0]["lessons"]

        assert len(lessons) == 9
        empty = [entry["id"] for entry in lessons if not entry.get("steps")]
        assert empty == [], f"中身の無い教材: {empty}"


@pytest.mark.django_db
class TestEveryActionRuns:
    """AI を使う教材は、実際にその実行が通ること。"""

    def _post(self, api_client, lesson_id: str, action_id: str):
        return api_client.post(
            GENERATE_URL,
            {
                "lesson_id": lesson_id,
                # step_id は記録用。どのステップから来たかを残すだけ
                "step_id": f"generate_{action_id}",
                "action": action_id,
                "input": SAMPLE_INPUT[action_id],
            },
            format="json",
        )

    @pytest.mark.parametrize("action_id", sorted(ACTIONS))
    def test_action_runs_for_its_own_lesson(self, api_client, seeded, action_id):
        """アクションは、紐づいた教材のどれからでも通ること。"""
        for lesson_id in _lessons_for(action_id):
            response = self._post(api_client, lesson_id, action_id)

            assert response.status_code == 200, (
                f"{lesson_id} の {action_id} が {response.status_code}: {response.data}"
            )
            assert response.data.get("result"), f"{lesson_id}/{action_id} の結果が空"

    def test_every_sample_input_is_prepared(self):
        """入力の見本を書き忘れていないこと。

        アクションを足したときに、ここへ足し忘れるとテストが
        黙って素通りしてしまう。
        """
        assert set(SAMPLE_INPUT) == set(ACTIONS)

    def test_an_action_is_refused_for_an_unrelated_lesson(self, api_client, seeded):
        """紐づいていない教材からは通らないこと。

        全部を開けたあとも、ここは緩めない。教材ごとに使える
        アクションを絞っていないと、どの教材からでも何でも呼べる。
        """
        # plan は make_plan と final_challenge のもの。rewrite_text には無い
        response = self._post(api_client, "rewrite_text", "plan")

        assert response.status_code == 400

    def test_every_ai_lesson_has_at_least_one_action(self, seeded):
        """AI を使う教材に、呼べるアクションが必ず1つはあること。

        紐づけを書き忘れると、その教材は最後まで進めない。
        画面では押せるので、途中で止まってはじめて分かる。

        見るのは**始められる教材だけ**。近日公開のものはまだ中身が無く、
        押す口も配っていないので、途中で止まりようがない。
        """
        ai_lessons = set(
            Lesson.objects.filter(
                uses_ai=True,
                status=PublishStatus.PUBLISHED,
                availability_status=AvailabilityStatus.AVAILABLE,
            ).values_list("slug", flat=True)
        )
        covered = {slug for action in ACTIONS.values() for slug in action.lesson_ids}

        assert ai_lessons <= covered, f"呼べるアクションが無い教材: {ai_lessons - covered}"
