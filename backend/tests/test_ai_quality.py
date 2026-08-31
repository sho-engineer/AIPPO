"""返ってきたものが、そのレッスンの学習になっているか。

守りたいのは2つ。順番が大事で、**下のほうが重い**。

    1. 頼んだことが起きていない結果を、そのまま見せない
    2. **まともな結果を、間違って弾かない**

2つ目のほうが重いのは、誤検知には毎回お金がかかるため。弾くたびに
作り直しが走り、待ち時間が延び、それでも通らなければ学習が止まる。
見逃し（微妙な結果が1つ通る）のほうが、まだ安い。

だから「まともな結果を通す」側の検査を厚く書いてある。
"""

from __future__ import annotations

import uuid

import pytest

from apps.ai import quality
from apps.ai.providers.base import AIQualityError, AIResult, AIUsage
from apps.ai.providers.mock import MockProvider
from apps.lessons.models import (
    AiActionType,
    AiCreditBalance,
    AiCreditLedger,
    AiCreditStatus,
    Attempt,
    AttemptStatus,
)

SOURCE = (
    "明日の打ち合わせの件ですが、資料について確認していただきたいところが"
    "あるため、本日中に可能であれば見ていただけますでしょうか。"
)


def _values(**over) -> dict:
    body = {
        "original_text": SOURCE,
        "audience": "上司",
        "tone": "ていねいに",
        "length": "3行くらい",
    }
    body.update(over)
    return body


class TestWhatWeCatch:
    """頼んだことが、起きていない。"""

    def test_returning_the_same_text(self):
        """元の文章がそのまま返ってきた。

        **Day1でいちばん学習を壊す壊れ方。** 比べる画面に同じ文章が
        2つ並ぶので、学習者から見ると AI が動いていないのと同じ。
        """
        verdict = quality.inspect("rewrite", _values(), SOURCE)

        assert not verdict.ok
        assert verdict.reason == "copy"

    def test_the_same_text_with_different_spacing(self):
        """空白と改行を足しただけの丸写しも、丸写し。"""
        verdict = quality.inspect("rewrite", _values(), f"  {SOURCE}\n\n ")

        assert not verdict.ok
        assert verdict.reason == "copy"

    def test_a_one_word_answer_to_a_long_text(self):
        # 「はい。」でも形は正しい。形が正しいことと役に立つことは別
        verdict = quality.inspect("rewrite", _values(), "はい。")

        assert not verdict.ok
        assert verdict.reason == "too_short"

    def test_asking_for_shorter_and_getting_longer(self):
        """「もっと短く」と頼んで、短くなっていない。

        条件を足した意味がまるごと消える。「足すたびに近づく」が
        この教材の骨なので、ここが崩れると学習にならない。
        """
        # 削る余地がある長さにしておく。短すぎる文章は下の別の検査
        previous = "明日の資料について、ご確認のほどよろしくお願いいたします。"
        verdict = quality.inspect(
            "improve",
            {"original_text": previous, "improvement": "もっと短く"},
            previous + "なお、お忙しいところ恐れ入りますが、よろしくお願いいたします。",
        )

        assert not verdict.ok
        assert verdict.reason == "not_shorter"

    def test_asking_for_bullets_and_getting_paragraphs(self):
        verdict = quality.inspect(
            "improve",
            {"original_text": SOURCE, "improvement": "箇条書きにする"},
            "資料の確認をお願いします。本日中にご覧いただけると助かります。",
        )

        assert not verdict.ok
        assert verdict.reason == "format_ignored"

    def test_a_report_instead_of_the_work(self):
        """「以下が書き直した文章です：」は、成果物ではなく報告。

        そのまま仕事へ持っていけないので、学習の出口が閉じる。
        """
        verdict = quality.inspect(
            "rewrite",
            _values(),
            "以下が書き直した文章です：\n資料のご確認をお願いします。",
        )

        assert not verdict.ok
        assert verdict.reason == "preamble"

    def test_the_json_leaking_into_the_body(self):
        verdict = quality.inspect("rewrite", _values(), '{"result": "ご確認ください"}')

        assert not verdict.ok
        assert verdict.reason == "json_leak"

    def test_way_past_the_asked_length(self):
        # 「3行くらい」の倍までは通す。その先だけ落とす
        long_answer = "\n".join(f"{i}行目の内容です。" for i in range(10))
        verdict = quality.inspect("rewrite", _values(), long_answer)

        assert not verdict.ok
        assert verdict.reason == "too_many_lines"


