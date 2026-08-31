/**
 * 無料で使える分を使い切ったときの画面。
 *
 * 前は違った
 * ----------
 * 上限に達しても、AI送信中の画面（`止まっています` + `AIに送る`）が
 * そのまま出続けていた。上限の知らせ（`今日はたくさん練習しましたね`）が
 * ポーの吹き出しに乗るので、**「止まっています」「押し直せる送信ボタン」
 * 「今日はここまで」が同時に画面へ出る**状態になっていた。
 * 押しても必ずまた失敗するボタンを残していたのが実害で、
 * 「壊れている」と読める見た目のほうが問題だった。
 *
 * 上限は失敗ではない
 * ------------------
 * 押し直せば直る失敗（回線が切れた、など）と、押しても意味が無い状態
 * （使える分を使い切った）は、原因も次にすることも別。前者は
 * 「もう一度」、後者は「また明日」。1つの `GeneratingCard` に
 * 両方をまとめていたのが、そもそもの取り違えだった
 * （`course/useCourseLesson.ts` の `errorKind` で区別する）。
 *
 * 行き止まりにしない
 * ------------------
 * 使い切ったのがゲストのときは、次にできることが**2つある**。
 *
 *   1. いま登録して、続きをそのまま進める（登録すると分が増える）
 *   2. 明日また続ける
 *
 * 前者だけを出すと「登録しないと進めない壁」になり、後者だけを出すと
 * 「今日はもう無理」で終わる。**両方を並べて、どちらも本当に進む口に
 * する。** 登録した人はこの画面から出ずに続きを送れる（`onResume`）。
 *
 * 数字で急かさない
 * ----------------
 * 「残り0回」「あと3時間で回復」のような煽りは出さない。押した人が
 * 焦って登録したところで、次に開く理由にはならない。出すのは
 * **今日できるようになったこと**——実際に通った区切りだけ。
 *
 * ここで出す数字
 * --------------
 * 測っていない数字（XP、獲得したAI技の数）はまだ無いので出さない。
 * 実際に数えている「続けて n 日」があれば、それだけ添える。
 */

import { useState } from "react";

import { IconChevronRight } from "../Icons";
import { PrimaryButton } from "../aippo/PrimaryButton";
import { AuthDialog } from "../auth/AuthDialog";
import { PoAvatar } from "../../po/PoAvatar";
import { readStreak } from "../../lib/draft";
import { EVENTS, track } from "../../lib/analytics";
import { PAUSED_COPY } from "../../content/ui";
import type { PoMessage } from "../../course/types";

export interface LessonPausedProps {
  /** 上限に達したときの、その場のポーの言葉（emotion は celebrate 側）。 */
  po: PoMessage;
  /**
   * 使い切ったのが**その人の分**か。
   *
   * `true` なら登録で増やせる。`false`（サービス全体が今日の上限に
   * 達した）のときに登録を勧めると、登録しても進めないので嘘になる。
   */
  canRegisterForMore?: boolean;
  /** いまのレッスンで通り終えた区切りの名前（「試す」「変える」など）。 */
  done?: string[];
  /** 登録できたので、そのまま続きを送る。 */
  onResume?: () => void;
  /** ホームへ戻る。 */
  onExit: () => void;
  /** どのレッスンで止まったか。記録に添える。 */
  lessonId?: string;
}

export function LessonPaused({
  po,
  canRegisterForMore = false,
  done = [],
  onResume,
  onExit,
  lessonId,
}: LessonPausedProps) {
  // 今日ここまで開いた記録。測っていない数字（XP等）は出さない
  const days = readStreak().days;
  const [signingUp, setSigningUp] = useState(false);

  const registerNow = () => {
    track(EVENTS.registerNowClicked, { lessonId });
    setSigningUp(true);
  };

  const waitTomorrow = () => {
    track(EVENTS.waitTomorrowClicked, { lessonId });
    onExit();
  };

  return (
    <div className="page flex min-h-[70vh] flex-col justify-center">
      <section
        className="rounded-panel border border-line bg-surface p-5 text-center shadow-card"
        data-testid="lesson-paused"
        aria-labelledby="lesson-paused-heading"
      >
        <h1 id="lesson-paused-heading" className="text-xl font-bold leading-8">
          {PAUSED_COPY.title}
          <span aria-hidden="true"> 🎉</span>
        </h1>

        <div className="mt-4 flex justify-center">
          <PoAvatar po={po} />
        </div>

        {/*
          今日できるようになったこと。

          作文はせず、**実際に通った区切り**をそのまま並べる。
          通っていないものを混ぜると、次に開いたときに「そんなことは
          していない」と分かって、他の表示まで信じられなくなる。
        */}
        {done.length > 0 && (
          <div className="mt-5 rounded-card bg-canvas px-4 py-3 text-left">
            <h2 className="text-xs font-bold text-ink-muted">{PAUSED_COPY.doneTitle}</h2>
            <ul className="mt-2 space-y-1">
              {done.map((label) => (
                <li key={label} className="flex items-start gap-1.5 text-sm text-ink">
                  <span aria-hidden="true" className="text-brand">
                    ✓
                  </span>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {days > 0 && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-ink-muted">
            続けて<span className="font-bold tabular-nums text-ink">{days}</span>日
          </p>
        )}

        {/*
          「AIに送る」は出さない。押しても同じ上限に当たるだけの
          ボタンを残すと、壊れているように見える。
        */}
        {canRegisterForMore ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm leading-6 text-ink-muted">{PAUSED_COPY.registerLead}</p>
            <PrimaryButton
              testId="lesson-paused-register"
              onClick={registerNow}
              trailing={<IconChevronRight className="h-5 w-5 shrink-0" />}
            >
              {PAUSED_COPY.registerNow}
            </PrimaryButton>
            {/*
              「明日また続ける」も本当の道として置く。小さく畳んで
              隠すと、登録しない人にとっては行き止まりのままになる。
            */}
            <button
              type="button"
              data-testid="lesson-paused-tomorrow"
              onClick={waitTomorrow}
              className="w-full rounded-card px-4 py-3 text-sm font-bold text-ink-muted
                         transition hover:bg-canvas hover:text-ink
                         focus-visible:outline focus-visible:outline-2
                         focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {PAUSED_COPY.waitTomorrow}
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <PrimaryButton
              testId="lesson-paused-exit"
              onClick={onExit}
              trailing={<IconChevronRight className="h-5 w-5 shrink-0" />}
            >
              ホームへ戻る
            </PrimaryButton>
          </div>
        )}
      </section>

      {signingUp && (
        <AuthDialog
          mode="signup"
          onClose={() => setSigningUp(false)}
          /*
            登録できたら、その場で続きを送る。

            ここでホームへ戻すと、「今すぐ続きをはじめる」と書いて
            おきながら続きから離すことになる。押した人が戻ってきた
            はずの場所は、いま止まっているこの回。
          */
          onDone={() => {
            setSigningUp(false);
            onResume?.();
          }}
        />
      )}
    </div>
  );
}
