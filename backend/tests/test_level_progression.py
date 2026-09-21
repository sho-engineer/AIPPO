"""Level・技・地図・昇段が、決めたとおりに噛み合うこと。

ここが守る事故
--------------
Level は「こなした本数」でも「受けた回数」でもない。上がる条件は
2つあって、**どちらも要る**。

    1. その段に要る AI技をそろえる
    2. 昇段の実践問題を通る

片方だけで上がる形になっていると、外からは気づけない——画面は
動いているし、Level も増えるので、**中身の無い Level** が静かに
できあがる。だから条件の組み合わせを全部ここで並べる。

もう一つは、診断で飛ばした段の扱い。Lv.3 と出た人に Lv.1・Lv.2 を
やり直させないが、**取っていない技を「取った」ことにはしない**。
混ぜると、あとから「この人は本当にこの技を使えるのか」が分からなく
なる。
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest
from django.core.management import call_command

from apps.lessons.models import SkillProgress
from apps.rewards import progression
from apps.rewards.levels import LEVELS
from apps.rewards.models import AippoLevel, LevelRequirement, UserLevel
from apps.rewards.rankup import MIN_LENGTH, judge

pytestmark = pytest.mark.django_db


@pytest.fixture
def seeded() -> None:
    """教材・技・段を一通り入れる。`seed_catalog` の1本で揃うこと。"""
    call_command("seed_catalog", verbosity=0)


def _earn(key: uuid.UUID, level_number: int) -> None:
    """その段に要る技を、全部取得済みにする。"""
    requirement = LevelRequirement.objects.get(level_id=level_number)
    for skill in requirement.required_skills.all():
        SkillProgress.objects.get_or_create(
            learner_key=key, skill_key=skill.slug, defaults={"lesson_id": "test"}
        )


def _state(key: uuid.UUID, number: int):
    return next(one for one in progression.build_map([key]) if one.number == number)


class TestTheSeedFillsTheLadder:
    def test_seeding_the_catalog_also_fills_the_levels(self, seeded):
        assert AippoLevel.objects.count() == len(LEVELS), (
            "seed_catalog のあとに段が揃っていない。"
            "地図は段の数をデータから読むので、ここが空だと何も出ない"
        )

    def test_every_required_skill_actually_exists(self, seeded):
        """要件の技が、図鑑に実在すること。

        slug を書き間違えると、その技は**永久に取得できない**。
        そろわないので挑戦も永久に開かず、外からは「難しい」としか
        見えない。
        """
        for seed in LEVELS:
            requirement = LevelRequirement.objects.get(level_id=seed.number)
            got = {skill.slug for skill in requirement.required_skills.all()}
            assert got == set(seed.skills), (
                f"Lv.{seed.number} の要件が表と違う。"
                f"表 {sorted(seed.skills)} / DB {sorted(got)}"
            )

    def test_the_first_level_needs_nothing(self, seeded):
        """Lv.1 は始まりの段。ここへ「上がる」ことは無い。"""
        assert LevelRequirement.objects.get(level_id=1).required_skills.count() == 0

    def test_a_level_without_a_challenge_says_so(self, seeded):
        """問題を用意していない段は、**空の問題を置かない。**

        押しても何も無い項目を作るより、地図に「準備中」と出す。
        """
        assert _state(uuid.uuid4(), 5).has_challenge is False


class TestWhereSomeoneStands:
    def test_a_newcomer_starts_at_the_first_level(self, seeded):
        """診断もまだの人にも地図を見せる。空を返さない。"""
        now, _ = progression.current_level([uuid.uuid4()])
        assert now == 1

    def test_the_diagnosis_sets_the_starting_point(self, seeded):
        key = uuid.uuid4()
        assert progression.start_from_diagnosis(key, 3) == 3
        assert _state(key, 3).status == "current"

    def test_a_skipped_level_does_not_hand_out_skills(self, seeded):
        """**診断で飛ばした段の技は、取ったことにしない。**

        地図では通り過ぎた段として出すが、技は未取得のまま。
        ここを混ぜると、使えるかどうか分からない技が「習得済み」に
        並ぶ。
        """
        key = uuid.uuid4()
        progression.start_from_diagnosis(key, 3)

        passed = _state(key, 2)
        assert passed.status == "done"
        assert passed.skipped is True
        assert all(one.status == "locked" for one in passed.skills), (
            "飛ばした段の技まで習得済みになっている"
        )
        assert progression.earned_skills([key]) == set()

    def test_a_second_diagnosis_never_pushes_someone_down(self, seeded):
        """受け直した診断が、上がった段を取り消さないこと。"""
        key = uuid.uuid4()
        progression.start_from_diagnosis(key, 4)
        assert progression.start_from_diagnosis(key, 2) == 4
        assert UserLevel.objects.get(pk=key).level_id == 4


class TestWhatItTakesToRise:
    """**集めただけでも、通っただけでも上がらない。**"""

    def test_collecting_every_skill_is_not_enough(self, seeded):
        """技をそろえた時点では、まだ上がらない（挑戦が開くだけ）。"""
        key = uuid.uuid4()
        _earn(key, 2)

        assert _state(key, 2).remaining == 0
        assert _state(key, 2).challenge_open is True
        now, _ = progression.current_level([key])
        assert now == 1, "技をそろえただけで段が上がっている"

    def test_the_challenge_alone_is_not_enough(self, seeded, api_client):
        """技が足りないまま通っても、段は動かない。"""
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)

        response = api_client.post(
            "/api/v1/rewards/challenge/2/",
            {
                "answer": "来週の会議で共有するために、この議事録の要点を"
                "まとめてください。",
            },
            format="json",
        )

        assert response.status_code == 200
        body = response.json()
        assert body["passed"] is True, "書けているのに落としている"
        assert body["level_up"] is False, "技が足りないのに段が上がった"
        assert body["current_level"] == 1
        assert body["remaining_skills"] > 0

    def test_both_together_raise_the_level(self, seeded, api_client):
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)
        _earn(key, 2)

        response = api_client.post(
            "/api/v1/rewards/challenge/2/",
            {
                "answer": "来週の会議で共有するために、この議事録の要点を"
                "まとめてください。",
            },
            format="json",
        )

        body = response.json()
        assert body["passed"] is True
        assert body["level_up"] is True
        assert body["current_level"] == 2
        assert UserLevel.objects.get(pk=key).reached_by == UserLevel.ReachedBy.RANKUP

    def test_a_far_off_challenge_stays_shut(self, seeded):
        """**すぐ次の段の問題しか受けられない。**

        先の段の問題を先取りできると、途中を飛ばして上がれてしまう。
        """
        key = uuid.uuid4()
        _earn(key, 3)  # Lv.3 の技はそろっているが、いま居るのは Lv.1

        assert _state(key, 3).remaining == 0
        assert _state(key, 3).challenge_open is False


class TestHowTheChallengeIsJudged:
    """観点ごとに見て、**足りないものを名前で返す。点数は出さない。**"""

    def test_a_complete_instruction_passes(self):
        verdict = judge(
            "取引先に向けて、来月の案内を共有するために、"
            "300字以内の箇条書きでまとめてください。",
            ["purpose", "audience", "condition", "format"],
        )
        assert verdict.passed is True
        assert verdict.missing == []

    def test_what_is_missing_comes_back_by_name(self):
        verdict = judge(
            "この議事録を、来週の共有のために整理してください。整理の"
            "方針はおまかせします。",
            ["purpose", "audience", "format"],
        )
        assert verdict.passed is False
        assert "audience" in verdict.missing
        assert "誰向けか" in verdict.missing_labels

    def test_a_one_word_answer_cannot_slip_through(self):
        """短すぎる答えは、**観点を探さずに**足りないことにする。

        1語だけ書いて、たまたま当たった観点で通るのを防ぐ。
        """
        verdict = judge("要約して", ["purpose"])
        assert len(verdict.missing) == 1
        assert verdict.passed is False

    def test_the_length_floor_is_where_it_says(self):
        """境目が動いていないこと（`MIN_LENGTH`）。"""
        body = "共有するために、この文章を短くまとめてください。"
        assert len(body) < MIN_LENGTH
        assert judge(body, ["purpose"]).passed is False
        assert judge(body + "よろしくお願いします。", ["purpose"]).passed is True

    def test_a_challenge_without_checks_lets_everyone_through(self):
        """観点をまだ決めていない段で、そこだけ進めなくならないこと。"""
        assert judge("なんでもいい", []).passed is True


class TestTheMapApi:
    def test_the_map_comes_back_whole(self, seeded, api_client):
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)

        body = api_client.get("/api/v1/rewards/map/").json()

        assert body["current_level"] == 1
        assert len(body["levels"]) == len(LEVELS)
        assert body["next"]["number"] == 2

    def test_the_top_of_the_ladder_has_no_next(self, seeded, api_client):
        """5段目の人に「次は Lv.6」と出さないこと。"""
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)
        progression.start_from_diagnosis(key, 5)

        assert api_client.get("/api/v1/rewards/map/").json()["next"] is None

    def test_the_challenge_does_not_hand_over_its_answer_key(
        self, seeded, api_client
    ):
        """観点は**名前だけ**返す。見分け方そのものは返さない。

        言い回しの一覧を渡すと、答えではなく一覧を写せば通る。
        """
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)

        body = api_client.get("/api/v1/rewards/challenge/3/").json()

        assert body["check_labels"] == ["目的", "誰向けか", "条件", "出力形式"]
        assert "checks" not in body
        assert "箇条書き" not in str(body), "見分け方の語が漏れている"

    def test_a_level_without_a_challenge_answers_plainly(self, seeded, api_client):
        assert api_client.get("/api/v1/rewards/challenge/5/").status_code == 404

    def test_the_diagnosis_endpoint_moves_the_starting_point(
        self, seeded, api_client
    ):
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)

        body = api_client.post(
            "/api/v1/rewards/level/", {"level": 3}, format="json"
        ).json()

        assert body["current_level"] == 3
        assert api_client.get("/api/v1/rewards/map/").json()["current_level"] == 3


class TestTheWordsMatchTheScreen:
    """段の名前が、画面側とそろっていること。

    ここが守る事故
    --------------
    段の名前は2か所にある——サーバーの初期データ（`levels.py`）と、
    画面が一覧を出すための表（`frontend/src/course/aippoLevel.ts`）。
    **同じものを指す言葉は、画面をまたいでそろえる。** 片方だけ直すと、
    地図では「条件をつける」なのに一覧では別の名前、という状態になる。

    いずれ画面側は API から読む（Phase 2）。そのときここは消える。
    それまでのあいだ、静かにずれるのを止める。
    """

    def _screen_levels(self) -> dict[int, str]:
        source = (
            Path(__file__).resolve().parents[2]
            / "frontend/src/course/aippoLevel.ts"
        ).read_text(encoding="utf-8")
        found = re.findall(
            r'number:\s*(\d+),\s*\n\s*name:\s*"([^"]+)"', source
        )
        return {int(number): name for number, name in found}

    def test_the_short_names_are_the_same_on_both_sides(self):
        screen = self._screen_levels()
        assert screen, "画面側の表が読めなかった。場所が変わった？"
        for seed in LEVELS:
            assert screen.get(seed.number) == seed.name, (
                f"Lv.{seed.number} の名前がずれている。"
                f"サーバー「{seed.name}」/ 画面「{screen.get(seed.number)}」"
            )

    def test_neither_side_has_a_level_the_other_lacks(self):
        assert set(self._screen_levels()) == {seed.number for seed in LEVELS}


class TestWhatALessonGivesYou:
    """開始画面へ返すもの。**約束はしない。数だけ言う。**"""

    def test_it_names_the_skills_the_lesson_teaches(self, seeded, api_client):
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)

        body = api_client.get("/api/v1/rewards/lesson/rewrite_text/").json()

        slugs = {one["slug"] for one in body["skills"]}
        assert "prompt" in slugs, "このレッスンで取れる技が返っていない"
        assert all(one["acquired"] is False for one in body["skills"])

    def test_a_lesson_you_already_did_says_so(self, seeded, api_client):
        """**「今回はじめて身につきます」と書かせない。**

        やり直しの回に新しく取れるように出すと、嘘になる。
        """
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)
        SkillProgress.objects.create(
            learner_key=key, skill_key="prompt", lesson_id="rewrite_text"
        )

        body = api_client.get("/api/v1/rewards/lesson/rewrite_text/").json()

        got = {one["slug"]: one["acquired"] for one in body["skills"]}
        assert got["prompt"] is True

    def test_it_counts_what_is_still_missing_afterwards(self, seeded, api_client):
        """終えたあとの残りを数える。**上がるとは言わない。**"""
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)

        body = api_client.get("/api/v1/rewards/lesson/rewrite_text/").json()

        # Lv.2 は prompt と context の2つ。rewrite_text は prompt だけ
        assert body["next_level"]["number"] == 2
        assert body["next_level"]["remaining"] == 2
        assert body["remaining_after"] == 1

    def test_a_skill_you_already_have_is_not_counted_twice(self, seeded, api_client):
        """**片方だけで数えない。**

        すでに持っている技を含むレッスンで、残りが二重に減らないこと。
        """
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)
        SkillProgress.objects.create(
            learner_key=key, skill_key="prompt", lesson_id="rewrite_text"
        )

        body = api_client.get("/api/v1/rewards/lesson/rewrite_text/").json()

        assert body["next_level"]["remaining"] == 1
        assert body["remaining_after"] == 1, "持っている分をもう一度引いている"

    def test_a_lesson_without_skills_answers_plainly(self, seeded, api_client):
        """技がひも付いていないレッスンでも、画面を止めない。"""
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)

        body = api_client.get("/api/v1/rewards/lesson/diagnosis/").json()

        assert body["skills"] == []
        assert body["next_level"] is not None

    def test_the_top_of_the_ladder_has_no_next(self, seeded, api_client):
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)
        progression.start_from_diagnosis(key, 5)

        body = api_client.get("/api/v1/rewards/lesson/rewrite_text/").json()

        assert body["next_level"] is None
        assert body["remaining_after"] == 0