class TestWhatWeMustNotCatch:
    """**まともな結果を弾かない。** こちらのほうが重い。

    弾くたびに作り直しの費用がかかる。誤検知は、見逃しより高くつく。
    """

    def test_a_normal_rewrite(self):
        verdict = quality.inspect(
            "rewrite",
            _values(),
            "明日の打ち合わせの資料について、確認していただきたい点がございます。\n"
            "本日中にご覧いただけますと助かります。\n"
            "お忙しいところ恐れ入りますが、よろしくお願いいたします。",
        )

        assert verdict.ok

    def test_a_polite_rewrite_that_starts_with_an_acknowledgement(self):
        """**「承知しました。」で始まる本文を弾かない。**

        「了解です」を丁寧に書き直すと、本文が正しくこの言葉で始まる。
        前置きの言葉だけを見て弾く作りにすると、**正しい結果を
        毎回作り直す**ことになる。見るのは「行末が『：』の見出し行」
        だけにしてあるのは、このため。
        """
        verdict = quality.inspect(
            "rewrite",
            _values(original_text="了解です。あとで見ます。"),
            "承知しました。のちほど確認いたします。",
        )

        assert verdict.ok

    def test_a_short_source_getting_a_short_answer(self):
        # 1行の文章を1行に直すのは正しい。短さだけでは弾かない
        verdict = quality.inspect(
            "rewrite", _values(original_text="見て"), "ご確認ください。"
        )

        assert verdict.ok

    def test_five_lines_when_three_were_asked(self):
        # 「3行くらい」に5行。直す必要は無い
        answer = "\n".join(f"{i}行目の内容です。" for i in range(5))

        assert quality.inspect("rewrite", _values(), answer).ok

    def test_a_very_short_source_cannot_be_asked_to_shrink(self):
        """「了解です。」をさらに短くしろ、とは言わない。

        無理を言うと、正しく答えているものを毎回作り直させる。
        本物の利用者にも起きる——前の結果が短いときに
        「もっと短く」を押した人が、そのたびに作り直しへ回される。
        """
        source = "了解です。"
        verdict = quality.inspect(
            "improve",
            {"original_text": source, "improvement": "もっと短く"},
            "承知しました。",
        )

        assert verdict.ok

    def test_keeping_the_length_when_that_is_what_was_asked(self):
        """「今のままの長さ」は、長さを見ない。

        頼んでいないことを測らない。ここで長さを測ると、
        指示どおりの結果を弾くことになる。
        """
        verdict = quality.inspect(
            "improve",
            {"original_text": "ご確認ください。", "length": "今のままの長さ"},
            "ご確認をお願いいたします。",
        )

        assert verdict.ok

    def test_bullets_with_various_markers(self):
        # 「・」だけを印だと決めない。番号でも記号でも箇条書き
        for marker in ["・", "-", "*", "1.", "1)", "●"]:
            verdict = quality.inspect(
                "improve",
                {"original_text": SOURCE, "improvement": "箇条書きにする"},
                f"{marker} 資料を確認する\n{marker} 本日中に返事をする",
            )
            assert verdict.ok, marker

    def test_an_action_we_do_not_know(self):
        """知らない頼みごとには、共通の検査だけを掛ける。

        載っていない action を勝手に弾かない。**通すべきものを
        通せなくなった時点で、品質検査は害のほうが大きい。**
        """
        verdict = quality.inspect(
            "summarize", _values(), "資料の確認をお願いします。本日中にお願いします。"
        )

        assert verdict.ok


