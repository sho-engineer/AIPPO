"""AI技（図鑑）と XP。

守りたいこと
------------
- 習得できる技は**そのレッスンが教えたもの**だけ。前は全レッスン共通の
  固定4つで、どれを終えても同じ4つが付いていた（していないことを
  習得したことにしていた）
- XPは減らない。やり直しても二重に増えない
- ゲストのままでも貯まる。登録済みの人は複数端末ぶんが合算される
- 図鑑に**行き先の無い枠**を出さない（習得できるレッスンが無い技は出さない）
- 順位も他人との比較も出さない
"""

from __future__ import annotations

import uuid

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import LearnerIdentity
from apps.catalog.models import Course, Lesson
from apps.lessons.models import LearningEventType, LearningSession, SkillProgress
from apps.rewards import xp as xp_module
from apps.rewards.models import AiSkill, AiSkillLesson, XpEvent, XpKind
from apps.rewards.skills import AI_SKILLS, SKILL_COMBOS, award_lesson_skills, seed_ai_skills

pytestmark = pytest.mark.django_db

User = get_user_model()


def _lesson(slug: str, number: int = 1) -> Lesson:
    course, _ = Course.objects.get_or_create(slug="c1", defaults={"title": "c1"})
    return Lesson.objects.create(
        course=course, slug=slug, number=number, title=slug, goal="goal"
    )


def _skill(slug: str, lesson: Lesson | None = None, order: int = 0) -> AiSkill:
    skill = AiSkill.objects.create(
        slug=slug, name=slug, one_line="ひとこと", order=order
    )
    if lesson is not None:
        AiSkillLesson.objects.create(skill=skill, lesson=lesson)
    return skill


class TestTheSkillListItself:
    def test_every_skill_is_obtainable_from_a_real_lesson(self):
        """図鑑に、**押しても何も無い項目**を作らない。

        「12 / 48」のように集める余地を見せたくなるが、中身の無い枠を
        並べると、どのレッスンで取れるかを書けない行ができる。
        """
        for seed in AI_SKILLS:
            assert seed.lessons, f"{seed.slug} を習得できるレッスンが無い"

    def test_skill_names_are_not_made_up_words(self):
        """一般用語にする。

        図鑑で覚えた言葉が、外の記事や他の道具でそのまま通じないと
        学んだ意味が半分になる。ここでは「AIPPO」という語が
        技の名前に紛れ込んでいないことだけを機械で見る。
        """
        for seed in AI_SKILLS:
            assert "AIPPO" not in seed.name
            assert "ポー" not in seed.name

    def test_combos_only_use_skills_that_exist(self):
        slugs = {seed.slug for seed in AI_SKILLS}
        for combo, _name, _line in SKILL_COMBOS:
            assert set(combo) <= slugs, combo


class TestAwardingSkills:
    def test_only_the_skills_that_lesson_teaches(self):
        """前は全レッスン共通の固定4つだった。ここが戻ると図鑑が意味を失う。"""
        first = _lesson("rewrite_text", 1)
        second = _lesson("summarize_text", 2)
        _skill("tone", first)
        _skill("length", first)
        _skill("output_format", second)

        key = uuid.uuid4()
        acquired = award_lesson_skills(key, "rewrite_text")

        assert sorted(acquired) == ["length", "tone"]
        assert not SkillProgress.objects.filter(
            learner_key=key, skill_key="output_format"
        ).exists()

    def test_doing_the_same_lesson_twice_does_not_award_twice(self):
        lesson = _lesson("rewrite_text")
        _skill("tone", lesson)
        key = uuid.uuid4()

        award_lesson_skills(key, "rewrite_text")
        again = award_lesson_skills(key, "rewrite_text")

        assert again == []
        assert SkillProgress.objects.filter(learner_key=key).count() == 1

    def test_a_lesson_with_no_skills_is_not_an_error(self):
        """診断のように、技が付かないレッスンもある。落とさない。"""
        _lesson("diagnosis")
        assert award_lesson_skills(uuid.uuid4(), "diagnosis") == []


