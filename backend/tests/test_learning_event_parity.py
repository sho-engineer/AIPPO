"""画面が送るイベント名を、サーバーが全部受け取れること。

なぜ要るか
----------
画面を作り直したときに、5つのイベント名を足し忘れていた。
送られてくるのに 400 で捨てていた。

捨てても画面は止まらない作りなので（送信の失敗でレッスンを止めない）、
誰も気づかない。気づくのは、集めたデータを見ようとしたときになる。
そのときにはもう、そのぶんは残っていない。

しかも欠けていたのは前半のステップ（完成イメージ・お試し・観察・解説）
だった。**詰まるのはたいてい前半**なので、いちばん見たいところが
空という状態だった。

見張り方
--------
画面側の送信元（`useCourseLesson.ts`）から文字列を抜き出して、
サーバーの選択肢と突き合わせる。名前を足すのは画面側が先になるので、
足りないほうが必ずサーバーになる。
"""

from __future__ import annotations

import re
from pathlib import Path

from apps.lessons.models import LearningEventType

SOURCE = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "src"
    / "course"
    / "useCourseLesson.ts"
)


def _event_names() -> set[str]:
    """画面が送るイベント名を、送信元から抜き出す。

    拾うのは2か所。

        eventType: "..."      直接指定しているもの
        STEP_EVENT の値       ステップの種類ごとに決まるもの
    """
    source = SOURCE.read_text(encoding="utf-8")

    names = set(re.findall(r'eventType:\s*"([a-z_]+)"', source))

    table = re.search(r"const STEP_EVENT[^=]*=\s*\{(.*?)\}", source, re.DOTALL)
    if table:
        names |= set(re.findall(r':\s*"([a-z_]+)"', table.group(1)))

    # `STEP_EVENT[...] ?? "step_viewed"` のような受け皿も送られる
    names |= set(re.findall(r'\?\?\s*"([a-z_]+)"', source))

    return names


class TestEveryEventTheScreenSendsIsAccepted:
    def test_the_source_is_where_we_think_it_is(self):
        """抜き出し元が動いたら気づけるようにする。

        ここが空振りすると、突き合わせが「0件対0件」で通ってしまう。
        """
        assert SOURCE.exists(), f"送信元が見つからない: {SOURCE}"
        assert len(_event_names()) >= 10, "イベント名を抜き出せていない"

    def test_none_of_them_would_be_rejected(self):
        allowed = set(LearningEventType.values)

        missing = sorted(_event_names() - allowed)

        assert not missing, (
            f"画面が送るのにサーバーが受け取らない: {missing}\n"
            "apps/lessons/models.py の LearningEventType へ足して、"
            "移行も作ること。足りないままだと 400 で黙って捨てられる"
        )
