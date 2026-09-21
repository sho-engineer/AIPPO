/**
 * 昇段の実践問題——**知識を聞かない。実際に指示文を書かせる。**
 *
 * なぜ一枚なのか
 * --------------
 * 地図から開いて、書いて、閉じると地図へ戻る。画面を増やすと
 * 「どこから来たか」を覚える先が増え、戻り先が散る。ここでやることは
 * 1つ（書いて送る）なので、画面いっぱいの一枚で足りる。
 *
 * 強い言葉を使わない
 * ------------------
 * 通らなかった回に「失敗」「不合格」と書かない。**何度でも受けられる**
 * ので、そこで終わりのように読める言葉を置かない。返すのは
 * 「足りなかった観点の名前」だけ——次に何を足すかがそのまま出る。
 *
 * 点数を出さない
 * --------------
 * 「4つ中2つ」と出すと、割合を上げる遊びになる。ここで覚えたいのは
 * 指示文の書き方で、点の詰め方ではない。
 *
 * 観点は名前だけ
 * --------------
 * 「目的」「誰向けか」とは言うが、**どう書けば当たるか**は出さない
 * （サーバーも返していない）。言い回しの一覧を見せると、答えではなく
 * 一覧を写せば通ってしまう。
 *
 * 上がるのは2つそろったときだけ
 * -----------------------------
 * 通っても、技がそろっていなければ段は動かない。そのときは**通った
 * ことを認めたうえで**、あと何個要るかを言う。判定も昇段もサーバー側
 * （`apps/rewards/views.py`）で、ここは返ってきたものを出すだけ。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchChallenge,
  submitChallenge,
  type ChallengeVerdict,
  type RankUpChallenge,
} from "../../../api/progression";
import { MoreSheet } from "../MoreSheet";
import { IconCheck, IconMedal, IconSparkle } from "../../Icons";

export interface ChallengeSheetProps {
  level: number;
  onClose: () => void;
  /** 段が上がったことを、外（地図）へ伝える。読み直してもらうため。 */
  onLevelUp?: (level: number) => void;
}

/** 書いた指示文の、いちばん短い長さ。サーバー側の `MIN_LENGTH` と同じ。 */
const MIN_LENGTH = 25;