class TestXpAmounts:
    def test_lesson_is_worth_more_than_a_single_skill(self):
        """逆にすると、技の多いレッスンだけ得になる。

        教材の並べ方が点数に引きずられるので、ここは向きを固定する。
        """
        assert (
            xp_module.XP_AMOUNTS[XpKind.LESSON_COMPLETED]
            > xp_module.XP_AMOUNTS[XpKind.AI_SKILL_ACQUIRED]
        )

    def test_the_same_event_only_counts_once(self):
        key = uuid.uuid4()

        assert xp_module.award(key, XpKind.LESSON_COMPLETED, "rewrite_text") is not None
        assert xp_module.award(key, XpKind.LESSON_COMPLETED, "rewrite_text") is None
        assert xp_module.total_xp([key]) == 20

    def test_xp_never_goes_down(self):
        """減る仕組みを入れない。

        「失う恐怖で続けさせる」設計になり、順位も比較も出さない方針と
        食い違う。amount が負にならないことを型で見張る。
        """
        key = uuid.uuid4()
        xp_module.award(key, XpKind.LESSON_COMPLETED, "a")
        xp_module.award(key, XpKind.AI_SKILL_ACQUIRED, "tone")

        assert all(event.amount > 0 for event in XpEvent.objects.all())
        assert xp_module.total_xp([key]) == 30

    def test_total_is_summed_across_devices(self):
        one, two = uuid.uuid4(), uuid.uuid4()
        xp_module.award(one, XpKind.LESSON_COMPLETED, "a")
        xp_module.award(two, XpKind.LESSON_COMPLETED, "b")

        assert xp_module.total_xp([one]) == 20
        assert xp_module.total_xp([one, two]) == 40

    def test_no_total_column_exists(self):
        """合計は SUM で出す。残高のカラムを持たない。

        2か所に持つと必ずずれる（Credit で同じ判断をしている）。
        """
        fields = {field.name for field in XpEvent._meta.fields}
        assert "total" not in fields
        assert "balance" not in fields


class TestLevels:
    def test_starts_at_the_first_name(self):
        level = xp_module.level_for(0)
        assert level.name == xp_module.LEVELS[0][1]
        assert level.to_next == xp_module.LEVELS[1][0]

    def test_moves_up_at_the_threshold(self):
        below = xp_module.level_for(xp_module.LEVELS[1][0] - 1)
        at = xp_module.level_for(xp_module.LEVELS[1][0])

        assert below.name == xp_module.LEVELS[0][1]
        assert at.name == xp_module.LEVELS[1][1]

    def test_the_last_name_has_no_next(self):
        level = xp_module.level_for(xp_module.LEVELS[-1][0] + 10_000)
        assert level.next_name is None
        assert level.to_next is None

    def test_levels_are_not_a_table(self):
        """呼び名を変えるのに migration が要らないこと。

        テーブルにすると、名前を変えるだけで migration と再計算が要る。
        """
        from django.apps import apps as django_apps

        names = {model.__name__ for model in django_apps.get_models()}
        assert "XpLevel" not in names
        assert "Level" not in names


