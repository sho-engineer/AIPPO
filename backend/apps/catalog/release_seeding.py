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

#: AIスタートコースの STEP。
#:
#: 8本を平らに並べると、8回ぶんの一本道に見える。3つに束ねて名前を
#: 付けると「いま何をしている最中か」が言葉で分かる。
#:
#: 診断だけは別扱いにする。**コースの中の1日目ではない。**
#: 始める前に自分の現在地を見るもので、受けなくても Day1 から始められる。
#: Day として数に入れると、受けなかった人の進み具合が最初から欠ける。
STAGES = {
    "orientation": ("orientation", "現在地チェック"),
    "ask": ("ask", "AIに頼んでみる"),
    "think": ("think", "AIと考える"),
    "create": ("create", "AIで作る"),
}

#: AIスタートコースの並び。slug → (番号, 題, STEP)。
#:
#: 番号は画面の「Day n」。診断だけ 0 で、Day としては出さない。
#:
#: 「AIへの頼み方」(improve_answer) と「計画を立てる」(make_plan) は
#: ここから外した。**消してはいない**——本文も、それで覚えた技も
#: 残したまま AI活用コースへ移す（下の PRACTICAL_MOVED_IN）。
#: 消すと、終えた人の記録が行き先を失う。
START_CURRICULUM: dict[str, tuple[int, str, str]] = {
    "diagnosis": (0, "AI活用診断", "orientation"),
    "rewrite_text": (1, "文章を分かりやすくする", "ask"),
    "summarize_text": (2, "長い文章を短くまとめる", "ask"),
    "explain_topic": (3, "分からないことを説明してもらう", "ask"),
    "brainstorm_ideas": (4, "アイデアを広げる", "think"),
    "compare_options": (5, "選択肢を比較する", "think"),
    "organize_information": (6, "情報を整理して見やすくする", "think"),
    "image_generation": (7, "AIで画像を作る", "create"),
    "image_edit": (8, "画像を修正する", "create"),
}

#: AIスタートコースから AI活用コースへ移すもの。slug → (番号, 題)。
#:
#: 本文は完成していて、実務向けの並びには収まる。行き先ごと消すと、
#: 終えた人が自分の記録から開けなくなる。
PRACTICAL_MOVED_IN: dict[str, tuple[int, str]] = {
    "improve_answer": (7, "AIへの頼み方"),
    "make_plan": (8, "計画を立てる"),
}


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
    start.description = "AIを仕事や日常で使う基本を、1日ひとつずつ身につけます。"
    start.outcome = (
        "文章・要約・整理・比較・画像まで、AIを仕事や日常で使う基本が身につきます。"
    )
    start.access_type = AccessType.FREE
    start.status = PublishStatus.PUBLISHED
    start.availability_status = AvailabilityStatus.AVAILABLE
    start.sort_order = 0
    start.save()

    start_thumbnails = {
        "rewrite_text": "/assets/final-thumbnails/start_01.webp",
        "summarize_text": "/assets/final-thumbnails/start_02.webp",
        "explain_topic": "/assets/final-thumbnails/start_03.webp",
        "compare_options": "/assets/final-thumbnails/start_05.webp",
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
    _upsert_lesson(start, 4, ADDED_LESSONS[0])
    _upsert_lesson(start, 6, ADDED_LESSONS[1])

    practical, _ = Course.objects.update_or_create(
        slug=PRACTICAL_COURSE,
        defaults={
            "title": "AI活用コース",
            "description": "基本スキルを、会議・メール・資料づくりなど実際の仕事へ組み合わせます。",
            "outcome": "会議・メール・資料づくりなど、日々の仕事にAIを組み込めるようになります。",
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
            "number": 9,
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
            "sort_order": 9,
        },
    )
    Lesson.objects.update_or_create(
        slug="practical_recipe",
        defaults={
            "course": practical,
            "number": 10,
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
            "sort_order": 10,
        },
    )
    """
    STEP 3「AIで作る」の2本。

    どちらも**まだ開けない**。仕組みが無いからではなく、費用の
    見通しを先に立てるため（docs/image-lessons.md）。画像1枚は文章1回の
    数十倍かかり、レッスン1本で最低2枚生成する。

    それでも一覧には出す。コースが「文章で終わる」のか
    「画像まで行く」のかは、始める前に知りたいことで、
    出さずにおくと**あとから足された別物**に見える。
    """
    Lesson.objects.update_or_create(
        slug="image_generation",
        defaults={
            "course": start,
            "number": 7,
            "title": "AIで画像を作る",
            "goal": "作りたいものを言葉で伝えて、1枚目の画像を出せるようになる",
            "template": LessonTemplate.CUSTOM,
            "estimated_minutes": 8,
            "thumbnail": "/assets/final-thumbnails/start_07.webp",
            "outcomes": ["作りたいものを言葉で伝えられる", "雰囲気や構図を指定できる"],
            "tags": ["image"],
            "uses_ai": True,
            "status": PublishStatus.PUBLISHED,
            "availability_status": AvailabilityStatus.COMING_SOON,
            "coming_soon_message": "画像を作る仕組みを準備しています",
            "sort_order": 7,
        },
    )
    Lesson.objects.update_or_create(
        slug="image_edit",
        defaults={
            "course": start,
            "number": 8,
            "title": "画像を修正する",
            "goal": "出てきた画像に条件を足して、思っていたものへ近づけられるようになる",
            "template": LessonTemplate.CUSTOM,
            "estimated_minutes": 8,
            "thumbnail": "/assets/final-thumbnails/start_08.webp",
            "outcomes": ["一度で完成させようとしなくなる", "直したい点を1つずつ伝えられる"],
            "tags": ["image"],
            "uses_ai": True,
            "status": PublishStatus.PUBLISHED,
            "availability_status": AvailabilityStatus.COMING_SOON,
            "coming_soon_message": "画像を作る仕組みを準備しています",
            "sort_order": 8,
        },
    )

    # AIスタートコースから外した2本を、実務側で引き取る。
    # 本文も、それで覚えた技も、終えた記録もそのまま生きる。
    for slug, (number, title) in PRACTICAL_MOVED_IN.items():
        Lesson.objects.filter(slug=slug).update(
            course=practical,
            number=number,
            title=title,
            sort_order=number,
            stage_key="",
            stage_title="",
        )

    """
    並びと STEP は、最後にまとめて当てる。

    上の `_upsert_lesson` / `update_or_create` はそれぞれ自分の番号と題を
    書くので、**あとから当てないと上書きされる**。カリキュラムの姿を
    決めるのは1か所（START_CURRICULUM）だけにする。
    """
    for slug, (number, title, stage) in START_CURRICULUM.items():
        key, stage_title = STAGES[stage]
        Lesson.objects.filter(slug=slug).update(
            course=start,
            number=number,
            title=title,
            sort_order=number,
            stage_key=key,
            stage_title=stage_title,
        )

    # 第1リリースでは主役を2本に絞る。過去の予告コースは削除せず非表示にする。
    Course.objects.exclude(slug__in=(START_COURSE, PRACTICAL_COURSE)).update(
        status=PublishStatus.ARCHIVED
    )
    return start, practical
