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
 * 中心から広がる。0.4秒で、跳ねさせない。動きを止めている人には
 * 広がりきった形がそのまま出る。
 */

import { useEffect, useState } from "react";

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

/**
 * 大きさは2通り。
 *
 * 結果の画面に置くほう（`sm`）は、いちばん低い持ち方（402×660）で
 * 送らずに収まる上限がここ。**それでも小さい**ので、押すと一枚の中で
 * 大きく開く（`lg`）。図を読むこと自体が目的の場面では、収める都合に
 * 縛られる理由が無い。
 */
const SIZES = {
  sm: { box: 92, radius: 31, label: "text-[0.625rem]", dot: 2.8, focusDot: 4 },
  lg: { box: 208, radius: 74, label: "text-xs", dot: 4.5, focusDot: 6.5 },
} as const;

export type RadarSize = keyof typeof SIZES;

function at(box: number, radius: number, axis: Axis, value: number): [number, number] {
  const center = box / 2;
  const radians = (ANGLE[axis] * Math.PI) / 180;
  const length = (Math.max(0, Math.min(MAX, value)) / MAX) * radius;
  return [center + Math.cos(radians) * length, center + Math.sin(radians) * length];
}

export interface RadarChartProps {
  axes: Record<Axis, number>;
  /** 次に伸ばすところ。頂点を1つだけ強く出す。 */
  focus?: Axis;
  size?: RadarSize;
}

export function RadarChart({ axes, focus, size = "sm" }: RadarChartProps) {
  const { box: SIZE, radius: RADIUS, label: LABEL, dot, focusDot } = SIZES[size];
  const CENTER = SIZE / 2;
  const point = (axis: Axis, value: number) => at(SIZE, RADIUS, axis, value);
  const polygon = (values: Record<Axis, number>) =>
    AXES.map((axis) => point(axis, values[axis]).join(",")).join(" ");
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /*
    次に目指すところ。**いまより1つだけ上。**

    「満点の形」を重ねると、どの軸も遠く見えて、次に何をすれば
    よいのかがかえって分からない。1つ上なら手が届く。
  */
  const target = AXES.reduce(
    (acc, axis) => {
      acc[axis] = Math.min(MAX, axes[axis] + 1);
      return acc;
    },
    {} as Record<Axis, number>,
  );

  return (
    <div data-testid="radar-chart" data-size={size}>
      <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
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
            />
          ))}
          {/* 軸の線 */}
          {AXES.map((axis) => (
            <line
              key={axis}
              x1={CENTER}
              y1={CENTER}
              x2={point(axis, MAX)[0]}
              y2={point(axis, MAX)[1]}
              className="stroke-brand-line"
              strokeWidth={0.8}
            />
          ))}

          <g
            style={{
              transform: drawn ? "scale(1)" : "scale(0.05)",
              transformOrigin: `${CENTER}px ${CENTER}px`,
              opacity: drawn ? 1 : 0,
              transition: "transform 400ms cubic-bezier(0.2,0.8,0.2,1), opacity 250ms",
            }}
          >
            {/* 次に目指す形。破線なので、いまの形と取り違えない */}
            <polygon
              points={polygon(target)}
              className="fill-none stroke-brand"
              strokeWidth={1.2}
              strokeDasharray="3 3"
              opacity={0.55}
            />
            {/* いまの形 */}
            <polygon
              points={polygon(axes)}
              className="fill-brand stroke-brand"
              fillOpacity={0.18}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {AXES.map((axis) => {
              const [x, y] = point(axis, axes[axis]);
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
      <p className="mt-1.5 flex items-center justify-center gap-3 text-[0.625rem] text-ink-muted">
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
