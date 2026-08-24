/**
 * 今日の実行上限に達したときの画面。
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
 * （その日の上限に達した）は、原因も次にすることも別。前者は
 * 「もう一度」、後者は「また明日」。1つの `GeneratingCard` に
 * 両方をまとめていたのが、そもそもの取り違えだった
 * （`course/useCourseLesson.ts` の `errorKind` で区別する）。
 *
 * ここで出す数字
 * --------------
 * 測っていない数字（XP、獲得したAI技の数）はまだ無いので出さない。
 * 実際に数えている「続けて n 日」があれば、それだけ添える。
 */

import { IconChevronRight } from "../Icons";
import { PrimaryButton } from "../aippo/PrimaryButton";
import { PoAvatar } from "../../po/PoAvatar";
import { readStreak } from "../../lib/draft";
import type { PoMessage } from "../../course/types";

export interface LessonPausedProps {
  /** 上限に達したときの、その場のポーの言葉（emotion は celebrate 側）。 */
  po: PoMessage;
  /** ホームへ戻る。 */
  onExit: () => void;
}

export function LessonPaused({ po, onExit }: LessonPausedProps) {
  // 今日ここまで開いた記録。測っていない数字（XP等）は出さない
  const days = readStreak().days;

  return (
    <div className="page flex min-h-[70vh] flex-col justify-center">
      <section
        className="rounded-panel border border-line bg-surface p-5 text-center shadow-card"
        data-testid="lesson-paused"
        aria-labelledby="lesson-paused-heading"
      >
        <h1 id="lesson-paused-heading" className="text-xl font-bold leading-8">
          今日の練習はここまで！
          <span aria-hidden="true"> 🎉</span>
        </h1>

        <div className="mt-4 flex justify-center">
          <PoAvatar po={po} />
        </div>

        {days > 0 && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-ink-muted">
            続けて<span className="font-bold tabular-nums text-ink">{days}</span>日
          </p>
        )}

        {/*
          「AIに送る」は出さない。押しても同じ上限に当たるだけの
          ボタンを残すと、壊れているように見える。
        */}
        <div className="mt-6">
          <PrimaryButton
            testId="lesson-paused-exit"
            onClick={onExit}
            trailing={<IconChevronRight className="h-5 w-5 shrink-0" />}
          >
            ホームへ戻る
          </PrimaryButton>
        </div>
      </section>
    </div>
  );
}
