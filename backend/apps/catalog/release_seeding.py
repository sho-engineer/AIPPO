"""第1リリースの2コースと追加Lessonを揃える。

教材本文はLessonに一度だけ持ち、複数コースでの再利用は
LearningPathLessonの参照で行う。何度実行しても同じ状態になる。
"""

from __future__ import annotations

from typing import Any

from apps.catalog.models import (
    AccessType,
    AvailabilityStatus,
    Course,
    Lesson,
    LessonTemplate,
    PublishStatus,
)

START_COURSE = "first_step_7days"
PRACTICAL_COURSE = "ai_practical"


def _lesson(
    slug: str,
    title: str,
    goal: str,
    action: str,
    source_key: str,
    source_text: str,
    quick_key: str,
    quick_options: list[dict[str, str]],
    defaults: dict[str, str],
    inputs: dict[str, str],
    *,
    thumbnail: str = "",
    minutes: int = 8,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "slug": slug,
        "title": title,
        "goal": goal,
        "action": action,
        "source_key": source_key,
        "sample_text": source_text,
        "quick_key": quick_key,
        "quick_options": quick_options,
        "quick_defaults": defaults,
        "inputs": inputs,
        "thumbnail": thumbnail,
        "minutes": minutes,
        "tags": tags or [],
    }


