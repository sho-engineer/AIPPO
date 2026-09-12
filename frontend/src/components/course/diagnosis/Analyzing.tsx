/**
 * 答え終わってから、結果が出るまでの1画面。
 *
 * なぜ待たせるのか
 * ----------------
 * 5問目を押した瞬間に結果が出ていた。計算は一瞬で終わるので、
 * そのほうが速い——けれど**アンケートに見えた**。押した／出た、の
 * 2コマしかないと、答えが読まれた実感が残らない。
 *
 * ここで足しているのは待ち時間ではなく、**何を見て判断したか**。
 * 4つの観点が順に点くので、結果の画面に出てくる4つの力が、
 * どこから来たのかが分かる。
 *
 * うそをつかない
 * --------------
 * 「AIが解析しています」とは書かない。この診断は AI を呼ばない
 * （`course/diagnosisScore.ts`）。書いてあるのは実際にしていること
 * ——4つの観点から答えを読む、そのもの。
 *
 * 派手にしない
 * ------------
 * 光・粒子・回るリングは置かない。学習アプリで「AIが計算している」
 * 演出をすると、そこがこのサービスの主役に見える。出すのは
 * **項目が順に点く**ことだけで、それ以上は要らない。
 *
 * 動きを止めている人
 * ------------------
 * 点くかどうかは JavaScript の時計で進めるので、動きを止めていても
 * 4つとも順に点く。変わるのは**移り変わりの見え方**だけ
 * （`index.css` が transition を一括で詰める）。白い画面は挟まない。
 */

import { useEffect, useState } from "react";

import { IconCheck } from "../../Icons";
import { AXES, AXIS_LABELS } from "../../../course/diagnosisScore";

/** 1つ点いてから次が点くまで（ms）。 */
const STEP = 380;

/**
 * 全部でどれくらい待つか（ms）。
 *
 * 4つ目が点いてから、読み終わるぶんだけ置いて結果へ移る。
 * 短すぎると4つ目を読む前に消え、長いと「固まった」に変わる。
 */
export const ANALYZING_MS = STEP * AXES.length + 320;

export function Analyzing({ onDone }: { onDone: () => void }) {
  /** いくつまで点いたか。 */
  const [lit, setLit] = useState(0);

  useEffect(() => {
    const timers = AXES.map((_, at) =>
      window.setTimeout(() => setLit(at + 1), STEP * at + 120),
    );
    timers.push(window.setTimeout(onDone, ANALYZING_MS));
    return () => timers.forEach((id) => window.clearTimeout(id));
    // onDone は毎回新しい関数で来るので、入れると時計が張り直される
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center" data-testid="diagnosis-analyzing">
      <ul className="space-y-2" role="list" aria-live="polite">
        {AXES.map((axis, at) => {
          const on = at < lit;
          return (
            <li
              key={axis}
              data-testid="analyzing-axis"
              data-lit={on ? "true" : "false"}
              /*
                点く前と後で、**箱の大きさを変えない。**

                字を太くするだけでも幅は動くが、行の高さは変わらない
                ので、下の行は動かない。枠と地の色だけで差を付ける。
              */
              className={`flex items-center gap-3 rounded-card border px-3.5 py-2.5
                          transition duration-300 ${
                            on
                              ? "border-brand-line bg-brand-soft/60"
                              : "border-line bg-surface"
                          }`}
            >
              {/*
                丸は、点く前から同じ大きさで置く。現れる形にすると、
                点いた瞬間に名前が右へ動く。
              */}
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center
                            rounded-full border transition duration-300 ${
                              on
                                ? "border-brand bg-brand text-white"
                                : "border-brand-line bg-canvas"
                            }`}
              >
                <IconCheck
                  className={`h-3 w-3 transition-opacity duration-300 ${
                    on ? "opacity-100" : "opacity-0"
                  }`}
                />
              </span>
              <span
                className={`min-w-0 flex-1 text-sm leading-6 transition-colors duration-300 ${
                  on ? "font-bold text-brand-dark" : "text-ink-muted"
                }`}
              >
                {AXIS_LABELS[axis]}力
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
