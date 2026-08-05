"""教材を管理画面から編集・公開する。

教材追加そのものが運営の中心になるので、コードを触らずに
足せる状態にしておく。凝った教材ビルダーは作らない。
Django Admin の素の形で足りる。

置き方の決まり
--------------
- Lesson の編集画面に、その教材のステップを並べる（行き来させない）
- 骨格型では、ステップ行は「上書き」と「差し込み」だけ。
  19ステップぶんの行は持たない（models.py に理由を書いた）
- 「始められる」に変えるときは検査を通す（validation.py）
"""

from __future__ import annotations

from django.contrib import admin, messages
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from apps.catalog.models import (
    AvailabilityStatus,
    Course,
    Lesson,
    LessonStep,
    PublishStatus,
)
from apps.catalog.validation import validate_for_release


class LessonStepInline(admin.StackedInline):
    """レッスンの編集画面に、そのステップを並べる。

    横並び（Tabular）にしない。1行に20項目あると、
    どれが何なのか分からなくなる。
    """

    model = LessonStep
    extra = 0
    ordering = ("sort_order", "id")

    fields = (
        ("placement", "step_key", "sort_order"),
        ("step_type", "phase"),
        ("title", "instruction"),
        ("po_message", "po_emotion"),
        ("input_key", "placeholder"),
        "options",
        "ai_action",
        "validation_rules",
        "card",
        "meta",
        ("is_required", "is_skippable"),
        ("example", "hints", "skill"),
    )

    classes = ("collapse",)


