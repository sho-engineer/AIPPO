/**
 * ポーの画像マニフェスト（要件 §5）。
 *
 * 差し替えるときは `public/assets/po/` に同名で置くだけ。
 * ここ以外に画像パスを書かない。
 *
 * 画像がまだ無いときは、壊れた画像を出さずに
 * 丸いプレースホルダーへ倒す（`PoAvatar` が受け持つ）。
 * 教材を作る側が画像を待たずに進められるようにするため。
 *
 * 新しいキャラクターは作らない。既にある絵を使う。
 */

import type { PoEmotion } from "../course/types";

export const poAssets: Record<PoEmotion, string> = {
  neutral: "/assets/po/neutral.webp",
  question: "/assets/po/question.webp",
  thinking: "/assets/po/thinking.webp",
  talking: "/assets/po/talking.webp",
  hint: "/assets/po/hint.webp",
  warning: "/assets/po/warning.webp",
  celebrate: "/assets/po/celebrate.webp",
  blink: "/assets/po/blink.webp",
};

/**
 * 絵が用意されていない状態の、代わりに使う絵。
 *
 * `talking` と `blink` は専用の絵がまだ無い。
 * ここを空にしておくと、まばたきのたびにプレースホルダーが
 * 出て壊れて見えるので、いちばん近い絵へ寄せる。
 *
 * あとから `public/assets/po/blink.webp` を置けば、
 * このコードを触らずにそちらが使われる。
 */
export const PO_FALLBACK: Partial<Record<PoEmotion, PoEmotion>> = {
  talking: "neutral",
  blink: "neutral",
};

/**
 * 画像が無いときに代わりに出す色。
 *
 * 状態を**色だけで表さない**（要件 §6.12）。
 * プレースホルダーには必ず記号も添える。
 */
export const PO_PLACEHOLDER: Record<PoEmotion, { tone: string; mark: string }> = {
  neutral: { tone: "bg-brand-soft text-brand-dark", mark: "・‿・" },
  question: { tone: "bg-brand-soft text-brand-dark", mark: "？" },
  thinking: { tone: "bg-brand-soft text-brand-dark", mark: "…" },
  talking: { tone: "bg-brand-soft text-brand-dark", mark: "・o・" },
  hint: { tone: "bg-brand-soft text-brand-dark", mark: "！" },
  warning: { tone: "bg-caution-soft text-caution", mark: "⚠" },
  celebrate: { tone: "bg-joy-soft text-joy", mark: "★" },
  blink: { tone: "bg-brand-soft text-brand-dark", mark: "－‿－" },
};

/** 読み上げ用の説明。装飾ではなく案内役なので、名前を出す。 */
export const PO_ALT = "AIPPOの案内役 ポー";