ADDED_LESSONS = (
    _lesson(
        "brainstorm_ideas",
        "アイデアを広げる",
        "数と条件を伝えて、使えるアイデアを広げられるようになる",
        "brainstorm",
        "topic",
        "社内の交流を増やす小さな企画",
        "audience",
        [
            {"value": "同じ部署の人", "label": "同じ部署"},
            {"value": "会社全体", "label": "会社全体"},
            {"value": "お客様", "label": "お客様"},
        ],
        {"constraints": "費用をかけず、30分以内", "count": "5個"},
        {
            "source_text": "topic",
            "audience": "audience",
            "constraints": "constraints",
            "count": "count",
        },
        thumbnail="/assets/final-thumbnails/start_04.webp",
        tags=["ideas", "planning"],
    ),
    _lesson(
        "organize_information",
        "情報を整理する",
        "バラバラな情報を、目的に合う見出しへ分けられるようになる",
        "organize",
        "original_text",
        "新機能が分かりにくい。検索は便利。料金の説明が欲しい。操作が少し難しい。",
        "purpose",
        [
            {"value": "チームで共有する", "label": "チームで共有"},
            {"value": "改善案を決める", "label": "改善案を決める"},
            {"value": "質問へ答える", "label": "質問へ答える"},
        ],
        {"categories": "良い点・困りごと・要望", "format": "見出しと箇条書き"},
        {
            "source_text": "original_text",
            "purpose": "purpose",
            "categories": "categories",
            "format": "format",
        },
        thumbnail="/assets/final-thumbnails/start_06.webp",
        tags=["organizing", "research"],
    ),
    _lesson(
        "organize_meeting",
        "会議の内容を整理する",
        "会議メモを、決定事項・担当・期限に整理できるようになる",
        "organize",
        "original_text",
        "来月の展示会。田中さんが会場へ確認。資料は金曜までに佐藤さんが初稿を作る。予算は次回確認。",
        "purpose",
        [
            {"value": "参加者へ共有する", "label": "参加者へ共有"},
            {"value": "上司へ報告する", "label": "上司へ報告"},
            {"value": "自分のタスクを確認する", "label": "自分のタスク"},
        ],
        {"categories": "決定事項・担当・期限・未決事項", "format": "箇条書き"},
        {
            "source_text": "original_text",
            "purpose": "purpose",
            "categories": "categories",
            "format": "format",
        },
        tags=["meeting", "organizing"],
        thumbnail="/assets/final-thumbnails/practical_03.webp",
    ),
    _lesson(
        "work_email_chat",
        "メールやチャットを作る",
        "相手と目的を伝え、そのまま送れる文章を作れるようになる",
        "rewrite",
        "original_text",
        "来週の打ち合わせを火曜か水曜に変更したい。都合を確認したい。",
        "audience",
        [
            {"value": "上司", "label": "上司"},
            {"value": "同僚", "label": "同僚"},
            {"value": "顧客", "label": "顧客"},
        ],
        {"tone": "ていねいに", "length": "短め"},
        {
            "source_text": "original_text",
            "audience": "audience",
            "tone": "tone",
            "length": "length",
        },
        thumbnail="/assets/final-thumbnails/practical_02.webp",
        tags=["writing", "email"],
    ),
    _lesson(
        "extract_needed_info",
        "長い資料から必要な情報を抜き出す",
        "立場と目的を指定し、必要な情報だけを取り出せるようになる",
        "summarize",
        "original_text",
        "新制度は10月開始。申請は各部署の責任者が月末までに行う。対象は正社員と契約社員。詳しい操作説明会は9月15日。",
        "purpose",
        [
            {"value": "自分がやることを知るため", "label": "自分の作業"},
            {"value": "上司へ共有するため", "label": "上司へ共有"},
            {"value": "日付だけ確認するため", "label": "日付を確認"},
        ],
        {"format": "必要な点を箇条書き", "length": "5行以内"},
        {
            "source_text": "original_text",
            "purpose": "purpose",
            "format": "format",
            "length": "length",
        },
        thumbnail="/assets/final-thumbnails/practical_04.webp",
        tags=["summarizing", "documents"],
    ),
    _lesson(
        "organize_research",
        "リサーチ結果を整理する",
        "集めた情報を観点別に整理し、不明点を残せるようになる",
        "organize",
        "original_text",
        "A案は導入が早い。B案は費用が低い。A案の保守費は未確認。利用者からは操作性を重視する声が多い。",
        "purpose",
        [
            {"value": "比較材料にする", "label": "比較材料"},
            {"value": "報告書にする", "label": "報告書"},
            {"value": "追加調査を決める", "label": "追加調査"},
        ],
        {"categories": "分かったこと・未確認・次に調べること", "format": "見出しと箇条書き"},
        {
            "source_text": "original_text",
            "purpose": "purpose",
            "categories": "categories",
            "format": "format",
        },
        tags=["research", "organizing"],
        thumbnail="/assets/final-thumbnails/practical_05.webp",
    ),
    _lesson(
        "make_document_outline",
        "資料の構成を作る",
        "目的と期限から、資料作成の順番と構成を作れるようになる",
        "plan",
        "goal",
        "新しい社内制度を5分で説明する資料を作る",
        "deadline",
        [
            {"value": "今日中", "label": "今日中"},
            {"value": "今週中", "label": "今週中"},
            {"value": "1か月", "label": "1か月"},
        ],
        {"available_time": "1日30分", "avoid": "専門用語を増やさない"},
        {
            "source_text": "goal",
            "deadline": "deadline",
            "available_time": "available_time",
            "avoid": "avoid",
        },
        thumbnail="/assets/final-thumbnails/practical_10.webp",
        tags=["planning", "documents"],
    ),
    _lesson(
        "transcription_use",
        "文字起こしを活用する",
        "文字起こし結果から、要点と次の行動をまとめられるようになる",
        "summarize",
        "original_text",
        "ええと、次回は木曜で。資料は前日までに共有します。担当は私です。あと会場はまだ決まっていません。",
        "purpose",
        [
            {"value": "議事録にするため", "label": "議事録"},
            {"value": "タスクを確認するため", "label": "タスク確認"},
            {"value": "人へ共有するため", "label": "共有文"},
        ],
        {"format": "決定・担当・期限・未決を箇条書き", "length": "8行以内"},
        {
            "source_text": "original_text",
            "purpose": "purpose",
            "format": "format",
            "length": "length",
        },
        tags=["meeting", "summarizing"],
        thumbnail="/assets/final-thumbnails/start_09.webp",
    ),
)


