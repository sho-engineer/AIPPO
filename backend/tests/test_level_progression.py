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
from apps.rewards.models import (
    AippoLevel,
    AiSkill,
    LevelRequirement,
    RankUpChallenge,
    UserLevel,
)
from apps.rewards.rankup import CHECKS, MIN_LENGTH, judge

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

    def test_every_level_above_the_first_has_a_challenge(self, seeded):
        """Lv.2〜Lv.5 の問題が、4つそろっていること。

        1つでも欠けると、その段だけ**永久に上がれない**——技をそろえても
        通る相手がいない。地図には「準備中」と出るので、画面は壊れて
        いるように見えず、外からは気づけない。
        """
        for number in range(2, len(LEVELS) + 1):
            assert RankUpChallenge.objects.filter(level_id=number).exists(), (
                f"Lv.{number} への実践問題が無い"
            )

    def test_every_check_a_challenge_names_actually_exists(self, seeded):
        """問題が挙げた観点が、判定側に実在すること。

        鍵を書き間違えると `judge` がその観点を**黙って飛ばす**
        （`wanted` から外れる）。全部書けていなくても通ってしまい、
        しかも画面は何も言わない。
        """
        for challenge in RankUpChallenge.objects.all():
            unknown = [key for key in challenge.checks if key not in CHECKS]
            assert unknown == [], (
                f"Lv.{challenge.level_id} が知らない観点を挙げている: {unknown}"
            )

    def test_a_level_without_a_challenge_says_so(self, seeded):
        """問題を用意していない段は、**空の問題を置かない。**

        押しても何も無い項目を作るより、地図に「準備中」と出す。

        いまは Lv.2〜Lv.5 の4つそろっているので、**その状態を作って**
        見る——データの隙間に頼ると、問題を1つ足した日に、この道が
        検査されなくなる。
        """
        RankUpChallenge.objects.filter(level_id=5).delete()

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
        """問題が無い段を聞かれたら、素直に無いと答える。

        ここも状態を作って見る（上の註と同じ理由）。
        """
        RankUpChallenge.objects.filter(level_id=5).delete()

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


class TestTheLaterChallenges:
    """Lv.4「使い分ける」と Lv.5「組み立てる」の観点。

    上の4つ（目的・誰向けか・条件・出力形式）は「1回の指示をどう書くか」で、
    Lv.3 までで身につく。ここから先は**使い分け**と**組み立て**を見るので、
    見る語が別になる。

    ここで確かめたいのは2つ。**素直に書いた答えが通ること**と、
    **ぼんやりした答えが通らないこと**。前者が落ちると、何を直せばよいか
    分からないまま繰り返すことになる。
    """

    LV4 = ["basis", "verify", "safety"]
    LV5 = ["steps", "handoff", "deliverable"]

    def test_a_plain_lv4_answer_passes(self):
        verdict = judge(
            "2社の見積もりを、費用と納期の2つで比べてください。"
            "社名はA社・B社に置き換えます。金額が合っているかは"
            "自分で元の見積書と確かめます。",
            self.LV4,
        )
        assert verdict.passed is True, f"書けているのに落ちた: {verdict.missing}"

    def test_a_vague_lv4_answer_says_what_is_missing(self):
        verdict = judge(
            "2社の見積もりについて、いい感じにまとめてください。"
            "よろしくお願いします。",
            self.LV4,
        )
        assert verdict.passed is False
        assert set(verdict.missing) == set(self.LV4)

    def test_lv4_names_what_is_missing_one_by_one(self):
        """足りない観点だけを返す。**書けている分まで巻き添えにしない。**"""
        verdict = judge(
            "2社の見積もりを、費用と納期で比べてください。"
            "数字が合っているかは自分で確かめます。",
            self.LV4,
        )
        assert verdict.missing == ["safety"]
        assert verdict.missing_labels == ["渡さない情報"]

    def test_a_plain_lv5_answer_passes(self):
        verdict = judge(
            "手順書を作ります。まず全体の流れを5つの段階に分けてください。"
            "次の回では、その結果をもとに各段階の中身を書きます。"
            "最後に、そのまま配れる手順書の形でまとめてください。",
            self.LV5,
        )
        assert verdict.passed is True, f"書けているのに落ちた: {verdict.missing}"

    def test_a_one_shot_lv5_answer_does_not_pass(self):
        """**1回で全部頼む書き方は、まだ組み立てではない。**

        「手順書を作ってください」だけでは、分けることも、前の結果を
        次へ渡すことも出てこない。
        """
        verdict = judge(
            "新しい業務の手順書を作ってください。よろしくお願いします。",
            self.LV5,
        )
        assert verdict.passed is False
        assert "steps" in verdict.missing
        assert "handoff" in verdict.missing

    def test_the_later_checks_do_not_leak_into_the_earlier_ones(self):
        """Lv.3 までの問題が、あとの段の語で通らないこと。

        観点は鍵で選ぶので混ざらないはずだが、**混ざると Lv.3 が
        易しくなる**方向の事故なので、ここで押さえておく。
        """
        verdict = judge(
            "まず3つの段階に分けて、その結果を次に渡してください。",
            ["purpose", "audience", "condition", "format"],
        )
        assert "audience" in verdict.missing


