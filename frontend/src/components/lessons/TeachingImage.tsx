/**
 * 教材の絵。**中身そのものが教材**なので、切り取らない。
 *
 * 一覧のサムネイル（LessonThumbnail）とは別の部品にしてある。
 * あちらは 4:3 を `object-cover` で埋める「見分けが付けばよい絵」で、
 * こちらは **1枚で説明が完結している 3:2 の教材**。同じ部品にすると、
 * 端が切れて図の一部（矢印の先や、まとめの帯）が消える。
 *
 * 守ること
 * --------
 * - 3:2 のまま。`contain` で、どの幅でも1枚まるごと入る
 * - 幅は親いっぱい。固定幅にしない（390px の画面ではみ出す）
 * - 外側に枠・影・背景の箱を足さない。**絵の中に枠もレイアウトも
 *   すでにある。** 二重の枠は、画面の作りと教材の絵の境目を曖昧にする
 * - 親を `overflow-hidden` にして、丸めた角から絵がはみ出さないようにする
 *
 * 読み上げ
 * --------
 * `alt` は渡せるようにしてある。ここは飾りではなく中身なので、
 * 見えない人には**何の図か**が伝わらないといけない。ただし絵の中の
 * 文字を全部書き写すことはしない——同じことが本文にも書いてある。
 *
 * 大きさを先に伝える
 * ------------------
 * `width`/`height` を必ず渡す。読み込みの前後で高さが変わらないので、
 * あとから下の文やボタンが飛ばない（CLS を出さない）。
 */

/**
 * 教材の絵の実寸。
 *
 * ここが効くのは**比**だけ——読み込む前に高さを取っておくための値で、
 * 実際の表示幅は親いっぱい（`w-full`）に決まる。だから1枚だけ小さい絵
 * （skill_09_divergence は 1086×724）が混じっても、3:2 が同じなら
 * 場所取りは正しく、下の文やボタンが飛ぶことはない。
 *
 * 比の違う絵を足すときは、この値では足りない。1枚ずつ実寸を持たせること。
 */
export const TEACHING_IMAGE_WIDTH = 1536;
export const TEACHING_IMAGE_HEIGHT = 1024;

export interface TeachingImageProps {
  src: string;
  /** 何の図か。1文で。絵の中の文字を書き写さない。 */
  alt: string;
  className?: string;
}

export function TeachingImage({ src, alt, className = "" }: TeachingImageProps) {
  return (
    /*
      親で丸めて隠す。img 側だけを丸めると、拡大縮小の途中で
      角の外に1px はみ出すことがある。
    */
    <div
      data-testid="teaching-image"
      className={`w-full max-w-full overflow-hidden rounded-card ${className}`}
    >
      <img
        src={src}
        alt={alt}
        width={TEACHING_IMAGE_WIDTH}
        height={TEACHING_IMAGE_HEIGHT}
        loading="lazy"
        decoding="async"
        /*
          `h-auto` と `aspect-[3/2]` を両方置いている。
          比は読み込み前の場所取りに効き、`h-auto` は読み込み後に
          実寸の比へ従わせる。どちらか片方だけだと、絵を差し替えて
          比が変わったときに縦に伸びる。
        */
        className="block aspect-[3/2] h-auto w-full max-w-full object-contain"
      />
    </div>
  );
}
