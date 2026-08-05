"""教材を始めてよいかの判定。**唯一の場所**にする。

画面で開始ボタンを消すだけでは足りない。
URL を直接叩く、開発者ツールから API を呼ぶ、古いタブが残っている——
どれでも「近日公開」の教材が始まってしまう。

止める場所は3つあり、すべてここを通す。

    1. 教材を配る API        … 中身（ステップ）を渡さない
    2. 学習セッション作成 API … 作らせない
    3. AI 実行 API           … 呼ばせない

判定を各 View に書き写すと、必ずどれかが古くなる。
実際、画面だけを直して API を忘れるのがいちばんよくある抜け方。
"""

from __future__ import annotations

from apps.catalog.models import Lesson

#: 画面へ返すエラーコード。文言ではなくコードで分岐させる
#: （文言を変えたときに画面の出し分けが壊れないように）。
LESSON_COMING_SOON = "LESSON_COMING_SOON"
LESSON_NOT_FOUND = "LESSON_NOT_FOUND"


class LessonNotStartable(Exception):
    """始めてはいけない教材が要求された。

    `code` を持つ。View はこれを掴んで、そのまま応答に載せる。
    """

    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


def require_startable(lesson_slug: str) -> Lesson:
    """始めてよい教材だけを返す。だめなら例外。

    「見つからない」と「近日公開」を区別して返す。
    近日公開を 404 にすると、画面が「一覧には出ているのに無いと言われる」
    という説明のつかない状態になる。
    """
    lesson = (
        Lesson.objects.filter(slug=lesson_slug).select_related("course").first()
    )

    if lesson is None or not lesson.is_public:
        raise LessonNotStartable(
            LESSON_NOT_FOUND, "この教材は見つかりませんでした。"
        )

    if not lesson.is_startable:
        raise LessonNotStartable(
            LESSON_COMING_SOON,
            lesson.coming_soon_message
            or "この教材は近日公開です。もうしばらくお待ちください。",
        )

    return lesson


def is_startable(lesson_slug: str) -> bool:
    """始めてよいか。教材が DB に無いときは False。

    教材をまだ DB へ入れていない環境（取り込み前）でも、
    ここで落とさずに False を返す。
    """
    try:
        require_startable(lesson_slug)
    except LessonNotStartable:
        return False
    return True
