/**
 * 4つの力を、ひし形で。
 *
 * これは「スキルバランス」側の見せ方で、道（`GrowthTrack`）と
 * 切り替えて出す。どちらか一方しか出さない——同じことを2通りで
 * 同時に見せると、どちらを読めばよいのか決められなくなる。
 *
 * 道と何が違うか
 * --------------
 *     道       いま**どこまで来たか**。1本の順序がある
 *     ひし形   4つのうち**どこが薄いか**。順序ではなく形
 *
 * 道は「次に何をするか」に強く、ひし形は「どこが偏っているか」に強い。
 * 人によって知りたいほうが違うので、選べるようにしてある。
 *
 * 4軸のひし形について
 * -------------------
 * 軸が4つだと、レーダーは正方形を回した形にしかならない。面積は
 * 見かけほど意味を持たない（隣り合う軸の積で決まるので、離れた
 * 2軸が高くても面積は増えない）。**読むのは頂点の位置**であって
 * 広さではない、と分かるように、目盛りの輪と数字を必ず添える。
 *
 * 動き
 * ----
 * 青い面と4つの点だけが、中心から実際の位置へ 0.7 秒で開く。
 *
 * 一度これを消したことがある。「広がりきるまで、いちばん見たい
 * 『どこが薄いか』が読めない」という理由だったが、**消す相手を
 * 間違えていた**——読めなくしていたのは、軸も目盛りも名前も
 * **全部まとめて**動かしていたことのほう。枠が動かなければ、形が
 * 決まっていく 0.7 秒はそのまま「自分の結果が出てくる」時間になる。
 *
 * だから動かすものを分けた。
 *
 *     動かさない … 目盛りの輪・軸の線・軸の名前（最初から最後の姿）
 *     動かす     … 青い面と、4つの点だけ
 *
 * 跳ね返らせない。繰り返さない。戻ってきたときにも再生しない
 * （同じ結果を見るたびに動くと、読み返しの邪魔にしかならない）。
 *
 * 途中の値は、結果ではない
 * ------------------------
 * 広がる途中の形は**演出の値**で、採点の結果ではない。読み上げ
 * （`aria-label`）には最初から確定した段だけを渡す——途中を読ませると、
 * 目で見ている人には見えない「0点」の瞬間を読み上げだけが言うことになる。
 */

import { useEffect, useState } from "react";

import { prefersReducedMotion } from "../../../course/motion";
import { AXES, AXIS_LABELS, type Axis } from "../../../course/diagnosisScore";

/** 図の中に置く短い名前。正式な名前は読み上げと凡例が持つ。 */
const SHORT: Record<Axis, string> = {
  ask: "頼む",
  condition: "条件",
  purpose: "目的",
  workflow: "仕事",
};

/** 上・右・下・左。積み上げの順に時計回りで置く。 */
const ANGLE: Record<Axis, number> = {
  ask: -90,
  condition: 0,
  purpose: 90,
  workflow: 180,
};

const MAX = 5;

/** 中心から開ききるまで（ミリ秒）。 */
const SPREAD = 700;

/**
 * もう開いて見せた結果。**この部品の外に置く。**
 *
 * なぜ `useRef` では足りないか
 * ----------------------------
 * 4つの力の画面からおすすめへ進むと、この部品は**画面ごと消える**
 * （`DiagnosisResult` が場面で中身を差し替える）。戻ってくると新しく
 * 作り直されるので、`useRef` に覚えさせた「もう見せた」は一緒に消える
 * ——戻るたびに中心から開き直すことになる。
 *
 * なぜ1つだけか
 * -------------
 * 見せた鍵を全部ためると、答えを直して**同じ結果**に戻した人に
 * 二度と再生されなくなる。ここは直前の1つだけ覚える。
 *
 * 新しく診断を終えたときは、整理中の1枚が消してくれる
 * （`Analyzing` → `resetRadarSpread`）。
 */
let spreadShown: string | null = null;

/**
 * 「もう見せた」を忘れる。
 *
 * 新しい結果を作り始めたときに呼ぶ。同じ点数に戻った人にも、
 * **新しく答え終わった回は**もう一度出すため。
 */
export function resetRadarSpread(): void {
  spreadShown = null;
}

/*
  図の形は、**大きさに依らない座標で描く。**

  前は 92px 角と 208px 角の2つを、それぞれの実寸で書いていた。結果の
  画面に置けるのは 92px——いちばん低い持ち方（402×660）で送らずに
  収まる上限がそこだったため——で、**読むには小さい**と言われた。

  いまは 100×100 の升目で描き、実寸は置いた側が決める。置き場が
  縦に余っていれば、そのぶん図が大きくなる（下の `fluid`）。同じ
  ものを2度書かないので、片方だけ直して形がずれることも無い。

  線の太さだけは升目に連れて太らせない（`non-scaling-stroke`）。
  一緒に太らせると、大きい図で輪郭ばかりが目立つ。
*/
const BOX = 100;
const CENTER = BOX / 2;
const RADIUS = 35;