export function ChallengeSheet({ level, onClose, onLevelUp }: ChallengeSheetProps) {
  const [challenge, setChallenge] = useState<RankUpChallenge | null>(null);
  const [failed, setFailed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [verdict, setVerdict] = useState<ChallengeVerdict | null>(null);
  /* 送っている最中の二度押しを止める。`sending` だけだと、描き直しの
     すき間に2回目が通る回がある */
  const inFlight = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setFailed(false);
    try {
      setChallenge(await fetchChallenge(level, signal));
    } catch {
      if (!signal?.aborted) setFailed(true);
    }
  }, [level]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const send = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    try {
      const result = await submitChallenge(level, answer);
      setVerdict(result);
      if (result.level_up) onLevelUp?.(result.current_level);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const tooShort = answer.trim().length < MIN_LENGTH;

  return (
    <MoreSheet
      title={challenge ? challenge.title : "昇段の挑戦"}
      placement="full"
      testId="challenge-sheet"
      onClose={onClose}
    >
      {failed && (
        <div
          role="alert"
          data-testid="challenge-error"
          className="rounded-card bg-caution-soft px-4 py-3 text-sm leading-6 text-caution"
        >
          <p>うまく送れませんでした。通信を確かめて、もう一度お試しください。</p>
          <button
            type="button"
            onClick={() => void load()}
            data-testid="challenge-retry"
            className="mt-2 min-h-[2.75rem] rounded-cta border border-caution/40 px-5
                       py-2 text-sm font-bold text-caution transition hover:bg-caution/10"
          >
            もう一度読み込む
          </button>
        </div>
      )}

      {challenge === null && !failed && (
        <p className="text-sm text-ink-muted">読み込んでいます…</p>
      )}

      {challenge && verdict === null && (
        <>
          <p
            data-testid="challenge-scenario"
            className="rounded-card border border-line bg-canvas px-4 py-3 text-sm leading-7"
          >
            {challenge.scenario}
          </p>

          {/*
            見る観点。**名前だけ。** どう書けば当たるかは出さない
            （言い回しの一覧を見せると、写すだけで通る）。
          */}
          {challenge.check_labels.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold">入っているか見るところ</p>
              <ul
                className="mt-2 flex flex-wrap gap-2"
                role="list"
                data-testid="challenge-checks"
              >
                {challenge.check_labels.map((label) => (
                  <li
                    key={label}
                    className="rounded-full border border-brand-line bg-brand-soft/40
                               px-3 py-1 text-xs"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="mt-4 block">
            <span className="text-xs font-bold">AIへの指示文</span>
            <textarea
              data-testid="challenge-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={6}
              className="mt-2 w-full rounded-card border border-line bg-surface px-3 py-2
                         text-sm leading-7 focus:border-brand focus:outline-none"
              placeholder="この場面で、AIにどう頼みますか"
            />
          </label>

          {/*
            **短すぎるうちは送れない。** 押せるのに毎回同じことを
            言われるより、押す前に分かるほうがよい。責める書き方には
            しない——足りないのは字数であって、その人ではない。
          */}
          <p className="mt-1 text-xs text-ink-muted" data-testid="challenge-length">
            {tooShort
              ? `もう少し書いてみてください（あと${MIN_LENGTH - answer.trim().length}字ほど）`
              : "書けたら送ってください。何度でも受けられます。"}
          </p>

          <button
            type="button"
            data-testid="challenge-send"
            disabled={tooShort || sending}
            onClick={() => void send()}
            className="mt-4 min-h-[3rem] w-full rounded-cta bg-brand px-6 py-2 text-sm
                       font-bold text-white shadow-cta transition
                       hover:brightness-110 active:scale-[0.98]
                       disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-muted
                       disabled:shadow-none"
          >
            {sending ? "見ています…" : "送る"}
          </button>
        </>
      )}

      {verdict && (
        <Verdict
          verdict={verdict}
          level={level}
          onRetry={() => setVerdict(null)}
          onClose={onClose}
        />
      )}
    </MoreSheet>
  );
}

/**
 * 見てもらった結果。3つに分かれる。
 *
 *   上がった       … 祝う。新しい段の名前を出す
 *   通ったが上がらない … 通ったことを認めて、あと何個要るかを言う
 *   まだ足りない   … 足りなかった観点を名前で出して、書き直しへ戻す
 */
function Verdict({
  verdict,
  level,
  onRetry,
  onClose,
}: {
  verdict: ChallengeVerdict;
  level: number;
  onRetry: () => void;
  onClose: () => void;
}) {
  if (verdict.level_up) {
    return (
      <div className="text-center" data-testid="challenge-levelup">
        <span
          aria-hidden="true"
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full
                     bg-brand text-white"
        >
          <IconMedal className="h-8 w-8" />
        </span>
        <p className="mt-4 text-lg font-bold">Lv.{verdict.current_level} になりました</p>
        <p className="mt-2 text-sm leading-7 text-ink-muted">
          覚えた技を、まとめて1回で使えました。次の段でできることが増えます。
        </p>
        <button
          type="button"
          data-testid="challenge-done"
          onClick={onClose}
          className="mt-6 min-h-[3rem] w-full rounded-cta bg-brand px-6 py-2 text-sm
                     font-bold text-white shadow-cta transition hover:brightness-110
                     active:scale-[0.98]"
        >
          学習マップへ
        </button>
      </div>
    );
  }

  if (verdict.passed) {
    /*
      通ったのに上がらなかった回。**通ったことを先に言う。**

      上がる条件は2つあって、どちらも要る。書けているのに「まだです」
      とだけ返すと、何が悪かったのかを探すことになる。
    */
    return (
      <div data-testid="challenge-passed-waiting">
        <p className="flex items-center gap-2 text-base font-bold">
          <IconCheck className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
          書けています
        </p>
        <p className="mt-2 text-sm leading-7 text-ink-muted">
          指示文はこれで通ります。Lv.{level} へ上がるには、必要な技が
          あと{verdict.remaining_skills}つです。学習マップから、その技の
          レッスンへ入れます。
        </p>
        <button
          type="button"
          data-testid="challenge-done"
          onClick={onClose}
          className="mt-6 min-h-[3rem] w-full rounded-cta bg-brand px-6 py-2 text-sm
                     font-bold text-white shadow-cta transition hover:brightness-110
                     active:scale-[0.98]"
        >
          学習マップへ
        </button>
      </div>
    );
  }

  return (
    <div data-testid="challenge-missing">
      {/*
        **「失敗」とは書かない。** 何度でも受けられるので、そこで
        終わりのように読める言葉を置かない。
      */}
      <p className="flex items-center gap-2 text-base font-bold">
        <IconSparkle className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        あと少しです
      </p>
      <p className="mt-2 text-sm leading-7 text-ink-muted">
        {verdict.missing_labels.length === 1
          ? "これを足すと、指示が伝わりやすくなります。"
          : `この${verdict.missing_labels.length}つを足すと、指示が伝わりやすくなります。`}
      </p>
      <ul className="mt-3 space-y-2" role="list" data-testid="challenge-missing-list">
        {verdict.missing_labels.map((label) => (
          <li
            key={label}
            className="rounded-card border border-line px-4 py-2 text-sm font-bold"
          >
            {label}
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-testid="challenge-again"
        onClick={onRetry}
        className="mt-6 min-h-[3rem] w-full rounded-cta bg-brand px-6 py-2 text-sm
                   font-bold text-white shadow-cta transition hover:brightness-110
                   active:scale-[0.98]"
      >
        書き直す
      </button>
    </div>
  );
}
