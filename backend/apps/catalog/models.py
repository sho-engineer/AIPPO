"""教材そのもの（コース・レッスン・ステップ）。

学習の**記録**は apps/lessons、教材の**中身**はここ。
混ぜると、教材を1本足すたびに記録側のマイグレーションが動く。

なぜ「骨格＋差分」なのか
------------------------
レッスンの大半は同じ流れをしている。

    完成イメージ → お試し → 比較 → 自分で試す

これを19行のステップとして1本ずつ持つと、7教材で133行になる。
同じ定型が7回並び、流れを直したいときは133行すべてを直すことになる。
実際そうなると、教材ごとに少しずつ食い違って気づけなくなる。

そこで Lesson は**型とパラメータ**だけを持ち、19ステップは
サーバー（flow.py）が組み立てる。管理画面で埋めるのは1教材あたり
15項目ほどで済み、流れの改善は一度で全教材へ効く。

型は2つ。

    outcome_first … 骨格から組み立てる（レッスン1〜6・最終課題）
    custom        … ステップ行がそのまま中身（診断・AIを安全に使う）

LessonStep の役目は型で変わる。

    custom        … その行が中身そのもの。sort_order の順に並ぶ
    outcome_first … step_key が一致する生成済みステップへの**上書き**

上書きは「空でない項目だけ」を当てる。空欄を「空にする指示」と
解釈すると、埋め忘れた項目が中身を消してしまう。
どうしても消したい場合は、その教材を custom にする。
"""

from __future__ import annotations

from django.db import models
from django.utils import timezone


class PublishStatus(models.TextChoices):
    """公開の段階。

    利用者の画面に出るのは PUBLISHED だけ。
    書きかけを本番へ出さないための、いちばん外側の関門。
    """

    DRAFT = "draft", "下書き"
    REVIEW = "review", "確認中"
    PUBLISHED = "published", "公開"
    ARCHIVED = "archived", "取り下げ"


class AvailabilityStatus(models.TextChoices):
    """いま始められるか。

    公開状態（PublishStatus）とは別に持つ。両者は別のことを表す。

        publication_status … 一覧に**出すか**
        availability_status … 出したうえで**始められるか**

    「近日公開」は、出すけれど始められない状態。1つの項目で表そうとすると
    「出さない」と「出すが始められない」が区別できず、
    近日公開のつもりが一覧から消える（または書きかけが始められてしまう）。
    """

    AVAILABLE = "available", "利用できる"
    COMING_SOON = "coming_soon", "近日公開"


class AccessType(models.TextChoices):
    """誰が使えるか。課金はまだ無いので、いまは FREE だけを使う。"""

    FREE = "free", "無料"
    ONE_TIME = "one_time", "買い切り"
    SUBSCRIPTION = "subscription", "受け放題"


class LessonTemplate(models.TextChoices):
    OUTCOME_FIRST = "outcome_first", "成果物ファースト（骨格から生成）"
    CUSTOM = "custom", "自由（ステップ行がそのまま中身）"


class StepPlacement(models.TextChoices):
    """ステップ行を、骨格のどこへ置くか。

    自由型のレッスンでは使わない（行がそのまま並びになる）。
    """

    OVERRIDE = "override", "生成済みステップの上書き（step_key が一致）"
    LEAD_IN = "lead_in", "骨格の前に置く"
    DEEPEN = "deepen", "「自分の文章」の**前**に置く（技を深める）"
    AFTER_REAL_TASK = "after_real_task", "「自分の文章」の直後に置く"


class LessonMode(models.TextChoices):
    """教材の種類。

    standard         … 利用者にモデルを意識させない（通常の教材）
    model_comparison … モデル名と得手不得手を見せる（将来のコース）
    """

    STANDARD = "standard", "通常"
    MODEL_COMPARISON = "model_comparison", "モデル比較"


class Difficulty(models.TextChoices):
    BEGINNER = "beginner", "初級"
    INTERMEDIATE = "intermediate", "中級"
    ADVANCED = "advanced", "上級"