function at(axis: Axis, value: number): [number, number] {
  const radians = (ANGLE[axis] * Math.PI) / 180;
  const length = (Math.max(0, Math.min(MAX, value)) / MAX) * RADIUS;
  return [CENTER + Math.cos(radians) * length, CENTER + Math.sin(radians) * length];
}

function polygon(values: Record<Axis, number>): string {
  return AXES.map((axis) => at(axis, values[axis]).join(",")).join(" ");
}

/**
 * 置き方は2通り。
 *
 *   fluid  … 置き場の縦幅いっぱいまで。結果の画面はこちら
 *   lg     … 決め打ち。開いた一枚の中はこちら
 *
 * `fluid` に下限（92px）を置いてあるのは、いちばん低い持ち方でも
 * 形が潰れないため。上限（220px）は、横に広い端末で図だけが
 * 大きくなりすぎないため。
 */
const SHAPE = {
  fluid: {
    /*
      上限を 220 → 272px へ、下限を 92 → 120px へ上げた。

      上に置いていた1行の説明（「4つのうち、どこが薄いかを見ます。」）を
      外し、下の3行を詰めたぶんが、そのまま図へ渡る。図はこの画面の
      主役で、**小さいと軸の名前と目盛りが読めない**——単に拡大すると
      名前が外へはみ出すので、名前の置き場（下の `place`）ごと見直して
      ある。
    */
    /*
      下限は、低い端末ではもう一段下げる。7.5rem（120px）で固定して
      いたので、320×568 の「4つの力」が 54px あふれていた。
      6rem（96px）でも4つの頂点の関係は読める。
    */
    box:
      "aspect-square h-full max-h-[17rem] min-h-[6rem] " +
      "[@media(min-height:700px)]:min-h-[7.5rem]",
    label: "text-xs",
    dot: 2.6,
    focusDot: 3.6,
  },
  lg: {
    box: "aspect-square w-[13rem]",
    label: "text-xs",
    dot: 2.6,
    focusDot: 3.6,
  },
} as const;

export type RadarSize = keyof typeof SHAPE;

export interface RadarChartProps {
  axes: Record<Axis, number>;
  /** 次に伸ばすところ。頂点を1つだけ強く出す。 */
  focus?: Axis;
  /** 置き方。既定は置き場の高さいっぱい。 */
  size?: RadarSize;
}

