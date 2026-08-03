/**
 * タイトル画面の背景。
 *
 * 一色で塗った面の上に要素を並べただけの画面は、
 * どれだけ配色を整えても「作り置き」に見える。
 * 見えているのが一枚の平らな板だからで、直し方は奥行きを足すこと。
 *
 * ここでは4層に分けている。
 *
 *   空   … グラデーション（動かない）
 *   遠景 … ぼかした大きな面。とてもゆっくり揺れる
 *   丘   … ポーが立つ地面。2枚重ねて前後を作る
 *   手前 … 泡ときらめき。速さも大きさも散らす
 *
 * 速さを層ごとに変えるのが肝心で、全部同じ速さで動かすと
 * 一枚の板が揺れているようにしか見えない。
 *
 * すべて飾りなので読み上げからは外し、押せる場所も奪わない。
 * 置く場所はタイトル画面の中。ページ全体に敷くと、泡が
 * 画面の外まで流れていって、肝心の1画面目には何も出てこない。
 */

/**
 * 泡。
 *
 * 位置・大きさ・速さ・遅れを、わざと不揃いにしてある。
 * 等間隔に並べると模様になってしまい、
 * 「機械が置いた」感じがかえって強く出る。
 */
const BUBBLES = [
  { left: "7%", size: 10, delay: -1, duration: 16, tone: "bg-brand-bright/60" },
  { left: "17%", size: 22, delay: -9, duration: 22, tone: "bg-brand-line/70" },
  { left: "28%", size: 7, delay: -4, duration: 13, tone: "bg-brand-bright/70" },
  { left: "41%", size: 15, delay: -13, duration: 19, tone: "bg-brand-line/60" },
  { left: "57%", size: 9, delay: -6, duration: 15, tone: "bg-joy/30" },
  { left: "68%", size: 26, delay: -17, duration: 25, tone: "bg-brand-line/50" },
  { left: "79%", size: 12, delay: -2, duration: 17, tone: "bg-brand-bright/60" },
  { left: "91%", size: 8, delay: -11, duration: 14, tone: "bg-brand-line/70" },
] as const;

/** きらめき。ロゴの周りに少しだけ。多いと安っぽくなる。 */
const SPARKS = [
  { left: "22%", top: "14%", size: 9, delay: -0.4 },
  { left: "76%", top: "9%", size: 12, delay: -1.6 },
  { left: "84%", top: "27%", size: 7, delay: -2.3 },
  { left: "13%", top: "32%", size: 8, delay: -1.1 },
] as const;

export function TitleBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* 空。上をブランド色に寄せて、下へ抜けていく */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-soft via-canvas to-canvas" />

      {/*
        ぼかした大きな面。輪郭が出ないくらい強くぼかす。
        輪郭が見えると「丸を置いた」だけに見えてしまう。
        2枚目はほおの色を薄く敷いて、青一色になるのを避ける。
      */}
      <div className="absolute -left-24 -top-32 h-80 w-80 animate-sway rounded-full bg-brand-bright/25 blur-3xl" />
      <div className="absolute -right-24 top-12 h-72 w-72 animate-sway rounded-full bg-joy-soft blur-3xl [animation-delay:-7s]" />
      <div className="absolute left-1/3 top-56 h-64 w-64 animate-sway rounded-full bg-brand-line/30 blur-3xl [animation-delay:-13s]" />

      {/*
        丘。決め事が3つある。
        - 奥は薄く、手前は濃く。逆にすると前後が入れ替わって見える
        - 左右のはみ出し方をずらす。同じにすると左右対称になり、
          そこだけで作り置きの見た目に戻る
        - 高さは画面に対する割合で置く。中身に紐づけると、
          文章が1行増えただけで地面の高さが動く
      */}
      <div className="absolute bottom-0 left-[-40%] right-[-8%] h-[48%] rounded-t-[100%] bg-brand-soft" />
      <div className="absolute bottom-0 left-[-10%] right-[-38%] h-[34%] rounded-t-[100%] bg-brand-line/55" />

      {/* 泡。丘より手前に流して、地面の上を通っていくように見せる */}
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
          className="absolute animate-twinkle rounded-full bg-brand-bright"
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