class Course(models.Model):
    """レッスンをまとめる単位。

    コースにも「出すか（status）」と「始められるか（availability_status）」を
    別々に持たせてある。レッスンと同じ考え方。

    中身がまだ1本も無いコースを一覧に出したいことがある。
    「これから何ができるようになるか」が先に見えているほうが、
    いま開けるものを選びやすいため。そのとき、出すことと始められることを
    1つの項目で表すと、**出した瞬間に始められてしまう**。
    """

    slug = models.SlugField(max_length=80, unique=True, help_text="URLと保存に使う名前")
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)

    #: このコースを終えると何ができるようになるか。**1文で書く。**
    #:
    #: レッスンごとの成果（Lesson.outcomes）を全部並べると、始める前の
    #: 人が読むには長すぎる。まとめて1文にしたものをここに置き、
    #: 1本ずつの詳しい話はレッスンの最初の画面（完成イメージ）が持つ。
    outcome = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="このコースでできるようになること",
        help_text="1文で。例: 文章・要約・整理・比較・画像まで、AIの基本が身につきます。",
    )

    difficulty = models.CharField(
        max_length=20,
        choices=Difficulty.choices,
        default=Difficulty.BEGINNER,
        help_text="一覧のカードに出す。レッスンごとの難易度とは別（コース全体の目安）",
    )

    access_type = models.CharField(
        max_length=20, choices=AccessType.choices, default=AccessType.FREE
    )
    status = models.CharField(
        max_length=20, choices=PublishStatus.choices, default=PublishStatus.DRAFT
    )
    availability_status = models.CharField(
        max_length=20,
        choices=AvailabilityStatus.choices,
        default=AvailabilityStatus.COMING_SOON,
        verbose_name="利用可能状態",
        help_text="出したうえで始められるか。既定は近日公開（うっかり開かないように）",
    )
    coming_soon_message = models.CharField(
        max_length=200,
        blank=True,
        help_text="近日公開のときに添える一言。空なら既定の文言",
    )
    sort_order = models.PositiveIntegerField(default=0)
    thumbnail = models.CharField(
        max_length=200,
        blank=True,
        help_text="public/ からの道筋（例: /brand/app-icon.webp）",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "id")
        verbose_name = "コース"
        verbose_name_plural = "コース"

    def __str__(self) -> str:
        return f"{self.title}（{self.get_status_display()}）"

    @property
    def is_public(self) -> bool:
        return self.status == PublishStatus.PUBLISHED

    @property
    def is_startable(self) -> bool:
        """いま始められるか。

        出ていることと始められることは別。中身がまだ無いコースは
        一覧に出るが、ここは False になる（レッスンと同じ扱い）。
        """
        return self.is_public and self.availability_status == AvailabilityStatus.AVAILABLE


