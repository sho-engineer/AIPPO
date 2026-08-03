/**
 * AIチューター「ポー」の表示（AIPPO 開発概要 §6 / §7）。
 *
 * - 6状態を画像で切り替える
 * - メッセージを吹き出しで表示し、aria-live でスクリーンリーダーへ通知する
 * - 画面幅が狭い場合は画面下部へ配置し、入力操作を妨げない
 *
 * 出し方は2通りある。
 *
 *   corner … 学習中の案内役。画面の隅に居続ける（既定）
 *   hero   … タイトル画面の主役。大きく出して、ふわりと浮かせる
 *
 * ポー自身は押す対象ではない。画面に固定して重ねる以上、
 * 下にあるボタンのタップを奪わないよう pointer-events を切る
 * （憲章 原則 I: 押せない行き止まりを作らない）。
 *
 * Live2D / 3D / 音声 / 口パクは MVP に含めない。
 * 動きは CSS だけで作る。ライブラリを足すほどの見返りが無く、
 * prefers-reduced-motion で一括して止められる形が扱いやすい。
 */

import type { TutorEmotion, TutorMessage } from "../types/tutor";

/**
 * 画像の拡張子。
 *
 * 差し替えたいときは `frontend/public/poe/` に同名で置き、ここを変えるだけでよい。
 * 元絵から作り直すときは `npm run poe` を使う。
 */
export const POE_IMAGE_EXT = "webp";

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

const POE_ALT = "AIPPOの案内役 ポー";

export type PoeAvatarProps = {
  tutor: TutorMessage;
  isVisible?: boolean;
  /** 出し方。既定は画面の隅に居続ける案内役 */
  variant?: "corner" | "hero";
  /**
   * 表情の画像を差し替える。
   * タイトル画面では、表情ではなく「手を振っているポー」を出したい。
   */
  imageSrc?: string;
};

export function PoeAvatar({
  tutor,
  isVisible = true,
  variant = "corner",
  imageSrc,
}: PoeAvatarProps) {
  if (!isVisible) {
    return null;
  }

  const src = imageSrc ?? EMOTION_IMAGES[tutor.emotion];

  if (variant === "hero") {
    return (
      <aside
        data-testid="poe-avatar"
        data-emotion={tutor.emotion}
        className="flex flex-col items-center"
        aria-live="polite"
      >
        {/* 吹き出し。しっぽを付けて、誰が喋っているかを迷わせない */}
        <div
          className="relative max-w-[17rem] animate-rise-in rounded-2xl bg-surface
                     px-5 py-3 text-center shadow-card [animation-delay:0.55s] sm:max-w-md"
        >
          <p className="text-sm">{tutor.message}</p>
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-full h-3.5 w-3.5 -translate-x-1/2
                       -translate-y-2 rotate-45 rounded-sm bg-surface"
          />
        </div>

        {/*
          登場（pop-in）と待機（float）は別の要素に分ける。
          同じ要素に両方書くと、後から書いたほうだけが効く。
        */}
        <div className="mt-4 animate-pop-in [animation-delay:0.2s]">
          <img
            src={src}
            alt={POE_ALT}
            // トップの絵は余白を切り詰めてあるので、幅は絵に任せる
            className="h-40 w-auto animate-float object-contain sm:h-48"
          />
        </div>

        {/*
          足元の影。浮き沈みに合わせて縮む。
          これが無いと、ただ上下している絵にしか見えない。
        */}
        <span
          aria-hidden="true"
          className="-mt-1 h-3 w-20 animate-float-shadow rounded-[100%]
                     bg-ink/20 blur-[3px] sm:w-28"
        />
      </aside>
    );
  }

  return (
    <aside
      data-testid="poe-avatar"
      data-emotion={tutor.emotion}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex items-end gap-2 p-3
                 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[26rem] sm:max-w-[calc(100vw-2rem)] sm:p-0"
      aria-live="polite"
    >
      {/*
        吹き出しは必ず縮むようにしておく（min-w-0 + flex-1）。
        内容に合わせて広がる指定にすると、長い発言のときに
        画面の右外へあふれて読めなくなる。

        高さも上限を設ける。狭い画面で発言が伸びると、
        下にある選択肢や入力欄を覆ってしまう。
        絵を大きくしたぶん、吹き出しは短く抑える。
      */}
      <div className="min-w-0 flex-1 rounded-2xl bg-surface p-3 shadow-lg sm:p-4">
        <p className="max-h-24 overflow-hidden text-sm leading-6 sm:max-h-none">
          {tutor.message}
        </p>
      </div>
      <img
        src={src}
        alt={POE_ALT}
        className="h-20 w-20 shrink-0 object-contain sm:h-28 sm:w-28"
      />
    </aside>
  );
}