def _upsert_lesson(course: Course, number: int, entry: dict[str, Any]) -> Lesson:
    lesson, _ = Lesson.objects.update_or_create(
        slug=entry["slug"],
        defaults={
            "course": course,
            "number": number,
            "title": entry["title"],
            "goal": entry["goal"],
            "template": LessonTemplate.OUTCOME_FIRST,
            "outcome_title": entry["title"],
            "outcome_description": entry["goal"],
            "estimated_minutes": entry["minutes"],
            "before_example": entry["sample_text"],
            "after_example": "目的に合わせて、読みやすい形に整理された結果",
            "learned_skills": [entry["goal"]],
            "outcomes": [entry["goal"]],
            "tags": entry["tags"],
            "thumbnail": entry["thumbnail"],
            "uses_ai": True,
            "ai_action": {"action": entry["action"], "inputs": entry["inputs"]},
            "sample_text": entry["sample_text"],
            "quick_title": "まず、使う場面を1つ選びます",
            "quick_instruction": "いちばん近いものを選んでください。",
            "quick_key": entry["quick_key"],
            "quick_options": entry["quick_options"],
            "quick_defaults": entry["quick_defaults"],
            "working": "条件に合わせて、AIが結果を作っています。",
            "observation_options": [
                {"value": "見やすくなった", "label": "見やすくなった"},
                {"value": "要点が分かった", "label": "要点が分かった"},
                {"value": "まだ直したい", "label": "まだ直したい"},
            ],
            "concept_cards": [
                {
                    "title": "目的を先に伝える",
                    "body": "同じ情報でも、誰が何に使うかで必要な形は変わります。",
                    "visual": "highlight",
                    "highlight": "何に使うか",
                },
                {
                    "title": "形も指定する",
                    "body": "見出しや箇条書きを指定すると、そのまま確認しやすくなります。",
                    "visual": "text",
                },
            ],
            "review_points": ["元にない内容が足されていない", "目的に合う形になっている"],
            "real_task_label": "自分の内容を入れて試してください。",
            "real_task_placeholder": "ここに自分の内容を入力",
            "takeaway": "目的・相手・出力の形を伝えると、仕事で使える結果に近づきます。",
            "next_suggestion": "できました。次のLessonでも同じ考え方を使えます。",
            "status": PublishStatus.PUBLISHED,
            "availability_status": AvailabilityStatus.AVAILABLE,
            "sort_order": number,
        },
    )
    if lesson.published_at is None:
        lesson.mark_published()
        lesson.save(update_fields=["published_at"])
    return lesson


