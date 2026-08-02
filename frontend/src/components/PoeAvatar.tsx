/**
 * AIチューター「ポー」の表示（AIPPO 開発概要 §6 / §7）。
 *
 * - 6状態を画像で切り替える
 * - メッセージを吹き出しで表示し、aria-live でスクリーンリーダーへ通知する
 * - 画面幅が狭い場合は画面下部へ配置し、入力操作を妨げない
 *
 * Live2D / 3D / 音声 / 口パクは MVP に含めない。
 */

import type { TutorEmotion, TutorMessage } from "../types/tutor";

export const EMOTION_IMAGES: Record<TutorEmotion, string> = {
  neutral: "/poe/neutral.webp",
  question: "/poe/question.webp",
  thinking: "/poe/thinking.webp",
  hint: "/poe/hint.webp",
  warning: "/poe/warning.webp",
  celebrate: "/poe/celebrate.webp",
};

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
      className="fixed inset-x-0 bottom-0 z-10 flex items-end gap-3 p-3
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