class TestTheErrorItself:
    def test_it_is_a_provider_error(self):
        """既存の失敗の道に合流すること。

        `AIProviderError` の子でなくなると、呼び出し側の
        `except` をすり抜けて 500 になり、**押さえた持ち分が
        戻らないまま残る。**
        """
        from apps.ai.providers.base import AIProviderError

        assert issubclass(AIQualityError, AIProviderError)

    def test_it_carries_which_check_failed(self):
        assert AIQualityError("copy").reason == "copy"
        assert AIQualityError("copy").kind == "quality"

    def test_every_reason_has_a_way_to_fix_it(self):
        """落ちた検査には、必ず直し方の言葉があること。

        「品質が低い」とだけ伝え直しても、同じものが返ってくる。
        作り直しに意味を持たせるには、**どう直すか**が要る。
        """
        reasons = [
            "copy",
            "too_short",
            "not_shorter",
            "too_many_lines",
            "format_ignored",
            "preamble",
            "commentary",
            "json_leak",
        ]
        for reason in reasons:
            assert reason in quality.RETRY_HINT, reason
            assert quality.retry_hint(reason).endswith("。"), reason

    def test_an_unknown_reason_still_says_something(self):
        # 検査を足して RETRY_HINT を書き忘れても、無言にはしない
        assert quality.retry_hint("nonsense")


@pytest.mark.parametrize(
    "text",
    [
        "",
        "   ",
        "\n\n",
    ],
)
def test_blank_answers_do_not_crash_the_checks(text):
    """空でも落ちないこと。

    空文字は `_validate` が先に弾くので、ここへは来ない**はず**。
    だが検査が例外を投げる作りだと、順番を入れ替えた日に 500 になる。
    """
    verdict = quality.inspect("rewrite", _values(), text)

    assert verdict.reason in ("too_short", "")


# ------------------------------------------------- 内部の作り直しと持ち分

pytestmark = pytest.mark.django_db

GENERATE_URL = "/api/v1/ai/generate/"


def _post(api_client, **over):
    body = {
        "lesson_id": "rewrite_text",
        "step_id": "generate_first",
        "action": "rewrite",
        "input": {
            "original_text": SOURCE,
            "audience": "上司",
            "tone": "ていねいに",
            "length": "3行くらい",
        },
        # 毎回ちがう合言葉。同じにすると「同じ操作の送り直し」として
        # 前の結果が返り、作り直しの検査にならない
        "request_id": str(uuid.uuid4()),
    }
    body.update(over)
    return api_client.post(GENERATE_URL, body, format="json")


def _key(api_client) -> uuid.UUID:
    """いまの端末の鍵。1回投げれば Cookie が返る。"""
    _post(api_client)
    return uuid.UUID(api_client.cookies["learner_key"].value)


def _left(learner_key) -> int:
    row = AiCreditBalance.objects.filter(
        learner_key=learner_key, action_type=AiActionType.TEXT
    ).first()
    return row.available if row else 0




class _Flaky:
    """作り物の provider。**何回叩かれたか**を数える。

    数を数えるのが目的なので、`reset()` を置いてある。学習者の鍵を
    用意する最初の1回ぶんを外してから数え始めるため——外さないと、
    準備の呼び出しまで「作り直し」として数えてしまう。
    """

    def __init__(self, recovers: bool):
        self.calls = 0
        self._recovers = recovers
        # 差し替える**前**の本物を掴んでおく。
        # `MockProvider.generate_structured` を呼び直す形にすると、
        # そのときには自分自身に差し替わっていて、無限に潜る
        self._real = MockProvider.generate_structured

    def reset(self) -> None:
        self.calls = 0

    def __call__(self, provider, request, schema):
        self.calls += 1
        # 1回目は元の文章をそのまま返す（いちばん学習を壊す返し方）
        if self.calls == 1 or not self._recovers:
            return AIResult(
                text=SOURCE,
                data={"result": SOURCE},
                usage=AIUsage(provider="mock", model="mock-1"),
            )
        return self._real(provider, request, schema)


@pytest.fixture
def recovers(monkeypatch, settings):
    """1回目は駄目で、頼み直すと直る。"""
    settings.AI_PROVIDER = "mock"
    flaky = _Flaky(recovers=True)
    """`lambda` で包むのが要。

    インスタンスをそのまま属性へ入れると `__call__` に `self`
    （provider）が渡らない。関数なら、ふつうのメソッドとして束縛される。
    """
    monkeypatch.setattr(
        MockProvider,
        "generate_structured",
        lambda provider, request, schema: flaky(provider, request, schema),
    )
    return flaky