class TestWhatComesBackWhenYouRise:
    """上がった回に、**祝う材料**が一緒に返ること。

    「Lv.2 になりました」だけでは、何ができるようになったのかが
    出てこない。段の名前も説明も画面側に写しを持たせない（段を足した
    日に片方だけ古くなる）ので、ここで一緒に返す。
    """

    def _rise(self, api_client, key):
        _earn(key, 2)
        return api_client.post(
            "/api/v1/rewards/challenge/2/",
            {
                "answer": "来週の会議で共有するために、この議事録の要点を"
                "まとめてください。",
            },
            format="json",
        ).json()

    def test_it_names_the_level_you_reached(self, seeded, api_client):
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)

        body = self._rise(api_client, key)

        assert body["level_up"] is True
        assert body["reached"]["number"] == 2
        assert body["reached"]["name"] == "頼む"
        assert body["reached"]["description"] != ""

    def test_it_says_what_comes_next(self, seeded, api_client):
        """次の段と、そこへ要る技の数。**行き止まりにしない。**"""
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)

        body = self._rise(api_client, key)

        assert body["next"]["number"] == 3
        assert body["next"]["name"] == "条件をつける"
        assert body["next"]["remaining"] > 0

    def test_a_round_that_did_not_rise_gets_nothing_to_celebrate(
        self, seeded, api_client
    ):
        """**祝う材料を、祝わない回に渡さない。**"""
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)

        body = api_client.post(
            "/api/v1/rewards/challenge/2/",
            {"answer": "来週の会議で共有するために、要点をまとめてください。"},
            format="json",
        ).json()

        assert body["level_up"] is False
        assert body["reached"] is None
        assert body["next"] is None

    def test_the_top_of_the_ladder_has_no_next(self, seeded, api_client):
        """いちばん上まで来た人に「次は Lv.6」と出さない。"""
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)
        progression.start_from_diagnosis(key, 4)
        _earn(key, 5)

        body = api_client.post(
            "/api/v1/rewards/challenge/5/",
            {
                "answer": "手順書を作ります。まず全体の流れを5つの段階に"
                "分けてください。次の回では、その結果をもとに各段階の"
                "中身を書きます。最後に、そのまま配れる手順書の形で"
                "まとめてください。",
            },
            format="json",
        ).json()

        assert body["level_up"] is True
        assert body["reached"]["number"] == 5
        assert body["next"] is None


class TestCanYouActuallyClimb:
    """**その段へ、いま本当に上がれるか。**

    段に要る技が決まっていても、その技を教える Lesson が閉じていれば
    （`coming_soon`）、誰もその段へ上がれない。地図には「あと4つ」と
    出るのに、押せる先が1つも無い状態になる。

    ここが守る事故
    --------------
    段・技・Lesson・公開範囲は別々の場所で決まる。どれか1つを動かした
    日に、**梯子の途中が抜ける**。抜けても画面は動き続けるし、検査も
    緑のままなので、外からは気づけない。

    いまの穴を、数で固定しておく
    ----------------------------
    直すには Lesson を開く（`published` にする）必要があり、それは
    **人にしかできない**（`docs/aippo/lesson-release-gates.md`）。
    だから「全部たどれる」ではなく「**いまたどれない段はこれだけ**」
    を書いて留める。増えたら落ちるし、開いて解消したらここも直る。
    """

    #: いま上がれない段と、その理由。**Lv.2 までしか上がれない。**
    #:
    #: Lv.3 … length / output_format は summarize_text・explain_topic
    #:        でしか取れない。どちらも coming_soon（開けば解消する）
    #: Lv.4 … comparison は compare_options だけ（coming_soon）。
    #:        data_safety は use_ai_safely だけで、こちらは **archived**
    #:        ——非公開の保管コースへ移してある
    #: Lv.5 … task_framing は final_challenge だけで、これも archived
    #:
    #: coming_soon は「まだ開けていない」だが、archived は「引っ込めた」。
    #: 後者は開き直すかどうかから決める話で、どちらも**人が決める**
    #: （`docs/aippo/lesson-release-gates.md`）。
    KNOWN_GAPS = {3, 4, 5}

    def _reachable(self, number: int) -> bool:
        from apps.catalog.models import AvailabilityStatus, Lesson, PublishStatus

        requirement = LevelRequirement.objects.get(level_id=number)
        for skill in requirement.required_skills.all():
            slugs = [link.lesson.slug for link in skill.lesson_links.all()]
            if not Lesson.objects.filter(
                slug__in=slugs,
                status=PublishStatus.PUBLISHED,
                availability_status=AvailabilityStatus.AVAILABLE,
            ).exists():
                return False
        return True

    def test_the_gaps_are_where_we_think_they_are(self, seeded):
        gaps = {
            seed.number
            for seed in LEVELS
            if seed.skills and not self._reachable(seed.number)
        }
        assert gaps == self.KNOWN_GAPS, (
            "上がれない段が変わった。"
            f"いま {sorted(gaps)} / 控えてあるのは {sorted(self.KNOWN_GAPS)}。"
            "増えたなら梯子が抜けている。減ったなら Lesson が開いたので、"
            "ここの控えも直すこと"
        )

    def test_every_required_skill_has_a_lesson_somewhere(self, seeded):
        """**教材が1本も無い技を、要件に置かない。**

        閉じているのは運用の都合で戻せるが、そもそも教材が無いと
        永久に取れない。ここは穴ではなく、はっきりした誤り。
        """
        for seed in LEVELS:
            requirement = LevelRequirement.objects.get(level_id=seed.number)
            for skill in requirement.required_skills.all():
                assert skill.lesson_links.exists(), (
                    f"技「{skill.name}」を教える Lesson が1本も無い"
                    f"（Lv.{seed.number} の要件）"
                )