class Lesson(models.Model):
    """1つの学習テーマ。

    `template` が outcome_first のとき、下の「骨格のパラメータ」から
    19前後のステップが組み立てられる（flow.py）。
    custom のときは、それらは使われずステップ行がそのまま中身になる。
    """

    course = models.ForeignKey(Course, related_name="lessons", on_delete=models.CASCADE)

    slug = models.SlugField(
        max_length=80,
        unique=True,
        help_text="画面と記録で教材を指す名前。公開後は変えない",
    )
    number = models.PositiveIntegerField(help_text="一覧に出す番号（Lesson 1 など）")
    title = models.CharField(max_length=120)
    goal = models.CharField(max_length=200, help_text="何ができるようになるか（1行）")

    template = models.CharField(
        max_length=20,
        choices=LessonTemplate.choices,
        default=LessonTemplate.OUTCOME_FIRST,
    )

    # --- コースの中での位置づけ --------------------------------------------
    #
    # コースを「STEP」で束ねる。8本を平らに並べると、どこまでが
    # 1つのまとまりなのかが読めず、8回ぶんの一本道に見える。
    #
    # 束ねる表をコース側に別の行として持たない。持つと、レッスンの
    # 並び替えと束の並び替えが**別々にずれる**（表の順とレッスンの順が
    # 食い違った瞬間、どちらが正しいのか誰にも分からなくなる）。
    # ここに書いておけば、順序はレッスンの並び1つで決まる。
    #
    # 束は「同じ key が続くひとかたまり」として読む（expand.course_to_dict）。
    # 空のときは、そのレッスンはどの束にも入らない。
    stage_key = models.SlugField(
        max_length=40,
        blank=True,
        verbose_name="STEPの識別子",
        help_text="同じ値が続くレッスンが1つのSTEPになる（例: ask / think / create）",
    )
    stage_title = models.CharField(
        max_length=60,
        blank=True,
        verbose_name="STEPの名前",
        help_text="そのSTEPの見出し（例: AIに頼んでみる）。同じ stage_key には同じ名前を入れる",
    )

    # --- 一覧と完成イメージ ------------------------------------------------
    outcome_title = models.CharField(
        max_length=120, blank=True, help_text="今日つくるもの。最初の画面の見出し"
    )
    outcome_description = models.CharField(max_length=200, blank=True)
    estimated_minutes = models.PositiveIntegerField(
        null=True, blank=True, help_text="だいたいの所要時間。先が見えないと始めにくい"
    )
    difficulty = models.CharField(
        max_length=20, choices=Difficulty.choices, default=Difficulty.BEGINNER
    )
    before_example = models.TextField(blank=True, help_text="完成イメージの Before")
    after_example = models.TextField(blank=True, help_text="完成イメージの After")
    learned_skills = models.JSONField(
        default=list, blank=True, help_text="今日できるようになること（文字列の配列）"
    )
    outcomes = models.JSONField(
        default=list, blank=True, help_text="進捗画面に出す、身についたこと"
    )
    tags = models.JSONField(default=list, blank=True, help_text="診断からの推薦に使う")
    thumbnail = models.CharField(
        max_length=200,
        blank=True,
        help_text="public/ からの道筋（例: /assets/lessons/rewrite_text.webp）",
    )
    uses_ai = models.BooleanField(default=True)
    mode = models.CharField(
        max_length=20,
        choices=LessonMode.choices,
        blank=True,
        help_text="空なら通常。将来のモデル比較コース用の目印",
    )

    # --- 骨格のパラメータ（template=outcome_first のときだけ使う） ---------
    ai_action = models.JSONField(
        default=dict,
        blank=True,
        help_text='AIへの頼み方。例: {"action": "rewrite", "inputs": {...}}',
    )
    sample_text = models.TextField(
        blank=True, help_text="最初の1回で使う例文。空欄から始めさせない"
    )
    quick_title = models.CharField(
        max_length=120, blank=True, help_text="最初に選ばせる唯一の問い"
    )
    quick_instruction = models.CharField(max_length=200, blank=True)
    quick_key = models.CharField(
        max_length=60, blank=True, help_text="その答えの保存先（audience など）"
    )
    quick_options = models.JSONField(default=list, blank=True)
    quick_defaults = models.JSONField(
        default=dict,
        blank=True,
        help_text="選ばせない条件の既定値。最初の1回を成立させるために埋める",
    )
    working = models.CharField(
        max_length=200, blank=True, help_text="送っているあいだに出す一言"
    )
    observation_options = models.JSONField(
        default=list, blank=True, help_text="空なら共通のものを使う"
    )
    condition_options = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "「条件を一つ足す」の選択肢。空なら共通のものを使う。"
            "共通のものは文章を直す言い回しなので、文章以外を扱う回では埋める"
        ),
    )
    concept_cards = models.JSONField(
        default=list, blank=True, help_text="短い解説。3枚まで（超えた分は捨てる）"
    )
    review_points = models.JSONField(
        default=list, blank=True, help_text="結果を見るときの着眼点"
    )
    real_task_label = models.CharField(max_length=200, blank=True)
    real_task_placeholder = models.CharField(max_length=200, blank=True)
    takeaway = models.CharField(max_length=200, blank=True)
    next_suggestion = models.CharField(max_length=200, blank=True)
    fact_check = models.BooleanField(
        default=False, help_text="数字や日付の確認をとくに促すか（比較・計画）"
    )

    # --- 公開まわり --------------------------------------------------------
    is_preview = models.BooleanField(
        default=False, help_text="有料コースでも、ここまでは無料で見せる"
    )
    status = models.CharField(
        max_length=20,
        choices=PublishStatus.choices,
        default=PublishStatus.DRAFT,
        verbose_name="公開状態",
        help_text="一覧に出すかどうか。published だけが利用者に見える",
    )
    availability_status = models.CharField(
        max_length=20,
        choices=AvailabilityStatus.choices,
        default=AvailabilityStatus.COMING_SOON,
        verbose_name="利用可能状態",
        help_text="出したうえで始められるか。既定は近日公開（うっかり始められないように）",
    )
    planned_release_date = models.DateField(
        null=True,
        blank=True,
        help_text="決まっているときだけ入れる。空なら日付を出さない",
    )
    coming_soon_message = models.CharField(
        max_length=200,
        blank=True,
        help_text="近日公開のときに添える一言。空なら既定の文言",
    )
    version = models.PositiveIntegerField(default=1)
    sort_order = models.PositiveIntegerField(default=0)
    published_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("sort_order", "number", "id")
        verbose_name = "レッスン"
        verbose_name_plural = "レッスン"

    def __str__(self) -> str:
        return f"{self.number}. {self.title}"

    @property
    def is_public(self) -> bool:
        """一覧に出るか。"""
        return self.status == PublishStatus.PUBLISHED

    @property
    def is_startable(self) -> bool:
        """いま始められるか。

        出ていることと始められることは別。近日公開の教材は
        一覧に出るが、ここは False になる。
        """
        return self.is_public and self.availability_status == AvailabilityStatus.AVAILABLE

    def mark_published(self) -> None:
        self.status = PublishStatus.PUBLISHED
        self.published_at = timezone.now()