def seed_first_release(*, only_new: bool = False) -> tuple[Course, Course]:
    if only_new:
        return (
            Course.objects.get(slug=START_COURSE),
            Course.objects.get(slug=PRACTICAL_COURSE),
        )
    start = Course.objects.get(slug=START_COURSE)
    start.title = "AIスタートコース"
    start.description = "AIを怖がらず、仕事で使うための基本を一つずつ身につけます。"
    start.access_type = AccessType.FREE
    start.status = PublishStatus.PUBLISHED
    start.availability_status = AvailabilityStatus.AVAILABLE
    start.sort_order = 0
    start.save()

    start_order = {
        "diagnosis": (0, "AI活用診断"),
        "improve_answer": (1, "AIへの頼み方"),
        "rewrite_text": (2, "文章をわかりやすくする"),
        "summarize_text": (3, "長い文章を短くまとめる"),
        "explain_topic": (4, "わからないことを説明してもらう"),
        "compare_options": (6, "選択肢を比較する"),
        "make_plan": (8, "計画を立てる"),
    }
    for slug, (number, title) in start_order.items():
        Lesson.objects.filter(slug=slug).update(
            course=start, number=number, title=title, sort_order=number
        )
    start_thumbnails = {
        "improve_answer": "/assets/final-thumbnails/practical_01.webp",
        "rewrite_text": "/assets/final-thumbnails/start_01.webp",
        "summarize_text": "/assets/final-thumbnails/start_02.webp",
        "explain_topic": "/assets/final-thumbnails/start_03.webp",
        "compare_options": "/assets/final-thumbnails/start_05.webp",
        "make_plan": "/assets/final-thumbnails/start_12.webp",
    }
    for slug, thumbnail in start_thumbnails.items():
        Lesson.objects.filter(slug=slug).update(thumbnail=thumbnail)
    legacy, _ = Course.objects.get_or_create(
        slug="foundation_legacy",
        defaults={
            "title": "旧スタート教材",
            "description": "過去の進捗を保持するための非公開教材",
            "status": PublishStatus.ARCHIVED,
            "availability_status": AvailabilityStatus.COMING_SOON,
            "sort_order": 99,
        },
    )
    Lesson.objects.filter(slug__in=("use_ai_safely", "final_challenge")).update(
        course=legacy, status=PublishStatus.ARCHIVED
    )
    _upsert_lesson(start, 5, ADDED_LESSONS[0])
    _upsert_lesson(start, 7, ADDED_LESSONS[1])

    practical, _ = Course.objects.update_or_create(
        slug=PRACTICAL_COURSE,
        defaults={
            "title": "AI活用コース",
            "description": "基本スキルを、会議・メール・資料づくりなど実際の仕事へ組み合わせます。",
            "difficulty": "intermediate",
            "access_type": AccessType.FREE,
            "status": PublishStatus.PUBLISHED,
            "availability_status": AvailabilityStatus.AVAILABLE,
            "sort_order": 1,
        },
    )
    for number, entry in enumerate(ADDED_LESSONS[2:], start=1):
        _upsert_lesson(practical, number, entry)

    Lesson.objects.update_or_create(
        slug="combine_ai_skills",
        defaults={
            "course": practical,
            "number": 7,
            "title": "複数のAIスキルを組み合わせる",
            "goal": "要約・整理・文章作成を順番に使う考え方を身につける",
            "template": LessonTemplate.CUSTOM,
            "estimated_minutes": 9,
            "outcomes": ["作業を小さく分けられる", "適切なLessonを順番に使える"],
            "tags": ["workflow", "recipe"],
            "uses_ai": False,
            "status": PublishStatus.PUBLISHED,
            "availability_status": AvailabilityStatus.COMING_SOON,
            "coming_soon_message": "実務Recipeと一緒に準備しています",
            "thumbnail": "/assets/final-thumbnails/practical_12.webp",
            "sort_order": 7,
        },
    )
    Lesson.objects.update_or_create(
        slug="practical_recipe",
        defaults={
            "course": practical,
            "number": 8,
            "title": "実務Recipeを使う",
            "goal": "複数Lessonを組み合わせた手順を仕事で使う",
            "template": LessonTemplate.CUSTOM,
            "estimated_minutes": 8,
            "outcomes": ["Recipeから必要なスキルへ戻れる"],
            "tags": ["recipe"],
            "uses_ai": False,
            "status": PublishStatus.PUBLISHED,
            "availability_status": AvailabilityStatus.COMING_SOON,
            "coming_soon_message": "実務Recipeを準備しています",
            "thumbnail": "/assets/final-thumbnails/practical_01.webp",
            "sort_order": 8,
        },
    )
    Lesson.objects.update_or_create(
        slug="image_generation",
        defaults={
            "course": practical,
            "number": 9,
            "title": "画像生成を試す",
            "goal": "言葉から画像を作る基本を知る",
            "template": LessonTemplate.CUSTOM,
            "estimated_minutes": 8,
            "thumbnail": "/assets/final-thumbnails/practical_09.webp",
            "outcomes": ["画像生成の頼み方を知る"],
            "tags": ["image"],
            "uses_ai": True,
            "status": PublishStatus.PUBLISHED,
            "availability_status": AvailabilityStatus.COMING_SOON,
            "coming_soon_message": "画像生成機能を準備しています",
            "sort_order": 9,
        },
    )

    # 第1リリースでは主役を2本に絞る。過去の予告コースは削除せず非表示にする。
    Course.objects.exclude(slug__in=(START_COURSE, PRACTICAL_COURSE)).update(
        status=PublishStatus.ARCHIVED
    )
    return start, practical
