"""見張っている出来事（Analytics 14種）。

守りたいこと
------------
- 14種すべてが、送っても 400 で捨てられないこと
  （前に一度、画面を作り直したときに足すのを忘れ、送られてくるのに
  400 で捨てていた。捨てても画面は止まらないので誰も気づかず、
  **レッスンの前半だけ記録が空**という状態になっていた）
- サーバー側で判定するもの（技・XP・節目・送れた再設定）は、
  画面から送られなくても残ること
- レッスンの外の記録が、架空のセッションを作らないこと
- 消すときに、置き去りにならないこと
"""

from __future__ import annotations

import pathlib
import re
import uuid

import pytest
from django.contrib.auth import get_user_model

from apps.accounts.models import LearnerIdentity
from apps.catalog.models import Course, Lesson
from apps.lessons.models import LearningEvent, LearningEventType, LearningSession
from apps.rewards.models import AiSkill, AiSkillLesson

pytestmark = pytest.mark.django_db

User = get_user_model()

#: 要件が挙げている14種。名前も綴りもここで固定する。
REQUIRED = [
    "signup_started",
    "signup_completed",
    "google_auth_failed",
    "passkey_registration_failed",
    "password_reset_requested",
    "password_reset_sent",
    "lesson_started",
    "mission_completed",
    "ai_skill_acquired",
    "xp_earned",
    "lesson_completed",
    "artifact_saved",
    "skill_dictionary_opened",
    "course_checkpoint_completed",
]


class TestTheEventNames:
    def test_all_fourteen_exist(self):
        known = {value for value, _label in LearningEventType.choices}
        missing = [name for name in REQUIRED if name not in known]
        assert missing == [], f"送っても捨てられる: {missing}"

    @pytest.mark.parametrize("event_type", REQUIRED)
    def test_none_of_them_is_thrown_away(self, api_client, event_type):
        """400 で捨てられないこと。

        捨てても画面は止まらないので、壊れても誰も気づかない。
        いちばん気づきにくい壊れ方なので、1つずつ通しておく。
        """
        response = api_client.post(
            "/api/learning-events/",
            {"lesson_id": "", "event_type": event_type},
            format="json",
        )

        assert response.status_code == 204
        assert LearningEvent.objects.filter(event_type=event_type).exists()


class TestTheFrontendOnlySendsNamesWeKnow:
    """画面が送る名前が、こちらの一覧に**全部**あること。

    無い名前を送ると 400 で捨てられる。捨てても画面は止まらないので、
    気づくのは集計を見たとき——実際に5種類がそうなっていた。

    上の REQUIRED は「要件が挙げた14種」を固定するもので、
    画面側が名前を足したかどうかは見ていない。ここでは
    **画面のファイルそのもの**を読んで突き合わせる。片側だけ増えた
    瞬間に落ちる。
    """

    FRONTEND = pathlib.Path(__file__).resolve().parents[2] / "frontend/src"
    SOURCE = FRONTEND / "lib/analytics.ts"
    #: ステップの種類ごとの記録名。**画面側の名前の置き場は2つある。**
    #:
    #: 片方だけ見ていると、もう片方に足された名前が黙って捨てられる。
    #: 実際 `compare_viewed` はこちらに足した。
    STEP_SOURCE = FRONTEND / "course/useCourseLesson.ts"

    def _names(self, path: pathlib.Path, pattern: str) -> list[str]:
        text = path.read_text(encoding="utf-8")
        block = re.search(pattern, text, re.S)
        assert block, f"{path.name} の形が変わった。この検査も直すこと"
        return re.findall(r':\s*"([a-z0-9_]+)"', block.group(1))

    def test_every_name_the_screen_sends_is_known(self):
        names = self._names(
            self.SOURCE, r"export const EVENTS = \{(.*?)\n\} as const;"
        )
        # 形が変わって0件になっても素通りしないこと
        assert len(names) >= 8, f"名前を読み取れていない: {names}"

        known = {value for value, _label in LearningEventType.choices}
        unknown = sorted(set(names) - known)
        assert unknown == [], f"画面が送るのに、こちらが知らない名前: {unknown}"

    def test_the_step_names_are_known_too(self):
        """ステップの種類ごとの名前も、同じように突き合わせる。

        `EVENTS` だけを見ていた。ステップ側に足した名前は素通りして、
        送られてくるのに 400 で捨てられる——`EVENTS` で一度起きたのと
        まったく同じことが、もう1か所で起きうる状態だった。
        """
        names = self._names(
            self.STEP_SOURCE, r"const STEP_EVENT: Record<string, string> = \{(.*?)\n\};"
        )
        assert len(names) >= 5, f"名前を読み取れていない: {names}"

        known = {value for value, _label in LearningEventType.choices}
        unknown = sorted(set(names) - known)
        assert unknown == [], f"画面が送るのに、こちらが知らない名前: {unknown}"


