/**
 * Day1 の結果画面に出す、**変わったところ**。
 *
 * 全文より、何がどう変わったか
 * ----------------------------
 * 前はどの結果画面でも全文の読み比べだった。202字の専門文と、その
 * 書き直し。読めば分かるが、**いちばん見てほしい変化がその中に埋もれる**
 * ——実機で「長文が続く」「変化が分かりにくい」と言われたのがそこ。
 *
 * ここで先に出すのは、Before / After の対応する1〜2文と、測って
 * 言い切れる1行だけ。全文は「全文を見る」の一枚へ（全画面で開くので、
 * カードの中で送らせない）。
 *
 * 台本を書かない
 * --------------
 * 出す対はすべて**実際の2つの文章から取り出す**（`course/changePairs.ts`）。
 * 固定の例文にすると、その人の結果に出ていない変化を「変わったところ」
 * として見せることになる。気づきの1行も、測って分かることだけ
 * （`steps/Compare.tsx` の `changePointsOf`）。
 */

import { useState } from "react";

import { IconArrowDown, IconCheckCircle } from "../../Icons";
import { MoreButton, MoreSheet } from "../MoreSheet";
import { changePairs } from "../../../course/changePairs";
import { changePointsOf, NO_MEASURABLE_CHANGE } from "../steps/Compare";

export interface ChangesProps {
  /**
   * 直前の文章（1回目なら元の文章、2回目以降なら前の結果）。
   *
   * 無いことがある。サーバーが `result` を持たない返事をしたときで、
   * そのとき記録に残るのは `undefined`。**そこで画面ごと落とさない**
   * ——実際に落ちた（AIの返事を横取りする検査の書き間違いで、空の
   * JSON が返った）。落ちると白い画面になり、レッスンの続きへも
   * 戻る道へも行けなくなる。
   */
  before?: string;
  /** いま返ってきた文章。無いことがある（上と同じ理由）。 */
  after?: string;
  /** 今回足した条件。「何を変えた？」に出す。 */
  changed?: { label: string; value: string };
  /** そのとき起きたことの言葉。教材が持つ1行。 */
  note?: string;
  /** 指定した条件を全部並べるか（自分の文章の回）。 */
  conditions?: { label: string; value: string }[];
}

export function Changes({
  before,
  after,
  changed,
  note,
  conditions,
}: ChangesProps) {
  const [full, setFull] = useState(false);
  /* 文字が無くても落とさない。無いものは空として扱う */
  const from = before ?? "";
  const to = after ?? "";
  const pairs = changePairs(from, to);
  const points = changePointsOf(from, to, changed?.value);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="day1-changes">
      {/*
        何を変えたか。**今回足したものだけ。**

        全部の条件を毎回並べると、2回目以降は「前から入っていたもの」と
        「いま足したもの」の区別が付かない。区別が付かないと、
        変わった理由が自分の操作だと分からない。
      */}
      {changed && (
        <dl
          className="flex shrink-0 items-baseline gap-3 rounded-card bg-brand-soft/70
                     px-3.5 py-2"
          data-testid="changed-condition"
        >
          <dt className="shrink-0 whitespace-nowrap text-xs leading-5 text-ink-muted">
            {changed.label}
          </dt>
          <dd className="min-w-0 flex-1 text-right text-sm font-bold leading-5 text-brand-dark">
            {changed.value}
          </dd>
        </dl>
      )}

      {/*
        自分の文章の回だけ、指定した条件をぜんぶ並べる。

        あそこは**自分で組み立てたものが効いた**ことを確かめる画面
        なので、3行そろって出ているほうがよい。
      */}
      {conditions && conditions.length > 0 && (
        <ul
          className="shrink-0 space-y-1 rounded-card bg-brand-soft/70 px-3.5 py-2"
          role="list"
          data-testid="applied-conditions"
        >
          {conditions.map((one) => (
            <li key={one.label} className="flex items-baseline gap-3">
              <span className="shrink-0 whitespace-nowrap text-xs leading-5 text-ink-muted">
                {one.label}
              </span>
              <span className="min-w-0 flex-1 text-right text-sm font-bold leading-5 text-brand-dark">
                {one.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/*
        変わったところ。**対で見せる。**

        並べるのは1〜2組まで。3組目からは読む量が増えるだけで、
        「言葉が置きかわった」という気づきは増えない。
      */}
      <div className="mt-2.5 min-h-0 flex-1 overflow-hidden">
        {pairs.length > 0 ? (
          <ul className="space-y-2" role="list" data-testid="change-pairs">
            {pairs.map((pair, at) => (
              <li
                key={pair.after}
                /*
                  低い持ち方では、2組目を畳む。

                  402×660 でこの画面に渡せる高さに、2組と下の気づき・
                  全文を見る・問いの3択は載らない。**1組でも「言葉が
                  置きかわった」は伝わる**ので、組の数より、下の問いが
                  画面に残っているほうを取る。
                */
                className={`rounded-card border border-line bg-surface px-3 py-2.5 ${
                  at >= 1 ? "hidden [@media(min-height:760px)]:block" : ""
                }`}
                data-testid="change-pair"
              >
                <p className="line-clamp-2 text-[0.8125rem] leading-5 text-ink-muted">
                  {pair.before}
                </p>
                <p className="mt-1 flex items-start gap-1.5 text-sm leading-6">
                  <IconArrowDown
                    className="mt-1 h-3.5 w-3.5 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <span className="line-clamp-3 min-w-0 font-bold text-brand-dark">
                    {pair.after}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        ) : (
          /*
            対が取れないときは、黙って空にしない。

            丸ごと書き直されたときに無理やり組を作ると、対応していない
            2文が「ここが変わりました」として並ぶ（`changePairs`）。
            そのときは、測って分かることだけを言う。
          */
          <p
            className="text-sm leading-6 text-ink-muted"
            data-testid="change-pairs-empty"
          >
            全体が書き直されました。下の「全文を見る」で確かめられます。
          </p>
        )}
      </div>

      {/*
        気づき。**測って言い切れることだけ。**

        教材が持つ1行（`note`）があればそれを先に出す。無ければ
        測った結果から1本。どちらも無い日は、そう書く。
      */}
      <p
        className="mt-2.5 flex shrink-0 items-start gap-2 border-t border-line pt-2.5
                   text-sm leading-6"
        data-testid="change-note"
      >
        <IconCheckCircle className="mt-1 h-4 w-4 shrink-0 text-accent-teal" />
        <span className="min-w-0">
          {note ?? points[0] ?? NO_MEASURABLE_CHANGE}
        </span>
      </p>

      <div className="mt-2.5 shrink-0">
        <MoreButton testId="open-full-text" onClick={() => setFull(true)}>
          全文を見る
        </MoreButton>
      </div>

      {full && (
        /*
          全画面で開く。**カードの中で送らせない。**

          小さいシートに入れると、開いた瞬間から送ることになり、
          しかも背面のページと二重に送れる（`MoreSheet`）。
        */
        <MoreSheet
          placement="full"
          testId="full-text-sheet"
          title="全文"
          onClose={() => setFull(false)}
        >
          <section>
            <h3 className="text-xs font-bold text-ink-muted">書き直したあと</h3>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-7">
              {to}
            </p>
          </section>
          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">その前</h3>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-7 text-ink-muted">
              {from}
            </p>
          </section>
        </MoreSheet>
      )}
    </div>
  );
}