@pytest.fixture
def stuck(monkeypatch, settings):
    """何回頼んでも直らない。"""
    settings.AI_PROVIDER = "mock"
    flaky = _Flaky(recovers=False)
    """`lambda` で包むのが要。

    インスタンスをそのまま属性へ入れると `__call__` に `self`
    （provider）が渡らない。関数なら、ふつうのメソッドとして束縛される。
    """
    monkeypatch.setattr(
        MockProvider,
        "generate_structured",
        lambda provider, request, schema: flaky(provider, request, schema),
    )
    return flaky


def _ready(api_client, flaky: _Flaky) -> uuid.UUID:
    """学習者の鍵を用意して、数を数え直す。"""
    _post(api_client)
    key = uuid.UUID(api_client.cookies["learner_key"].value)
    flaky.reset()
    return key


class TestInternalRetryCostsTheLearnerNothing:
    """**押した回数と、減った数が一致すること。**

    内部で何回 provider を叩いても、その人の持ち分は1つしか動かない。
    ここが崩れると「1回しか押していないのに2回減った」になる。
    """

    def test_a_recovered_result_costs_exactly_one(self, api_client, recovers):
        key = _ready(api_client, recovers)
        before = _left(key)

        response = _post(api_client)

        assert response.status_code == 200
        # provider は2回叩いた。減ったのは1つ
        assert recovers.calls == 2
        assert _left(key) == before - 1

    def test_a_recovered_result_leaves_one_attempt(self, api_client, recovers):
        """記録も1つ。作り直しは**同じ操作の中身**で、別の操作ではない。"""
        _ready(api_client, recovers)
        before = Attempt.objects.count()

        _post(api_client)

        assert Attempt.objects.count() == before + 1

    def test_we_remember_that_it_had_to_be_fixed(self, api_client, recovers):
        """直った回も、何が起きていたかを残す。

        残さないと「直った回」と「最初から問題が無かった回」を
        区別できず、**どれだけ救えているのかが分からなくなる**。
        """
        _ready(api_client, recovers)

        _post(api_client)

        latest = Attempt.objects.order_by("-created_at").first()
        assert latest.status == AttemptStatus.SUCCEEDED
        assert latest.quality_kind == "copy"

    def test_a_clean_result_is_not_marked(self, api_client, settings):
        """一発で通った回には、印を残さない。

        残すと、直した回と見分けが付かなくなる。
        """
        settings.AI_PROVIDER = "mock"
        _post(api_client)

        latest = Attempt.objects.order_by("-created_at").first()
        assert latest.status == AttemptStatus.SUCCEEDED
        assert latest.quality_kind == ""

    def test_we_only_retry_once(self, api_client, stuck):
        """作り直しは1回だけ。

        2回にすると、駄目な日は1アクションで3回叩くことになり
        費用が3倍になる。1回で戻らないものは、たいてい2回でも戻らない。
        """
        _ready(api_client, stuck)

        _post(api_client)

        assert stuck.calls == 2

    def test_an_unusable_result_costs_nothing(self, api_client, stuck):
        """作り直しても駄目なら、**減らさない。**

        受け取っていないものに課金しない、という約束のほうを守る。
        """
        key = _ready(api_client, stuck)
        before = _left(key)

        response = _post(api_client)

        assert response.status_code == 502
        assert _left(key) == before

    def test_it_does_not_blame_the_learner(self, api_client, stuck):
        """起きたのは AI の出力のばらつき。書いた人のせいではない。"""
        _ready(api_client, stuck)

        response = _post(api_client)
        detail = response.json()["errors"]["detail"][0]

        for word in ["不正解", "失敗", "間違", "正しくありません", "無効"]:
            assert word not in detail

    def test_the_screen_can_tell_the_two_apart(self, api_client, stuck):
        """「届かなかった」と「使えるものにならなかった」を見分けられること。

        前者は押し直せば直ることが多く、後者は同じ頼み方ではまた
        同じになる。画面が出す道が変わるので、印で分ける。
        """
        _ready(api_client, stuck)

        response = _post(api_client)

        assert response.json()["code"] == "AI_RESULT_UNUSABLE"

    def test_a_stuck_run_leaves_no_open_reservation(self, api_client, stuck):
        """押さえたものを閉じ忘れない。

        閉じ忘れると、その人の持ち分が減ったまま残る。
        """
        _ready(api_client, stuck)

        _post(api_client)

        assert not AiCreditLedger.objects.filter(
            status=AiCreditStatus.RESERVED
        ).exists()


