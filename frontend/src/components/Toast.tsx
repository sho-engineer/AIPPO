/**
 * 画面の下に、少しのあいだだけ出る一言。
 *
 * なぜ要るか
 * ----------
 * 準備中の教材を押した人に、**何も起きない**のがいちばん困る。
 * 壊れているのか、押し方が悪いのか、自分には開けないのかが
 * 分からないまま終わる。
 *
 * かといって画面を切り替えるほどの用でもない。開けない理由を読むために
 * 一枚開いて閉じる、では押した手間のほうが大きくなる。
 *
 * 決まりごと
 * ----------
 * - **押せる場所を増やさない。** 閉じるボタンは置かない（時間で消える）
 * - 下の帯より上に出す。帯に隠れると、出したこと自体が伝わらない
 * - 読み上げは `role="status"`。**割り込ませない**（`alert` にしない）
 *   ——これは知らせであって、警告ではない
 * - **動きは付けない。** 出て、消える。それだけ
 */

import { useEffect } from "react";

export interface ToastProps {
  /** 出す文。2行まで。 */
  message: string;
  /** 消えたときに呼ばれる。呼び出し側が状態を戻す。 */
  onDone: () => void;
  /** 出しておく時間（ミリ秒）。 */
  duration?: number;
}

export function Toast({ message, onDone, duration = 2600 }: ToastProps) {
  useEffect(() => {
    const id = window.setTimeout(onDone, duration);
    return () => window.clearTimeout(id);
  }, [message, duration, onDone]);

  return (
    <div
      /*
        下タブの上へ。安全域（ホームバー）のぶんも足す——足さないと、
        端末によっては帯の下へ潜って読めない。
      */
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-5
                 bottom-[calc(5rem+env(safe-area-inset-bottom))]"
      data-testid="toast"
    >
      <p
        role="status"
        className="max-w-sm rounded-card bg-ink/90 px-4 py-2.5 text-center text-[0.8125rem]
                   leading-5 text-white shadow-card"
      >
        {message}
      </p>
    </div>
  );
}

/** 準備中の教材を押したときの一言。**文はここ1か所。** */
export const COMING_SOON_TOAST =
  "このLessonは現在準備中です。公開まで少しお待ちください。";
