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
 * 8枚それぞれの「絵が実際に写っている範囲」。
 *
 * 台紙はどれも 512×512 で揃っている。**揃っていないのは中の絵のほう**。
 * 透明でない画素の外接矩形を測ると、こうなっていた（台紙に対する%）。
 *
 *     状態       中心x  中心y   幅    高さ
 *     neutral    49.8  61.2   59.0  72.1
 *     question   49.9  57.7   56.4  78.7
 *     thinking   50.1  61.0   53.7  72.1
 *     talking    47.2  54.0   43.6  57.6  ← 4分の3の大きさ
 *     hint       50.8  60.2   57.0  74.6
 *     warning    56.2  61.0   69.3  72.5  ← 右へ寄っている
 *     celebrate  50.8  61.1   76.2  71.9
 *     blink      50.0  56.0   48.4  61.5  ← 小さい
 *
 * これをそのまま出すと、しゃべるたび（talking と neutral を160msごとに
 * 入れ替える）にポーが4分の3へ縮んで跳ねる。まばたきでも同じことが起きる。
 * 絵は正しいのに、枠が揃っていないせいで別人のように動いて見える。
 *
 * 直し方
 * ------
 * **絵は描き直さない。** 出すときに、それぞれの絵を neutral の位置と
 * 大きさへ合わせる（PoAvatar の `frameStyle`）。作画を触らずに、
 * 見え方だけを揃える。
 *
 * 測り直し方
 * ----------
 * 絵を差し替えたらここも測り直す。手順は、台紙いっぱいに描いた canvas で
 * alpha > 16 の画素の外接矩形を取るだけ
 * （tests/poFrame.test.ts が、揃っていることを見張っている）。
 */
export interface PoBox {
  /** 台紙に対する中心の位置（%）。 */
  cx: number;
  cy: number;
  /** 台紙に対する絵の大きさ（%）。 */
  width: number;
  height: number;
}

export const PO_BOX: Record<PoEmotion, PoBox> = {
  neutral: { cx: 49.8, cy: 61.2, width: 59.0, height: 72.1 },
  question: { cx: 49.9, cy: 57.7, width: 56.4, height: 78.7 },
  thinking: { cx: 50.1, cy: 61.0, width: 53.7, height: 72.1 },
  talking: { cx: 47.2, cy: 54.0, width: 43.6, height: 57.6 },
  hint: { cx: 50.8, cy: 60.2, width: 57.0, height: 74.6 },
  warning: { cx: 56.2, cy: 61.0, width: 69.3, height: 72.5 },
  celebrate: { cx: 50.8, cy: 61.1, width: 76.2, height: 71.9 },
  blink: { cx: 50.0, cy: 56.0, width: 48.4, height: 61.5 },
};

/**
 * 揃える先。
 *
 * neutral にする。いちばん長く画面に出ている状態なので、
 * ここを動かさないほうが「ポーが動いた」と誤解されにくい。
 */
export const PO_REFERENCE: PoBox = PO_BOX.neutral;

/**
 * その絵を、揃える先へ重ねるための変形。
 *
 * 高さで合わせる。幅で合わせると、手を広げている絵（celebrate・warning）が
 * 小さくなってしまう——広げているのは腕であって、ポー自身は同じ大きさ。
 * 背丈をそろえるほうが、同じ子だと分かる。
 */
export function poTransform(emotion: PoEmotion): string {
  const box = PO_BOX[emotion];
  const scale = PO_REFERENCE.height / box.height;

  // translate → scale の順に効く。scale は中心（50,50）を軸に掛かるので、
  // 先に「scale 後にどこへ来るか」を出してから、足りない分を translate で埋める
  const dx = PO_REFERENCE.cx - 50 - (box.cx - 50) * scale;
  const dy = PO_REFERENCE.cy - 50 - (box.cy - 50) * scale;

  return `translate(${dx.toFixed(2)}%, ${dy.toFixed(2)}%) scale(${scale.toFixed(4)})`;
}

/**
 * 絵の読み込みに失敗したときの、代わりに使う絵。
 *
 * 8枚とも揃っているので、ふだんは通らない。
 * 配信の失敗など、一時的に読めなかったときの保険として残す。
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

/**
 * 手を振っているポー。タイトル画面だけで使う。
 *
 * 8状態とは別の1枚（`/brand/poe-wave.webp`）。同じ子で、体つき・耳・足・
 * 胸の印・アンテナ・玉はすべて同じ。ポーズと台紙だけが違う
 * （546×731、ポーが台紙いっぱいに描かれている）。
 *
 * 台紙が違うので、8状態と**同じ枠で入れ替えてはいけない**。
 * 入れ替えると大きさが跳ぶ。ここは切り替えの起きない1枚絵の場所
 * （タイトル画面のヒーロー）でだけ使う。
 *
 * 道筋をここに置くのは、ポーの絵を指す場所を1か所にまとめるため。
 * 画面の中に直接書くと、差し替えるときに探し回ることになる。
 */
export const PO_WAVE = "/brand/poe-wave.webp";

/** 読み上げ用の説明。装飾ではなく案内役なので、名前を出す。 */
export const PO_ALT = "AIPPOの案内役 ポー";