class TestEventsOutsideALesson:
    def test_they_do_not_create_a_fake_session(self, api_client):
        """架空のセッションを作らない。

        作ると、学習の数え上げ（何本進めたか）に中身の無い1本が混ざる。
        """
        api_client.post(
            "/api/learning-events/",
            {"lesson_id": "", "event_type": "skill_dictionary_opened"},
            format="json",
        )

        assert LearningSession.objects.count() == 0
        event = LearningEvent.objects.get()
        assert event.session is None
        assert event.learner_key is not None

    def test_a_lesson_event_still_gets_a_session(self, api_client):
        api_client.post(
            "/api/learning-events/",
            {"lesson_id": "rewrite_text", "event_type": "lesson_started"},
            format="json",
        )

        assert LearningSession.objects.count() == 1
        assert LearningEvent.objects.get().session is not None


class TestWhatTheServerDecides:
    """技・XP・節目は、画面から送らせない（設計方針 §36）。

    画面から送らせると、送られてこなかった回と起きなかった回の
    区別が付かなくなる。
    """

    def _finish(self, client, lesson_slug: str) -> None:
        assert (
            client.post(
                "/api/learning-events/",
                {
                    "lesson_id": lesson_slug,
                    "event_type": LearningEventType.LESSON_COMPLETED,
                    "completed": True,
                },
                format="json",
            ).status_code
            == 200
        )

    def test_skill_and_xp_are_recorded_by_the_server(self, api_client):
        course = Course.objects.create(slug="c1", title="c1")
        lesson = Lesson.objects.create(
            course=course, slug="rewrite_text", number=1, title="t", goal="g"
        )
        skill = AiSkill.objects.create(slug="tone", name="トーン指定", one_line="x")
        AiSkillLesson.objects.create(skill=skill, lesson=lesson)

        self._finish(api_client, "rewrite_text")

        assert LearningEvent.objects.filter(event_type="ai_skill_acquired").count() == 1
        xp = LearningEvent.objects.get(event_type="xp_earned")
        # レッスン1本 20 + 技1つ 10
        assert xp.input_length == 30

    def test_redoing_a_lesson_records_no_xp(self, api_client):
        """やり直しでは増えないので、0 の行を残さない。

        残すと「XPが増えた回数」を数えたときに、実際より多く出る。
        """
        course = Course.objects.create(slug="c1", title="c1")
        Lesson.objects.create(
            course=course, slug="rewrite_text", number=1, title="t", goal="g"
        )

        self._finish(api_client, "rewrite_text")
        self._finish(api_client, "rewrite_text")

        assert LearningEvent.objects.filter(event_type="xp_earned").count() == 1

    def test_the_checkpoint_is_recorded(self, api_client):
        course = Course.objects.create(slug="c1", title="c1")
        for number, slug in enumerate(["a", "b", "c"], start=1):
            Lesson.objects.create(
                course=course, slug=slug, number=number, title=slug, goal="g"
            )

        for slug in ["a", "b", "c"]:
            self._finish(api_client, slug)

        event = LearningEvent.objects.get(event_type="course_checkpoint_completed")
        assert event.input_length == 3


class TestPasswordResetSent:
    def test_it_is_recorded_only_when_it_actually_went_out(self, api_client, settings):
        """押した回（画面側）と、送れた回（ここ）を対にする。

        離れていれば送り口が壊れている。画面には出せない
        （登録の有無が漏れる）ので、ここでしか見えない。
        """
        settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
        User.objects.create_user(username="a@example.com", email="a@example.com", password="x" * 12)

        api_client.post(
            "/api/v1/accounts/password/reset/", {"email": "a@example.com"}, format="json"
        )

        assert LearningEvent.objects.filter(event_type="password_reset_sent").count() == 1

    def test_nothing_is_recorded_for_an_unknown_address(self, api_client):
        """登録が無いときは残さない。

        残すと、記録を見れば登録済みかどうかが分かってしまう。
        """
        api_client.post(
            "/api/v1/accounts/password/reset/",
            {"email": "nobody@example.com"},
            format="json",
        )

        assert not LearningEvent.objects.filter(event_type="password_reset_sent").exists()

    def test_it_does_not_keep_the_address(self, api_client, settings):
        settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
        User.objects.create_user(username="a@example.com", email="a@example.com", password="x" * 12)

        api_client.post(
            "/api/v1/accounts/password/reset/", {"email": "a@example.com"}, format="json"
        )

        event = LearningEvent.objects.get(event_type="password_reset_sent")
        assert "a@example.com" not in str(event.__dict__)


class TestCleaningUp:
    def test_account_events_go_with_the_learning_data(self, api_client):
        """セッションに繋がっていない記録が置き去りにならないこと。"""
        user = User.objects.create_user(username="a@example.com", password="x" * 12)
        key = uuid.uuid4()
        LearnerIdentity.objects.create(user=user, learner_key=key)
        LearningEvent.objects.create(
            session=None, learner_key=key, event_type="skill_dictionary_opened"
        )

        api_client.force_authenticate(user=user)
        response = api_client.post("/api/v1/accounts/learning-data/delete/")

        assert response.status_code == 200
        assert not LearningEvent.objects.filter(learner_key=key).exists()
