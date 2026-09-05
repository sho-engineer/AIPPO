/**
 * いまどこにいるかを、1本の道で見せる。
 *
 * なぜ図なのか
 * ------------
 * 前はここが「いまの現在地 ＋ 段階の名前」という文字2行だった。
 * 名前だけ読んでも、**それが道のどのあたりなのか**が分からない。
 * 「条件を加えられる段階」と言われて、それが手前なのか奥なのかは、
 * 5つ並んだ点のうち3つ目が光っていれば一目で伝わる。
 *
 * なぜレーダーではないのか
 * ------------------------
 * 4軸のレーダーは、面積が意味を持たない図になりやすい。5段階×4軸だと
 * 隣どうしの差が角度に埋もれて読めず、**「なんとなくすごそう」だけが
 * 残る**。加えて、あの形はそれ自体が管理画面の記号で、この診断から
 * いちばん減らしたい「AIの分析結果を見せられている感じ」を強める。
 *
 * 道にすると、次の点が右隣にある。**次に何をするか**がそのまま形になる。
 *
 * 動き
 * ----
 * 道が左から伸び、いまいる点が最後に少し大きくなる。派手にしない
 * ——ここは達成を祝う画面ではなく、位置を確かめる画面なので。
 * 動きを止めている人には、伸びきった形がそのまま出る（index.css が
 * transition を一括で止めるので、途中の姿は作られない）。
 */

import { useEffect, useState } from "react";

import { STAGES } from "../../../course/diagnosisScore";

/**
 * 点の下に置く短い名前。
 *
 * 段階の正式な名前（「条件を加えられる段階」）はここには置かない。
 * 5つ並べると1つ 70px しかなく、入れると全部が2〜3行になって
 * 道が読めなくなる。長い名前は道の下に1つだけ出す。
 */
const SHORT: readonly string[] = ["試す", "頼む", "条件", "使い分け", "組み立て"];

export interface GrowthTrackProps {
  /** いまの段階（1〜5）。 */
  stage: number;
  /**
   * 大きさ。
   *
   * 結果の画面では小さく（`sm`）、押して開いた一枚の中では大きく
   * （`lg`）。図を読むこと自体が目的の場面では、1画面に収める都合に
   * 縛られる理由が無い。
   */
  size?: "sm" | "lg";
}

export function GrowthTrack({ stage, size = "sm" }: GrowthTrackProps) {
  const big = size === "lg";
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const last = STAGES.length - 1;
  const index = Math.min(last, Math.max(0, stage - 1));
  /* 点は等間隔。両端の点の中心どうしを結ぶので、割るのは 4 */
  const filled = (index / last) * 100;

  return (
    /*
      大きいときは、上に場所を空ける。

      いまいる点は道の**上下へはみ出して**座る（`-mt`）。大きくすると
      はみ出す量も増え、6px しか空けていない上の切り替えに乗り上げて
      いた——「現在地」の札の上に丸が重なって出ていた。
    */
    <div data-testid="growth-track" data-size={size} className={big ? "pt-2" : ""}>
      <div className="relative">
        {/*
          道そのもの。左右に点の半径ぶんの余白を作らず、**点の中心を
          端に置く**——道が点からはみ出していると、まだ先があるのか
          そこで終わりなのかが読めない。
        */}
        <div
          className={`relative mx-[10%] rounded-full bg-brand-line ${
            big ? "h-1.5" : "h-1"
          }`}
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
            style={{ width: `${drawn ? filled : 0}%` }}
            aria-hidden="true"
          />
        </div>

        <ul className="absolute inset-x-0 top-0 flex" role="list">
          {STAGES.map((one, at) => {
            const done = at <= index;
            const here = at === index;
            const next = at === index + 1;
            return (
              <li
                key={one.number}
                className="flex flex-1 flex-col items-center px-0.5"
                data-testid="growth-node"
                data-state={here ? "here" : done ? "done" : next ? "next" : "todo"}
              >
                <span
                  aria-hidden="true"
                  /*
                    まだ通っていない点は、**地色で塗って縁を描く。**

                    最初は薄い青の丸をそのまま置いていた。道も同じ薄い青
                    なので、4つとも道に溶けて見えず、光っている1つ以外
                    どこにも点が無い（＝5つ並んだ道に見えない）状態だった。
                  */
                  className={`block rounded-full border-2 transition duration-300 ease-out ${
                    big ? "-mt-[9px]" : "-mt-[3px]"
                  } ${
                    here
                      ? `${big ? "h-6 w-6" : "h-4 w-4"} border-brand bg-brand ring-4 ring-brand-soft`
                      : `${big ? "h-4 w-4" : "h-2.5 w-2.5"} ${
                          done
                            ? "border-brand bg-brand"
                            : next
                              ? "border-brand bg-canvas"
                              : "border-brand-line bg-canvas"
                        }`
                  }`}
                  style={{
                    transform: drawn && here ? "scale(1)" : here ? "scale(0.6)" : undefined,
                    transitionDelay: `${300 + at * 40}ms`,
                  }}
                />
                {/*
                  名前は色と太さで差を付ける。**光っている点の位置だけ**で
                  現在地を示すと、色が見えにくい人には道が5つ並んだ
                  ただの飾りになる。
                */}
                <span
                  className={`leading-4 ${big ? "mt-3 text-xs" : "mt-2 text-[0.6875rem]"} ${
                    here ? "font-bold text-brand-dark" : "text-ink-muted"
                  }`}
                >
                  {SHORT[at]}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/*
        いまいるところの名前。読み上げには、道ではなくこの文が届く
        ——点の並びは飾りとして隠してある。
      */}
      <p
        className={`font-bold leading-6 text-brand-dark ${
          big ? "mt-11 text-center text-base" : "mt-8 text-[0.9375rem]"
        }`}
        data-testid="growth-stage-name"
      >
        {STAGES[index].name}
      </p>
      {/* 一枚の中では、段階の説明も添える。読むために開いた場所なので */}
      {big && (
        <p className="mt-1 text-center text-sm leading-6 text-ink-muted">
          {STAGES[index].summary}
        </p>
      )}
      <p className="sr-only">
        5つの段階のうち {STAGES[index].number} つ目です。
      </p>
    </div>
  );
}