class LessonStep(models.Model):
    """ステップ1つ。

    型が custom のレッスンでは、この行が中身そのもの。

    型が outcome_first のレッスンでは、`placement` で役目が変わる。

        override        … step_key が一致する生成済みステップを上書きする
                          （空でない項目だけ当たる）
        lead_in         … 骨格の前に置く（最終課題の「困りごとを選ぶ」など）
        deepen          … 「自分の文章」の**前**に置く（相手・言い方を聞く）
        after_real_task … 「自分の文章」の直後に置く

    deepen を足した理由
    -------------------
    前は相手や言い方を聞く回が after_real_task にあり、
    「自分の文章を書く → 誰向け？ → トーンの解説 → トーンを選ぶ
    → 反復の解説 → 送る」という並びだった。書き終えた人を4画面
    足止めしてから送ることになるうえ、「自分で試す」の区切りが
    11歩に膨らんで、帯がそのあいだ動かなかった。

    条件も解説も、自分の文章とは関係なく決められる。先に済ませる。

    追加ステップを Lesson の JSON 項目として持たせる手もあったが、
    それだと管理画面で1項目ずつ編集できない。行にしておけば、
    他のステップと同じ画面で同じように直せる。
    """

    lesson = models.ForeignKey(Lesson, related_name="steps", on_delete=models.CASCADE)

    placement = models.CharField(
        max_length=20,
        choices=StepPlacement.choices,
        default=StepPlacement.OVERRIDE,
        help_text="成果物ファースト型のとき、この行をどこへ置くか",
    )
    step_key = models.CharField(
        max_length=60,
        help_text=(
            "ステップを指す名前。自由型では画面のid、"
            "成果物ファースト型では上書き先（quick_try など）"
        ),
    )
    step_type = models.CharField(
        max_length=40,
        blank=True,
        help_text="画面の種類。上書きのときは空でよい",
    )
    phase = models.CharField(
        max_length=20,
        blank=True,
        help_text="上の帯のどこか（outcome / try / compare / deepen / own）",
    )

    title = models.CharField(max_length=120, blank=True)
    primary_label = models.CharField(
        max_length=40,
        blank=True,
        help_text=(
            "画面の下のボタンの文言。空なら種類ごとの既定。"
            "押すと何が起きるかを書く（「次へ」は何も言っていない）"
        ),
    )
    instruction = models.CharField(max_length=200, blank=True)
    po_message = models.CharField(max_length=300, blank=True)
    po_emotion = models.CharField(max_length=20, blank=True)

    input_key = models.CharField(
        max_length=60, blank=True, help_text="入力の保存先。同じ名前を複数画面から読める"
    )
    options = models.JSONField(default=list, blank=True)
    placeholder = models.CharField(max_length=200, blank=True)
    example = models.CharField(max_length=300, blank=True)
    hints = models.JSONField(default=list, blank=True)
    validation_rules = models.JSONField(default=dict, blank=True)
    ai_action = models.JSONField(default=dict, blank=True)
    card = models.JSONField(default=dict, blank=True, help_text="短い解説の中身")
    meta = models.JSONField(default=dict, blank=True)
    skill = models.CharField(max_length=200, blank=True)

    # 空欄＝「指定なし」。false（はっきり任意）とは別物として扱う。
    # 一緒くたにすると、もとの教材にあった `required: false` が消えて
    # 展開結果が変わる（実際に最終課題の1ステップで消えた）。
    is_required = models.BooleanField(null=True, blank=True, default=None)
    is_skippable = models.BooleanField(null=True, blank=True, default=None)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("sort_order", "id")
        verbose_name = "ステップ"
        verbose_name_plural = "ステップ"
        constraints = [
            models.UniqueConstraint(
                fields=("lesson", "step_key"), name="unique_step_key_per_lesson"
            )
        ]

    def __str__(self) -> str:
        return f"{self.step_key}（{self.step_type or '上書き'}）"