class LessonInline(admin.TabularInline):
    """コースの編集画面に、レッスンの一覧を出す。並び替え用。"""

    model = Lesson
    extra = 0
    fields = ("number", "title", "slug", "status", "availability_status", "sort_order")
    readonly_fields = ("title", "slug")
    show_change_link = True
    ordering = ("sort_order", "number")


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("title", "slug", "access_type", "status", "lesson_count", "sort_order")
    list_filter = ("status", "access_type")
    search_fields = ("title", "slug")
    prepopulated_fields = {"slug": ("title",)}
    inlines = (LessonInline,)

    @admin.display(description="レッスン数")
    def lesson_count(self, course: Course) -> int:
        return course.lessons.count()


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = (
        "number",
        "title",
        "course",
        "template",
        "status",
        "availability_badge",
        "step_count",
        "sort_order",
    )
    list_filter = ("course", "status", "availability_status", "template", "difficulty")
    search_fields = ("title", "slug", "goal")
    prepopulated_fields = {"slug": ("title",)}
    inlines = (LessonStepInline,)
    actions = ("duplicate_lessons", "make_available", "make_coming_soon")

    fieldsets = (
        (
            None,
            {
                "fields": (
                    ("course", "number", "sort_order"),
                    ("title", "slug"),
                    "goal",
                    ("template", "difficulty", "uses_ai", "mode"),
                )
            },
        ),
        (
            "公開",
            {
                "fields": (
                    ("status", "availability_status"),
                    ("planned_release_date", "coming_soon_message"),
                    ("is_preview", "version", "published_at"),
                    "release_check",
                    "preview_link",
                )
            },
        ),
        (
            "完成イメージ",
            {
                "fields": (
                    ("outcome_title", "estimated_minutes"),
                    "outcome_description",
                    "before_example",
                    "after_example",
                    "learned_skills",
                    ("outcomes", "tags"),
                )
            },
        ),
        (
            "骨格（成果物ファースト型のときだけ使う）",
            {
                "classes": ("collapse",),
                "description": (
                    "ここを埋めると、19前後のステップが自動で組み上がります。"
                    "自由型では使いません。"
                ),
                "fields": (
                    "ai_action",
                    "sample_text",
                    ("quick_title", "quick_key"),
                    "quick_instruction",
                    "quick_options",
                    "quick_defaults",
                    "working",
                    "observation_options",
                    "concept_cards",
                    "review_points",
                    ("real_task_label", "real_task_placeholder"),
                    ("takeaway", "next_suggestion", "fact_check"),
                ),
            },
        ),
    )
    readonly_fields = ("published_at", "release_check", "preview_link")

    # ------------------------------------------------------------ 表示

    @admin.display(description="利用可能", ordering="availability_status")
    def availability_badge(self, lesson: Lesson) -> str:
        if lesson.availability_status == AvailabilityStatus.AVAILABLE:
            return mark_safe('<b style="color:#0B5FD0">始められる</b>')
        return mark_safe('<span style="color:#8A6200">近日公開</span>')

    @admin.display(description="ステップ数")
    def step_count(self, lesson: Lesson) -> str:
        """組み上がった数と、手で持っている行の数を並べて出す。

        骨格型では両者が食い違うのが正しい（19組み上がって、行は2つなど）。
        片方だけ見せると、行が少ないことを不備だと誤解される。
        """
        from apps.catalog.expand import lesson_to_dict

        try:
            built = len(lesson_to_dict(lesson)["steps"])
        except Exception:  # noqa: BLE001
            return "組み立てに失敗"
        return f"{built}（うち手書き {lesson.steps.count()}）"

    @admin.display(description="公開前チェック")
    def release_check(self, lesson: Lesson) -> str:
        """いま公開してよいかを、その場で見せる。

        保存を試すまで分からないと、書いている途中で不安になる。
        """
        if lesson.pk is None:
            return "保存すると検査します。"

        problems = validate_for_release(lesson)
        if not problems:
            return mark_safe(
                '<b style="color:#0B5FD0">問題ありません。'
                "「始められる」に変えられます。</b>"
            )
        items = "".join(f"<li>{problem}</li>" for problem in problems)
        return mark_safe(
            '<b style="color:#A8480A">直すところがあります：</b>'
            f'<ul style="margin:.4em 0 0 1em">{items}</ul>'
        )

    @admin.display(description="プレビュー")
    def preview_link(self, lesson: Lesson) -> str:
        """利用者向けの画面で確かめる。

        管理画面の中に別の再生装置を作らない。作ると、本物の画面と
        少しずつずれて、プレビューで見たものと違うものが公開される。
        """
        if lesson.pk is None:
            return "保存すると出ます。"

        from django.conf import settings

        base = getattr(settings, "FRONTEND_URL", "") or "http://localhost:5173"
        url = f"{base}/?preview={lesson.slug}"
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">利用者の画面で開く</a>'
            "<br><small>モックAIで動きます。"
            "幅を変えるとスマートフォン表示も確かめられます。</small>",
            url,
        )

    # ------------------------------------------------------------ 保存時の検査

    def save_model(self, request, obj: Lesson, form, change) -> None:
        """「始められる」へ変えるときは、検査を通す。

        不備があれば近日公開へ戻し、何を直せばよいかを画面に出す。
        止めずに通すと、行き止まりのある教材が学習者に届く。
        """
        going_live = obj.availability_status == AvailabilityStatus.AVAILABLE

        # 検査には組み上げた並びが要るので、いったん保存してから見る
        super().save_model(request, obj, form, change)

        if not going_live:
            return

        problems = validate_for_release(obj)
        if problems:
            Lesson.objects.filter(pk=obj.pk).update(
                availability_status=AvailabilityStatus.COMING_SOON
            )
            obj.availability_status = AvailabilityStatus.COMING_SOON
            self.message_user(
                request,
                "直すところがあるため「近日公開」に戻しました：" + " / ".join(problems),
                level=messages.ERROR,
            )
            return

        if obj.status == PublishStatus.PUBLISHED and obj.published_at is None:
            Lesson.objects.filter(pk=obj.pk).update(published_at=obj.updated_at)

    # ------------------------------------------------------------ 一括操作

    @admin.action(description="選んだレッスンを複製する（下書きとして）")
    def duplicate_lessons(self, request, queryset) -> None:
        """既存の教材を写して、中身だけ変えて新しい教材にする。

        写したものは必ず**下書き・近日公開**で作る。
        複製した瞬間に公開されると、書きかけが学習者に届く。
        """
        made = 0
        for lesson in queryset:
            steps = list(lesson.steps.all())

            lesson.pk = None
            lesson.slug = self._free_slug(lesson.slug)
            lesson.title = f"{lesson.title}（複製）"
            lesson.status = PublishStatus.DRAFT
            lesson.availability_status = AvailabilityStatus.COMING_SOON
            lesson.published_at = None
            lesson.version = 1
            lesson.save()

            for step in steps:
                step.pk = None
                step.lesson = lesson
                step.save()

            made += 1

        self.message_user(request, f"{made}件を下書きとして複製しました。")

    @staticmethod
    def _free_slug(base: str) -> str:
        candidate = f"{base}_copy"
        index = 2
        while Lesson.objects.filter(slug=candidate).exists():
            candidate = f"{base}_copy{index}"
            index += 1
        return candidate

    @admin.action(description="「始められる」に変える（検査あり）")
    def make_available(self, request, queryset) -> None:
        opened = 0
        for lesson in queryset:
            problems = validate_for_release(lesson)
            if problems:
                self.message_user(
                    request,
                    f"{lesson.title}: " + " / ".join(problems),
                    level=messages.ERROR,
                )
                continue
            lesson.availability_status = AvailabilityStatus.AVAILABLE
            lesson.save(update_fields=["availability_status"])
            opened += 1

        if opened:
            self.message_user(request, f"{opened}件を「始められる」に変えました。")

    @admin.action(description="「近日公開」に戻す")
    def make_coming_soon(self, request, queryset) -> None:
        count = queryset.update(availability_status=AvailabilityStatus.COMING_SOON)
        self.message_user(request, f"{count}件を「近日公開」に戻しました。")


@admin.register(LessonStep)
class LessonStepAdmin(admin.ModelAdmin):
    """ステップ単体の一覧。

    ふだんはレッスンの編集画面から触る。こちらは
    「あの言い回しはどの教材にあったか」を探すときのため。
    """

    list_display = ("step_key", "lesson", "placement", "step_type", "title", "sort_order")
    list_filter = ("lesson__course", "placement", "step_type")
    search_fields = ("step_key", "title", "po_message", "lesson__title")
