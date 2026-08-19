/**
 * 動きの基準。
 *
 * レッスンの中には動きが多い——ステップの入れ替え、進み具合の伸び、
 * ポーの反応、「できた」の印。**それぞれで秒数を決めると、
 * 同じ画面の中で速さがばらつく。** 速さがばらつくと、押した結果が
 * 返ってきたのか、まだ動いている途中なのかが読み取れなくなる。
 *
 * だから1か所に置く。数を直したいときは、ここだけ直す。
 *
 * 速さの決め方
 * ------------
 * `fast`   … 押したことを返す（選んだ、押した）。待たせない
 * `normal` … 場面が入れ替わる（ステップが進む）。進んだと感じる長さ
 * `slow`   … 祝う。完了のときだけ
 *
 * 220ms より短いと「切り替わった」ではなく「点滅した」に見え、
 * 350ms を超えると、進むたびに待たされる。
 *
 * 動きを止める人のこと
 * --------------------
 * `prefers-reduced-motion: reduce` は index.css で一括して止めている。
 * ここの数を使う側も、**動きが無くても意味が伝わる**ように書くこと。
 * 位置や透明度の変化だけで情報を伝えると、止めた人に何も残らない。
 */

/** 秒数（ミリ秒）。 */
export const MOTION = {
  fast: 120,
  normal: 220,
  slow: 350,
} as const;

/**
 * 加減速。
 *
 * 出だしを速く、終わりをゆっくり止める。等速（linear）だと機械が
 * 動かしているように見え、跳ね返る曲線は大人向けの実用画面には強すぎる。
 */
export const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** そのまま style へ渡せる形。 */
export function transition(
  property: string,
  speed: keyof typeof MOTION = "normal",
): string {
  return `${property} ${MOTION[speed]}ms ${EASING}`;
}

/**
 * 動きを減らす設定になっているか。
 *
 * CSS 側では止められない動き（時間で切り替える演出、紙吹雪）を
 * 出すかどうかの判断に使う。
 *
 * 画面が無い場所（テスト・サーバー）では false を返す。
 * 判断できないときに「動かす」へ倒すのは、CSS 側で止まるから。
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
