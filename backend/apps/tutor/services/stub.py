"""開発・テスト用のスタブプロバイダ。

AI_PROVIDER=stub のままレッスンを完走できることが、
AIPPO 開発概要 §17 とプロジェクト憲章 原則 III の要件。

スキーマを見て、ポーのフィードバックと文章生成を返し分ける。
"""

from apps.tutor.fallbacks import fallback_feedback
from apps.tutor.services.base import AiProvider

STUB_META = {"model_name": "stub", "token_usage": {}}

#: スタブが1回に返す文字数。本物のAIの刻みに近い程度の細かさにする。
STREAM_CHUNK_SIZE = 8


class StubProvider(AiProvider):
    def generate_json(
        self,
        *,
        system_prompt: str,
        user_content: str,
        schema: dict,
        timeout_seconds: float,
        max_retries: int,
    ) -> dict:
        properties = set(schema.get("properties", {}))

        if "rewritten_text" in properties:
            return {"rewritten_text": _stub_rewrite(user_content), "_meta": STUB_META}

        # ポーのフィードバック。決定論的であればよい。
        payload = fallback_feedback("review_input", 1)
        payload["_meta"] = STUB_META
        return payload

    def stream_text(
        self,
        *,
        system_prompt: str,
        user_content: str,
        timeout_seconds: float,
        meta_out: dict,
    ):
        """スタブでも少しずつ返す。

        一度に返してしまうと、流し込みの経路がテストで通らず、
        本物のAIに切り替えた瞬間に壊れていることに気づけない。
        """
        text = _stub_rewrite(user_content)
        for index in range(0, len(text), STREAM_CHUNK_SIZE):
            yield text[index : index + STREAM_CHUNK_SIZE]

        meta_out["model_name"] = STUB_META["model_name"]
        meta_out["token_usage"] = dict(STUB_META["token_usage"])


def _stub_rewrite(user_content: str) -> str:
    """元の文章を短く整えた風の固定応答。

    実際に書き換えはしないが、「条件を変えると結果が変わる」ことが
    画面上で確認できるよう、依頼条件の1行目を添える。
    """
    lines = user_content.splitlines()
    condition = lines[0] if lines else ""
    marker = "--- 元の文章 ---"
    index = user_content.find(marker)
    body = user_content[index + len(marker) :].strip() if index >= 0 else ""
    head = body[:60] + ("…" if len(body) > 60 else "")
    return f"（テスト用の応答）{condition}\n{head}"