export function RadarChart({ axes, focus, size = "fluid" }: RadarChartProps) {
  const { box, label: LABEL, dot, focusDot } = SHAPE[size];

  /*
    開き具合。0 が中心、1 が確定した形。**これは演出の値**で、
    採点の結果（`axes`）には触れない。

    再生するのは**その結果を初めて描いたときだけ。** 値が同じまま
    描き直されたり、戻ってきたりしたときは動かさない——読み返すたびに
    図が動くと、見たいものが毎回 0.7 秒遅れて出てくる。

    見分けるのは「4つの段を並べた文字列」。同じ回答なら同じ文字列に
    なるので、これが変わったときだけが**新しい結果**。
  */
  const key = AXES.map((axis) => axes[axis]).join("-");
  const [open, setOpen] = useState(() => (spreadShown === key ? 1 : 0));

  useEffect(() => {
    /* もう見せた結果。完成形のまま置く */
    if (spreadShown === key) {
      setOpen(1);
      return;
    }

    /* 動きを減らす設定では、完成形をそのまま置く */
    if (prefersReducedMotion()) {
      spreadShown = key;
      setOpen(1);
      return;
    }

    /*
      1コマずつ自分で進める。

      CSS の transition には任せられない。多角形の形は `points`
      属性で持っていて、**そこは CSS では動かない**（座標の並びは
      アニメーションできる値ではない）。`transform: scale()` で
      代用する手もあるが、それだと点の大きさまで一緒に膨らむ。

      動かしたいのは**座標だけ**なので、開き具合を数として持ち、
      毎コマ座標を計算し直す。行き過ぎて戻る動き（跳ね返り）を
      持たない曲線にしてある——ここは結果を読む図で、弾ませる
      場面ではない。
    */
    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - started) / SPREAD);
      /* ゆっくり止まる。1 を超えないので、行き過ぎて戻ることが無い */
      setOpen(1 - Math.pow(1 - ratio, 3));
      if (ratio < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      /*
        **開ききってから覚える。** 始めた時点で覚えると、開発中の
        作り直し（StrictMode の二度がけ）で1回目が取り消されたあと、
        2回目が「もう見せた」と判断して**中心に畳まれたまま**止まる。
        実際そうなって、図が出ないまま残った。
      */
      spreadShown = key;
    };
    setOpen(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key]);

  /*
    次に目指すところ。**いまより1つだけ上。**

    「満点の形」を重ねると、どの軸も遠く見えて、次に何をすれば
    よいのかがかえって分からない。1つ上なら手が届く。

    根拠はある——`scoreDiagnosis` が返す段（1〜5）の、1つ上。
    段は「上へ届いた分だけ上げる」形で出していて（`toStep`）、
    次の段は**次に届くべきところ**そのもの。固定値ではないので
    残してある。
  */
  const target = AXES.reduce(
    (acc, axis) => {
      acc[axis] = Math.min(MAX, axes[axis] + 1);
      return acc;
    },
    {} as Record<Axis, number>,
  );

  /** 開き具合を掛けた、いまの描画用の値。 */
  const drawn = AXES.reduce(
    (acc, axis) => {
      acc[axis] = axes[axis] * open;
      return acc;
    },
    {} as Record<Axis, number>,
  );

  return (
    <div
      data-testid="radar-chart"
      data-size={size}
      className={size === "fluid" ? "flex min-h-0 flex-1 flex-col" : ""}
    >
      <div className={`relative mx-auto ${box}`}>
        <svg
          viewBox={`0 0 ${BOX} ${BOX}`}
          className="h-full w-full"
          role="img"
          aria-label={AXES.map(
            (axis) => `${AXIS_LABELS[axis]} 5段階のうち ${axes[axis]}`,
          ).join("、")}
        >
          {/* 目盛りの輪。5つ。読むのは広さではなく頂点の位置 */}
          {[1, 2, 3, 4, 5].map((ring) => (
            <polygon
              key={ring}
              points={polygon({ ask: ring, condition: ring, purpose: ring, workflow: ring })}
              className="fill-none stroke-brand-line"
              strokeWidth={ring === MAX ? 1.2 : 0.8}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {/* 軸の線 */}
          {AXES.map((axis) => (
            <line
              key={axis}
              x1={CENTER}
              y1={CENTER}
              x2={at(axis, MAX)[0]}
              y2={at(axis, MAX)[1]}
              className="stroke-brand-line"
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/*
            ここから下だけが動く。枠（目盛り・軸）は上で描き終えていて、
            中心から開くあいだも最初の姿のまま座っている。
          */}
          <g>
            {/* 次に目指す形。破線なので、いまの形と取り違えない */}
            <polygon
              points={polygon(target)}
              className="fill-none stroke-brand"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              opacity={0.55 * open}
            />
            {/* いまの形 */}
            <polygon
              points={polygon(drawn)}
              className="fill-brand stroke-brand"
              fillOpacity={0.18}
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {AXES.map((axis) => {
              const [x, y] = at(axis, drawn[axis]);
              return (
                <circle
                  key={axis}
                  cx={x}
                  cy={y}
                  r={axis === focus ? focusDot : dot}
                  className={
                    axis === focus
                      ? "fill-canvas stroke-brand"
                      : "fill-brand stroke-brand"
                  }
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>
        </svg>

        {/*
          軸の名前。SVG の中に文字を置くと、端末の文字サイズ設定を
          無視して縮む。外に HTML で置いて、拡大にも付いていけるようにする。
        */}
        {AXES.map((axis) => {
          /*
            上下の名前は、**枠の内側**に置く。

            外へ半分はみ出す置き方（`translate-y-1/2`）だと、下の
            「目的」が枠の下 8px にぶら下がり、そのすぐ下の凡例と
            文字どうしが重なる。輪の半径を内側へ寄せてあるので、
            枠の中に名前を置く余地がある。

            左右は外へ出したままでよい。横は余っている。
          */
          const place: Record<Axis, string> = {
            ask: "left-1/2 top-0 -translate-x-1/2",
            condition: "right-0 top-1/2 translate-x-full -translate-y-1/2 pl-1",
            purpose: "left-1/2 bottom-0 -translate-x-1/2",
            workflow: "left-0 top-1/2 -translate-x-full -translate-y-1/2 pr-1",
          };
          return (
            <span
              key={axis}
              aria-hidden="true"
              className={`absolute whitespace-nowrap leading-4 ${LABEL} ${
                axis === focus ? "font-bold text-brand-dark" : "text-ink-muted"
              } ${place[axis]}`}
            >
              {SHORT[axis]}
            </span>
          );
        })}
      </div>

      {/*
        凡例。**線が2種類ある図に、凡例が無いのは不親切。**
        色だけで分けず、実線と破線でも分けてある。
      */}
      <p
        className="mt-1 flex items-center justify-center gap-3 text-[0.625rem]
                   text-ink-muted [@media(min-height:700px)]:mt-1.5"
      >
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-brand" />
          いま
        </span>
        <span className="flex items-center gap-1">
          <span
            aria-hidden="true"
            className="h-0 w-4 border-t-2 border-dashed border-brand opacity-60"
          />
          次に目指す
        </span>
      </p>
    </div>
  );
}
