/**
 * AIPPO Level の5段を、まとめて見る一枚。
 *
 * なぜ要るか
 * ----------
 * 結果の画面には、自分の段しか出ていない。「Lv.2 って何？」「上は
 * どうなるの？」と思った人の行き先が無く、**自分の位置が高いのか
 * 低いのかも分からない**。5つ並べて初めて、いまが分かる。
 *
 * なぜ画面を増やさないか
 * ----------------------
 * 結果を読んでいる途中に開くもので、読み終わって次へ行く操作ではない。
 * 画面ごと移ると、閉じたときに結果のどこに戻るかを別に決めないと
 * いけなくなる。一枚（`MoreSheet`）なら、閉じれば元の場所のまま。
 *
 * 土台は作らない
 * --------------
 * 開き方・背景の暗さ・背景の送り止め・焦点の閉じ込め・閉じたあとの
 * 焦点の戻し・端末の「戻る」で閉じる——**全部 `MoreSheet` が持って
 * いる**。ここでやるのは中身だけ。
 *
 * 一目で見比べられるようにする
 * ----------------------------
 * 5つを**同じ形の行**で並べる。1つずつカードにすると、5枚のカードの
 * 山になって比べにくいうえ、縦に伸びて1画面へ収まらない。強調するのは
 * いまの段だけ——薄い地色と印で、ほかは白のまま。
 *
 * 階級表にしない
 * --------------
 * 並べるだけだと「自分は下から2番目」という話にしかならない。いまの段の
 * すぐ下に**次に要る技**を出して、「何をすれば上がるか」まで言う。
 */

import { IconChevronRight } from "../../Icons";
import { MoreSheet } from "../MoreSheet";
import { GrowthTrack } from "./GrowthTrack";
import { AIPPO_LEVELS, levelOf, nextLevel } from "../../../course/aippoLevel";

export interface LevelSheetProps {
  /** いまの段（1〜5）。診断の段階そのもの。 */
  stage: number;
  onClose: () => void;
  /**
   * 「おすすめLessonを見る」を押したとき。
   *
   * 渡されなければ、その行を出さない。押せる形にしてあるのに何も
   * 起きないのは、見えているだけで届かない道になる。
   */
  onSeeLesson?: () => void;
  /**
   * 「学習マップを見る」を押したとき。
   *
   * 渡されなければ、その行を出さない。**5段を眺めて終わりにしない**
   * ——「次は Lv.3」を読んだ人が、そこへ行く道をその場で持つ。
   */
  onOpenMap?: () => void;
}

export function LevelSheet({
  stage,
  onClose,
  onSeeLesson,
  onOpenMap,
}: LevelSheetProps) {
  const now = levelOf(stage);
  const next = nextLevel(stage);

  return (
    <MoreSheet
      placement="sheet"
      title="AIPPO Level"
      onClose={onClose}
      testId="level-sheet"
    >
      <p className="text-[0.8125rem] leading-6 text-ink-muted">
        AIを仕事でどこまで使えるかを、5段階で表しています。
      </p>

      {/*
        道。**結果の画面と同じ部品**を使う（`GrowthTrack`）。

        ここで描き直すと、点の置き方も言葉も2か所になる。実際、指示書に
        添えてあった画面では道と数字が食い違っていた（道が「組み立て」
        なのに Level 2）——同じ部品・同じ数を使うかぎり、それは起きない。
      */}
      <div className="mt-3">
        <GrowthTrack stage={stage} showName={false} />
      </div>

      {/*
        5段の一覧。**同じ形の行で並べる。**

        1つずつカードにすると、5枚の山になって比べにくい。強調するのは
        いまの段だけで、ほかは白のまま置く。
      */}
      <ul className="mt-3 space-y-0.5" data-testid="level-list">
        {AIPPO_LEVELS.map((level) => {
          const here = level.number === now.number;
          return (
            <li
              key={level.number}
              data-level={level.number}
              data-here={here ? "yes" : "no"}
              className={`flex gap-2.5 rounded-card px-3 py-2 ${
                here ? "bg-brand-soft" : ""
              }`}
            >
              {/*
                番号。幅を先に決めておく——1桁でそろうので動かないが、
                決めておかないと文の左端が段ごとにずれる。
              */}
              <span
                className={`w-9 shrink-0 text-xs font-bold leading-5 ${
                  here ? "text-brand-dark" : "text-ink-muted"
                }`}
              >
                Lv.{level.number}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`flex items-center gap-2 text-sm leading-5 ${
                    here ? "font-bold text-brand-dark" : "font-bold text-ink"
                  }`}
                >
                  {level.name}
                  {here && (
                    <span
                      className="rounded-full bg-brand px-2 py-0.5 text-[0.6875rem]
                                 font-bold leading-4 text-white"
                      data-testid="level-here"
                    >
                      現在地
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-ink-muted">
                  {level.summary}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {/*
        次の段と、そこに要る技。

        いちばん上に居る人には出さない（`next` が null）。「次は Lv.6」は
        存在しないし、「もう上はありません」と書くのも、ここで言うことでは
        ない——上限に居ることは一覧の見た目でもう伝わっている。
      */}
      {next && (
        <div
          className="mt-4 rounded-card border border-brand-line bg-surface px-3 py-3"
          data-testid="level-next"
        >
          <p className="text-xs font-bold leading-5 text-brand-dark">
            次は Lv.{next.number}「{next.name}」
          </p>
          <ul className="mt-1.5 space-y-1">
            {next.skills.slice(0, 3).map((skill) => (
              <li
                key={skill}
                className="flex gap-1.5 text-xs leading-5 text-ink"
              >
                <span aria-hidden="true" className="text-brand">
                  ・
                </span>
                {skill}
              </li>
            ))}
          </ul>

          {onSeeLesson && (
            <button
              type="button"
              onClick={onSeeLesson}
              data-testid="level-see-lesson"
              className="mt-3 flex min-h-[2.75rem] w-full items-center justify-center
                         gap-1 rounded-cta bg-brand px-4 text-sm font-bold
                         text-white transition hover:bg-brand-dark"
            >
              おすすめLessonを見る
              <IconChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/*
        学習マップへ。**次の段の枠の外に置く。**

        いちばん上の段に居る人（`next` が null）にも要る行なので、
        「次は Lv.N」の枠の中には入れない。入れると、5段目まで来た
        人だけ地図へ行けなくなる。
      */}
      {onOpenMap && (
        <button
          type="button"
          onClick={onOpenMap}
          data-testid="level-open-map"
          className="mt-3 flex min-h-[2.75rem] w-full items-center justify-center
                     gap-1 rounded-cta border border-brand-line px-4 text-sm
                     font-bold text-brand-dark transition hover:bg-brand-soft"
        >
          学習マップを見る
          <IconChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      )}
    </MoreSheet>
  );
}
