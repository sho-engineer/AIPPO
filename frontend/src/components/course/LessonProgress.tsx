/**
 * レッスンの進み具合。
 *
 * 細い帯と、いまいる区切りの名前・番号だけ。
 *
 * 前は3つの部品で同じことを言っていた——区切りの帯（4段）、丸の列
 * （最大7つ）、そして数字。同じ情報を3段で出すと、どれを見れば
 * 「あと何回か」が分かるのかが決められず、結局どれも読まれない。
 * 画面の上のほうが説明で埋まって、本文が下へ押し出される問題もあった。
 *
 * 残したのは「あとどれくらいか」と「いまどこか」だけ。
 * この2つは、進むたびに変わるので、変化そのものが手応えになる。
 *
 * 区切り（ミッション）
 * --------------------
 * 帯を4つに割り、いまいる区切りの名前を左に出す。
 *
 * 分数を2つにしない。前に3段で同じことを言って読まれなくなった件と
 * 同じ轍で、「2 / 4」と「3 / 19」が並ぶと、どちらを見ればよいのか
 * 決められなくなる。**割れ目は形で、名前は言葉で**出し、数字は1つだけ。
 *
 * その1つは**区切りの番号**にしてある（2 / 4）。内部の歩数（3 / 19）は
 * 実装上の数で、学習者にとって意味を持たない。細かい進み具合は
 * 帯の幅が持っているので、数字まで細かくする必要が無い。
 *
 * なぜ割るか
 * ----------
 * 19歩の一本道に見えると、始めた人はまず「あと16回も押すのか」と
 * 思う。実際の中身は4つのまとまりで、どれも数歩で終わる。
 * その形が画面に出ていなかった。
 *
 * 伸びる動き
 * ----------
 * 帯は幅を transition で伸ばす。瞬間で変わると、進んだことに
 * 気づかない。動きを止めている人には幅の値だけが残るが、
 * 数字も並べてあるので意味は落ちない。
 */

import { EASING, MOTION } from "../../course/motion";
import type { Mission } from "../../course/missions";

export interface LessonProgressProps {
  current: number;
  total: number;
  /** 区切り（ミッション）。無ければ帯を割らない。 */
  missions?: Mission[];
  /**
   * 区切りの名前の代わりに出す文字。
   *
   * 区切りを持たない流れ——診断のように「5つ聞いて終わり」というもの
   * ——では、`missions` から取れる名前が場面と合わない。診断では
   * 「試す」「自分で使う」と出ていて、聞かれているのは自分のことなのに
   * 何かを試している最中に見えていた。
   */
  label?: string;
  /** 右に出す数え方。`3 / 19` のような内部の歩数を出したくないときに使う。 */
  count?: string;
  /** いま何番目の区切りか。1始まり。 */
  currentMission?: number;
}

export function LessonProgress({
  current,
  total,
  missions = [],
  label,
  count,
  currentMission = 0,
}: LessonProgressProps) {
  const safeTotal = Math.max(1, total);
  const ratio = Math.min(1, Math.max(0, current / safeTotal));
  const here = missions[currentMission - 1];

  return (
    <div
      role="progressbar"
      aria-label="レッスンの進み具合"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={safeTotal}
      /*
        読み上げにも、内部の歩数は渡さない。

        `aria-valuenow` / `valuemax` は帯の伸び具合として細かい数を
        持っているが、**読まれるのは valuetext のほう**。ここで
        「19歩のうち3歩目」と言うと、目で見ている人には隠した数字を
        読み上げだけに出すことになる。
      */
      aria-valuetext={
        here
          ? `${missions.length}つのうち${currentMission}つ目。いまは「${here.label}」`
          : `${Math.round(ratio * 100)}パーセント`
      }
      data-testid="lesson-progress"
    >
      {/*
        帯そのもの。高さは 3px。太くすると、それだけで画面の主役になる。

        割れ目は帯の**上に重ねる**。区切りごとに要素を分けて並べると、
        伸びる動きが区切りの端で止まって見える（1本の帯が伸びるのと、
        4本が順に埋まるのとでは、進んでいる感じが違う）。
      */}
      <div className="relative h-[3px] overflow-hidden rounded-full bg-brand-line">
        <div
          className="h-full rounded-full bg-brand"
          style={{
            width: `${ratio * 100}%`,
            transition: `width ${MOTION.normal}ms ${EASING}`,
          }}
        />
        {missions.length > 1 &&
          missions.slice(0, -1).map((mission, index) => {
            const upTo = missions
              .slice(0, index + 1)
              .reduce((sum, item) => sum + item.steps, 0);
            return (
              <span
                key={mission.key}
                aria-hidden="true"
                className="absolute top-0 h-full w-0.5 bg-surface"
                style={{ left: `${(upTo / safeTotal) * 100}%` }}
              />
            );
          })}
      </div>

      {/*
        名前も数も無いときは、行そのものを作らない。

        空の行でも 16px ＋ 上の余白 6px を取る。診断の結果の画面には
        区切りの名前も何問目も無く、そこだけで 22px を空の行に使って
        いた——1画面に収める柱では、その 22px が図から引かれる。
      */}
      {(label ?? here?.label ?? "") !== "" ||
      (count ?? (missions.length > 1 ? `${currentMission} / ${missions.length}` : "")) !==
        "" ? (
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        {/*
          いまどの区切りにいるか。名前だけを出す。
          分数を2つ並べると、どちらを見ればよいのか決められなくなる。
        */}
        <span
          className="min-w-0 truncate text-xs text-ink-muted"
          data-testid="lesson-mission"
        >
          {label ?? here?.label ?? ""}
        </span>
        {/*
          区切りの番号だけを出す。**内部の歩数は出さない。**

          前は「3 / 19」と書いていた。19 はステップの実装上の数で、
          学習者にとっては意味を持たない——中身は4つのまとまりに
          分かれていて、どれも数歩で終わる。19 と言われた人が最初に
          思うのは「あと16回も押すのか」で、これは実際より長く感じる。

          帯の幅が細かい進み具合を持っているので、数字は
          「4つのうち2つ目」だけでよい。
        */}
        {(count ?? (missions.length > 1 ? undefined : "")) !== "" && (
          <span
            className="shrink-0 text-xs tabular-nums text-ink-muted"
            data-testid="lesson-mission-count"
          >
            {count ?? `${currentMission} / ${missions.length}`}
          </span>
        )}
      </div>
      ) : null}
    </div>
  );
}