class TestFinishingALessonThroughTheApi:
    """画面から来る道筋そのままで、技とXPが付くか。"""

    def _finish(self, client, lesson_slug: str) -> None:
        response = client.post(
            "/api/learning-events/",
            {
                "lesson_id": lesson_slug,
                "step": "COMPLETE",
                "event_type": LearningEventType.LESSON_COMPLETED,
                "input_length": 0,
                "hint_count": 0,
                "retry_count": 0,
                "completed": True,
            },
            format="json",
        )
        # 終えた回は、何が増えたかを返す
        assert response.status_code == 200

    def test_skills_and_xp_are_awarded(self, api_client):
        lesson = _lesson("rewrite_text")
        _skill("tone", lesson)
        _skill("length", lesson)

        self._finish(api_client, "rewrite_text")

        session = LearningSession.objects.get(lesson_id="rewrite_text")
        key = session.learner_key
        assert sorted(
            SkillProgress.objects.filter(learner_key=key).values_list(
                "skill_key", flat=True
            )
        ) == ["length", "tone"]
        # レッスン1本 + 技2つ
        assert xp_module.total_xp([key]) == 20 + 10 + 10

    def test_doing_it_again_does_not_double_the_xp(self, api_client):
        lesson = _lesson("rewrite_text")
        _skill("tone", lesson)

        self._finish(api_client, "rewrite_text")
        self._finish(api_client, "rewrite_text")

        # 2回目はやり直しなので、新しいセッションになる。鍵は同じ端末のまま
        keys = list(
            LearningSession.objects.values_list("learner_key", flat=True).distinct()
        )
        assert len(keys) == 1
        assert xp_module.total_xp(keys) == 30

    def test_progress_reports_the_level(self, api_client):
        lesson = _lesson("rewrite_text")
        _skill("tone", lesson)
        self._finish(api_client, "rewrite_text")

        body = api_client.get("/api/v1/progress/").json()

        assert body["xp"]["total"] == 30
        assert body["xp"]["level"] == xp_module.LEVELS[0][1]
        assert body["skills"] == ["tone"]


class TestTheSkillDex:
    def test_lists_every_obtainable_skill_with_its_lesson(self, api_client):
        lesson = _lesson("rewrite_text")
        _skill("tone", lesson, order=0)
        _skill("length", lesson, order=1)

        body = api_client.get(reverse("rewards-skills")).json()

        assert body["total_count"] == 2
        assert body["acquired_count"] == 0
        assert [row["slug"] for row in body["skills"]] == ["tone", "length"]
        assert body["skills"][0]["lessons"] == [
            {"slug": "rewrite_text", "title": "rewrite_text", "course_slug": "c1"}
        ]

    def test_hides_skills_with_no_lesson_to_learn_them_from(self, api_client):
        """行き先の無い枠を並べない。押しても何も無い項目になる。"""
        lesson = _lesson("rewrite_text")
        _skill("tone", lesson)
        _skill("orphan")

        body = api_client.get(reverse("rewards-skills")).json()

        assert [row["slug"] for row in body["skills"]] == ["tone"]

    def test_marks_what_this_person_has(self, api_client):
        lesson = _lesson("rewrite_text")
        _skill("tone", lesson)
        _skill("length", lesson)

        # セッションを作って learner_key を確定させてから付ける
        api_client.get(reverse("rewards-skills"))
        key = uuid.UUID(api_client.cookies["learner_key"].value)
        award_lesson_skills(key, "rewrite_text")

        body = api_client.get(reverse("rewards-skills")).json()

        assert body["acquired_count"] == 2
        assert all(row["acquired"] for row in body["skills"])
        assert all(row["acquired_at"] for row in body["skills"])

    def test_combos_are_shown_but_not_stored(self, api_client):
        lesson = _lesson("rewrite_text")
        _skill("target", lesson)
        _skill("tone", lesson)

        api_client.get(reverse("rewards-skills"))
        key = uuid.UUID(api_client.cookies["learner_key"].value)
        award_lesson_skills(key, "rewrite_text")

        body = api_client.get(reverse("rewards-skills")).json()
        combo = next(row for row in body["combos"] if row["skills"] == ["target", "tone"])

        assert combo["complete"] is True
        # 組み合わせは見せ方。持ち物として数えない
        assert body["acquired_count"] == 2

    def test_does_not_show_other_people(self, api_client):
        """順位も他人との比較も出さない（憲章）。"""
        lesson = _lesson("rewrite_text")
        _skill("tone", lesson)
        award_lesson_skills(uuid.uuid4(), "rewrite_text")  # 他人

        body = api_client.get(reverse("rewards-skills")).json()

        assert body["acquired_count"] == 0
        assert "rank" not in body
        assert "average" not in body

    def test_a_signed_in_person_sees_every_device(self, api_client):
        lesson = _lesson("rewrite_text")
        _skill("tone", lesson)

        user = User.objects.create_user(username="a@example.com", password="x" * 12)
        other_device = uuid.uuid4()
        LearnerIdentity.objects.create(user=user, learner_key=other_device)
        award_lesson_skills(other_device, "rewrite_text")
        xp_module.award(other_device, XpKind.LESSON_COMPLETED, "rewrite_text")

        api_client.force_authenticate(user=user)
        body = api_client.get(reverse("rewards-skills")).json()

        assert body["acquired_count"] == 1
        assert body["xp"]["total"] == 20


