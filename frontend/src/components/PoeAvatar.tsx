/**
 * AIチューター「ポー」の表示（AIPPO 開発概要 §6 / §7）。
 *
 * - 6状態を画像で切り替える
 * - メッセージを吹き出しで表示し、aria-live でスクリーンリーダーへ通知する
 * - 画面幅が狭い場合は画面下部へ配置し、入力操作を妨げない
 *
 * ポー自身は押す対象ではない。画面に固定して重ねる以上、
 * 下にあるボタンのタップを奪わないよう pointer-events を切る
 * （憲章 原則 I: 押せない行き止まりを作らない）。
 *
 * Live2D / 3D / 音声 / 口パクは MVP に含めない。
 */

import type { TutorEmotion, TutorMessage } from "../types/tutor";

/**
 * 画像の拡張子。
 *
 * いまは仮画像の SVG。正式な WebP が用意できたら
 * `frontend/public/poe/` に同名で置き、ここを "webp" に変えるだけでよい。
 */
export const POE_IMAGE_EXT = "svg";

const EMOTIONS: readonly TutorEmotion[] = [
  "neutral",
  "question",
  "thinking",
  "hint",
  "warning",
  "celebrate",
];

export const EMOTION_IMAGES = Object.fromEntries(
  EMOTIONS.map((emotion) => [emotion, `/poe/${emotion}.${POE_IMAGE_EXT}`]),
) as Record<TutorEmotion, string>;

export type PoeAvatarProps = {
  tutor: TutorMessage;
  isVisible?: boolean;
};

export function PoeAvatar({ tutor, isVisible = true }: PoeAvatarProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <aside
      data-testid="poe-avatar"
      data-emotion={tutor.emotion}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex items-end gap-3 p-3
                 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-sm sm:p-0"
      aria-live="polite"
    >
      <div className="flex-1 rounded-2xl bg-white p-4 shadow-lg sm:flex-none">
        <p className="text-sm leading-6">{tutor.message}</p>
      </div>
      <img
        src={EMOTION_IMAGES[tutor.emotion]}
        alt="AIPPOの案内役 ポー"
        className="h-20 w-20 shrink-0 object-contain sm:h-28 sm:w-28"
      />
    </aside>
  );
}