class TestTheMockActuallyDoesWhatItIsAsked:
    """作り物の AI も、頼まれたことをすること。

    この module の冒頭にはこう書いてある——「条件を変えると結果が
    変わることが画面で確認できないと、教材として意味がない」。
    だが**長さと形は映していなかった**。「もっと短く」と頼んでも
    元より長いものが返っていて、品質の検査から見ると
    「頼んだことが起きていない」——実際そのとおりだった。

    ここが崩れると、開発中もE2Eも**教材の要そのものを確かめられない**。
    """

    def _ask(self, action_id: str, values: dict) -> str:
        from apps.ai.actions import get_action

        return MockProvider()._compose(get_action(action_id).build(values))

    def test_shorter_means_shorter(self):
        source = "先日の件ですが、諸事情ございまして、追ってご連絡差し上げます。"
        made = self._ask(
            "improve", {"original_text": source, "improvement": "もっと短く"}
        )

        assert len(made.replace("\n", "")) < len(source)

    def test_shorter_works_even_for_a_very_short_source(self):
        """元が短いときも、通ること。

        目印（「（テスト用）」）そのものが長さを持つので、元が
        短いと目印だけではみ出す。実際そこで落ちた。

        直したのは作り物ではなく**検査のほう**。「了解です。」を
        さらに短くしろというのは無理を言っていて、これは本物の
        利用者にも起きる——前の結果が短いときに「もっと短く」を
        押した人が、毎回作り直しに回されることになる。
        """
        source = "了解です。"
        made = self._ask(
            "improve", {"original_text": source, "improvement": "もっと短く"}
        )

        assert quality.inspect(
            "improve", {"original_text": source, "improvement": "もっと短く"}, made
        ).ok

    def test_bullets_mean_bullets(self):
        made = self._ask(
            "improve",
            {"original_text": SOURCE, "improvement": "箇条書きにする"},
            )

        assert made.lstrip().startswith("・")

    def test_a_plain_rewrite_still_echoes_the_conditions(self):
        """条件を変えると結果が変わる、は保ったまま。

        長さと形を映すようにしたことで、**元からできていたこと**が
        消えていないか。消すと、教材の別の画面が壊れる。
        """
        made = self._ask(
            "rewrite",
            {
                "original_text": SOURCE,
                "audience": "顧客",
                "tone": "ていねいに",
                "length": "3行くらい",
            },
        )

        assert "顧客" in made

    def test_every_day1_result_passes_its_own_checks(self):
        """Day1 で実際に飛ぶ組み合わせが、全部通ること。

        **作り物が自分の検査に落ちる状態にしない。** 落ちると、
        開発中は毎回2回叩いて502が返り、E2Eも通らなくなる。
        """
        cases = [
            (
                "rewrite",
                {
                    "original_text": SOURCE,
                    "audience": who,
                    "tone": "ていねいに",
                    "length": length,
                },
            )
            for who in ["上司", "同僚", "顧客"]
            for length in ["1行", "3行くらい", "半分の長さ", "今のままの長さ"]
        ] + [
            ("improve", {"original_text": SOURCE, "improvement": c})
            for c in ["もっと短く", "もっと丁寧に", "やわらかく", "要点を先に", "箇条書きにする"]
        ]

        for action_id, values in cases:
            made = self._ask(action_id, values)
            verdict = quality.inspect(action_id, values, made)
            assert verdict.ok, f"{action_id} {values} -> {verdict.reason}: {made!r}"