class TestSeeding:
    def test_it_can_run_twice(self):
        for seed in AI_SKILLS:
            for slug in seed.lessons:
                if not Lesson.objects.filter(slug=slug).exists():
                    _lesson(slug, number=Lesson.objects.count() + 1)

        seed_ai_skills()
        seed_ai_skills()

        assert AiSkill.objects.count() == len(AI_SKILLS)
        for seed in AI_SKILLS:
            skill = AiSkill.objects.get(slug=seed.slug)
            assert skill.lesson_links.count() == len(seed.lessons)

    def test_it_does_not_undo_edits_made_in_the_admin(self):
        _lesson("rewrite_text")
        seed_ai_skills()
        skill = AiSkill.objects.get(slug="tone")
        skill.name = "言い方の指定"
        skill.save()

        seed_ai_skills()

        assert AiSkill.objects.get(slug="tone").name == "言い方の指定"


class TestDeletingLearningData:
    def test_xp_goes_with_it(self, api_client):
        """「消した」と言った以上、学んだ量も消す。"""
        user = User.objects.create_user(username="a@example.com", password="x" * 12)
        key = uuid.uuid4()
        LearnerIdentity.objects.create(user=user, learner_key=key)
        xp_module.award(key, XpKind.LESSON_COMPLETED, "rewrite_text")

        api_client.force_authenticate(user=user)
        response = api_client.post("/api/v1/accounts/learning-data/delete/")

        assert response.status_code == 200
        assert XpEvent.objects.filter(learner_key=key).count() == 0


class TestRenamingOldSkillKeys:
    """習得済みの記録を、消さずに新しい slug へ付け替える。

    消して作り直すと、いままでに習得した分が利用者から見て
    **無かったことになる**。ここが壊れると、既存の人の図鑑が空になる。

    migration の中身（`_rename`）を直接呼ぶ。モデルの形は変わっていないので、
    いまのモデル定義をそのまま渡して確かめられる。
    """

    def test_it_renames_and_keeps_the_date(self):
        import importlib

        module = importlib.import_module(
            "apps.lessons.migrations.0012_rename_skill_keys_to_ai_skills"
        )
        from django.apps import apps as django_apps

        key = uuid.uuid4()
        row = SkillProgress.objects.create(
            learner_key=key, skill_key="state_tone", lesson_id="rewrite_text"
        )
        was = row.acquired_at

        module._rename(django_apps, module.RENAMES)

        moved = SkillProgress.objects.get(learner_key=key)
        assert moved.skill_key == "tone"
        assert moved.acquired_at == was
        assert moved.lesson_id == "rewrite_text"

    def test_it_does_not_break_when_both_keys_exist(self):
        """行き先が埋まっている人がいても落とさない。

        (learner_key, skill_key) は unique なので、そのまま付け替えると
        IntegrityError で migration ごと止まる。
        """
        import importlib

        module = importlib.import_module(
            "apps.lessons.migrations.0012_rename_skill_keys_to_ai_skills"
        )
        from django.apps import apps as django_apps

        key = uuid.uuid4()
        SkillProgress.objects.create(
            learner_key=key, skill_key="state_tone", lesson_id="old"
        )
        SkillProgress.objects.create(
            learner_key=key, skill_key="tone", lesson_id="new"
        )

        module._rename(django_apps, module.RENAMES)

        rows = SkillProgress.objects.filter(learner_key=key)
        assert [row.skill_key for row in rows] == ["tone"]
        assert rows.get().lesson_id == "new"

    def test_every_old_key_lands_on_a_real_skill(self):
        import importlib

        module = importlib.import_module(
            "apps.lessons.migrations.0012_rename_skill_keys_to_ai_skills"
        )

        slugs = {seed.slug for seed in AI_SKILLS}
        for new in module.RENAMES.values():
            assert new in slugs, f"{new} という技は図鑑に無い"