class TestAnEmptyRequirementNeverOpensAChallenge:
    """**要件が空の段は、開かない。**

    技が0個だと「そろっている」ことになり（`remaining == 0`）、誰でも
    素通りで上がれてしまう。段だけ先に入って技がまだ、という**途中の
    状態**で起きる——新しい環境の立ち上げや、本番へ順に入れていく
    ときに通る道。

    データの入り順に、昇段の可否を預けない。
    """

    def test_a_level_with_no_required_skills_stays_shut(self, seeded):
        key = uuid.uuid4()
        LevelRequirement.objects.get(level_id=2).required_skills.clear()

        state = next(
            one for one in progression.build_map([key]) if one.number == 2
        )

        assert state.remaining == 0, "技が0個なら、残りも0"
        assert state.challenge_open is False, "要件が空なのに挑戦が開いた"

    def test_the_api_refuses_to_raise_you_through_an_empty_level(
        self, seeded, api_client
    ):
        """素通りで上がれないこと。**入り口だけでなく、結果も見る。**"""
        key = uuid.uuid4()
        api_client.cookies["learner_key"] = str(key)
        LevelRequirement.objects.get(level_id=2).required_skills.clear()

        body = api_client.post(
            "/api/v1/rewards/challenge/2/",
            {
                "answer": "来週の会議で共有するために、この議事録の要点を"
                "まとめてください。",
            },
            format="json",
        ).json()

        assert body["passed"] is True
        assert body["level_up"] is False, "要件が空の段を素通りで上がった"


class TestTheLevelOnlySeedCommand:
    """`seed_levels` が、**新しい4つの表だけ**を触ること。

    `seed_catalog` は教材の本文まで上書きする（`_upsert_lesson`）。
    本番で流すと、管理画面から直した文言が同梱データへ巻き戻る。
    段の仕組みを入れたいだけのときに、そこまで動かす理由は無い。
    """

    def test_it_fills_the_ladder(self, seeded):
        AippoLevel.objects.all().delete()

        call_command("seed_levels", verbosity=0)

        assert AippoLevel.objects.count() == len(LEVELS)
        assert RankUpChallenge.objects.count() == len(
            [one for one in LEVELS if one.number >= 2]
        )

    def test_it_does_not_touch_the_lessons(self, seeded):
        """教材の本文に触らないこと。**巻き戻しを起こさない。**"""
        from apps.catalog.models import Lesson

        lesson = Lesson.objects.get(slug="rewrite_text")
        Lesson.objects.filter(pk=lesson.pk).update(title="運用で直した題")

        call_command("seed_levels", verbosity=0)

        lesson.refresh_from_db()
        assert lesson.title == "運用で直した題", "seed_levels が教材を書き戻した"

    def test_it_refuses_to_fill_an_empty_ladder_without_skills(self, seeded):
        """図鑑が空なら、**何もせずに終わる。**

        歯抜けの要件を残すほうが危ない——技0個は「そろっている」
        ことになり、素通りで上がれてしまう。
        """
        AippoLevel.objects.all().delete()
        AiSkill.objects.all().delete()

        call_command("seed_levels", verbosity=0)

        assert AippoLevel.objects.count() == 0, "技が無いのに段を入れた"
