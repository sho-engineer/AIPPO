/**
 * タイトル画面の背景。
 *
 * 一色で塗った面の上に要素を並べただけの画面は、どれだけ配色を整えても
 * 「作り置き」に見える。見えているのが一枚の平らな板だからで、
 * 直し方は奥行きを足すこと。
 *
 * ただし足しすぎると今度は他の画面から浮く。
 * 支給デザインの下地はほぼ白で、色は「カードの影」と「印の丸」でしか
 * 出していない。以前ここには水色の丘を2枚重ねていたが、それだけが
 * 別のアプリの絵になってしまうのでやめた。
 *
 * いま残しているのは3層。
 *
 *   もや … 大きくぼかした面。とてもゆっくり揺れる
 *   泡   … 下から上へ抜ける。数は絞る
 *   光   … ロゴの周りに少しだけ
 *
 * 速さを層ごとに変えるのが肝心で、全部同じ速さで動かすと
 * 一枚の板が揺れているようにしか見えない。
 *
 * すべて飾りなので読み上げからは外し、押せる場所も奪わない。
 * 置く場所はタイトル画面の中。ページ全体に敷くと、泡が画面の外まで
 * 流れていって、肝心の1画面目には何も出てこない。
 */

/**
 * 泡。
 *
 * 位置・大きさ・速さ・遅れを、わざと不揃いにしてある。
 * 等間隔に並べると模様になってしまい、
 * 「機械が置いた」感じがかえって強く出る。
 */
const BUBBLES = [
  { left: "9%", size: 10, delay: -1, duration: 16, tone: "bg-brand-bright/35" },
  { left: "24%", size: 20, delay: -9, duration: 22, tone: "bg-brand-line/45" },
  { left: "44%", size: 7, delay: -4, duration: 13, tone: "bg-brand-bright/40" },
  { left: "63%", size: 24, delay: -17, duration: 25, tone: "bg-brand-line/35" },
  { left: "81%", size: 11, delay: -2, duration: 17, tone: "bg-brand-bright/35" },
  { left: "93%", size: 8, delay: -11, duration: 14, tone: "bg-brand-line/45" },
] as const;

/** きらめき。ロゴの周りに少しだけ。多いと安っぽくなる。 */
const SPARKS = [
  { left: "22%", top: "14%", size: 8, delay: -0.4 },
  { left: "76%", top: "9%", size: 10, delay: -1.6 },
  { left: "84%", top: "27%", size: 6, delay: -2.3 },
  { left: "13%", top: "32%", size: 7, delay: -1.1 },
] as const;

export function TitleBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/*
        もや。輪郭が出ないくらい強くぼかす。
        輪郭が見えると「丸を置いた」だけに見えてしまう。
        濃さは body に敷いた下地と同じくらいに抑え、
        ここだけ色が濃くならないようにする。
      */}
      <div className="absolute -left-24 -top-28 h-80 w-80 animate-sway rounded-full bg-brand-bright/20 blur-3xl" />
      <div className="absolute -right-24 top-16 h-72 w-72 animate-sway rounded-full bg-brand-soft blur-3xl [animation-delay:-7s]" />
      <div className="absolute left-1/4 bottom-4 h-72 w-72 animate-sway rounded-full bg-brand-line/25 blur-3xl [animation-delay:-13s]" />

      {/* 泡 */}
      {BUBBLES.map((bubble) => (
        <span
          key={bubble.left}
          className={`absolute bottom-0 animate-drift rounded-full ${bubble.tone}`}
          style={{
            left: bubble.left,
            width: `${bubble.size}px`,
            height: `${bubble.size}px`,
            animationDuration: `${bubble.duration}s`,
            // 負の遅れ＝途中から始める。開いた瞬間に全部が
            // 下から一斉に上がると、演出が始まったことがばれる
            animationDelay: `${bubble.delay}s`,
          }}
        />
      ))}

      {/* きらめき */}
      {SPARKS.map((spark) => (
        <span
          key={`${spark.left}-${spark.top}`}
          className="absolute animate-twinkle rounded-full bg-brand-bright/70"
          style={{
            left: spark.left,
            top: spark.top,
            width: `${spark.size}px`,
            height: `${spark.size}px`,
            animationDelay: `${spark.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