class TestCourseCheckpoints:
    """コースの節目。

    毎回だと節目にならず、遠すぎると途中で切れる。1本10分なので
    3本ごと——1回の学習で届く距離にしてある。
    """

    def _finish(self, client, lesson_slug: str) -> None:
        response = client.post(
            "/api/learning-events/",
            {
                "lesson_id": lesson_slug,
                "step": "COMPLETE",
                "event_type": LearningEventType.LESSON_COMPLETED,
                "input_length": 0,
                "hint_count": 0,
                "retry_count": 0,
                "completed": True,
            },
            format="json",
        )
        # 終えた回は、何が増えたかを返す
        assert response.status_code == 200

    def test_it_arrives_after_three(self, api_client):
        course, _ = Course.objects.get_or_create(slug="c1", defaults={"title": "c1"})
        for number, slug in enumerate(["a", "b", "c"], start=1):
            Lesson.objects.create(
                course=course, slug=slug, number=number, title=slug, goal="g"
            )

        for slug in ["a", "b"]:
            self._finish(api_client, slug)
        keys = list(
            LearningSession.objects.values_list("learner_key", flat=True).distinct()
        )
        assert not XpEvent.objects.filter(kind=XpKind.COURSE_CHECKPOINT).exists()

        self._finish(api_client, "c")

        checkpoint = XpEvent.objects.get(kind=XpKind.COURSE_CHECKPOINT)
        assert checkpoint.source_id == "c1:3"
        assert xp_module.total_xp(keys) == 20 * 3 + 30

    def test_redoing_a_lesson_does_not_add_another(self, api_client):
        course, _ = Course.objects.get_or_create(slug="c1", defaults={"title": "c1"})
        for number, slug in enumerate(["a", "b", "c"], start=1):
            Lesson.objects.create(
                course=course, slug=slug, number=number, title=slug, goal="g"
            )

        for slug in ["a", "b", "c", "c"]:
            self._finish(api_client, slug)

        assert XpEvent.objects.filter(kind=XpKind.COURSE_CHECKPOINT).count() == 1

    def test_lessons_of_another_course_do_not_count(self, api_client):
        one = Course.objects.create(slug="c1", title="c1")
        two = Course.objects.create(slug="c2", title="c2")
        Lesson.objects.create(course=one, slug="a", number=1, title="a", goal="g")
        Lesson.objects.create(course=one, slug="b", number=2, title="b", goal="g")
        Lesson.objects.create(course=two, slug="x", number=1, title="x", goal="g")

        for slug in ["a", "b", "x"]:
            self._finish(api_client, slug)

        assert not XpEvent.objects.filter(kind=XpKind.COURSE_CHECKPOINT).exists()

    def test_a_lesson_outside_the_catalog_does_not_crash(self, api_client):
        """旧いid や、まだ教材を入れていない環境でも落とさない。"""
        self._finish(api_client, "rewrite_text_001")

        assert not XpEvent.objects.filter(kind=XpKind.COURSE_CHECKPOINT).exists()

    def test_it_counts_every_device(self, api_client):
        """いまの端末だけで数えると、節目がいつまでも来ない。"""
        course = Course.objects.create(slug="c1", title="c1")
        for number, slug in enumerate(["a", "b", "c"], start=1):
            Lesson.objects.create(
                course=course, slug=slug, number=number, title=slug, goal="g"
            )

        user = User.objects.create_user(username="a@example.com", password="x" * 12)
        other = uuid.uuid4()
        LearnerIdentity.objects.create(user=user, learner_key=other)
        for slug in ["a", "b"]:
            LearningSession.objects.create(
                learner_key=other,
                lesson_id=slug,
                completed_at=timezone.now(),
            )

        api_client.force_authenticate(user=user)
        self._finish(api_client, "c")

        assert XpEvent.objects.filter(kind=XpKind.COURSE_CHECKPOINT).count() == 1
