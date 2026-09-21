/**
 * 終えたあとの1行——**いま取った技で、地図がどこまで進んだか。**
 *
 * なぜ要るか
 * ----------
 * 技を受け取る画面はある（`LessonAwardCard`）が、それが**段のどこに
 * 効いたのか**は出ていなかった。技は増えたのに、自分が近づいたのか
 * どうかは地図を開くまで分からない。1本終えるたびに開き直させない。
 *
 * **「あと何個」はサーバーが数えた分をそのまま出す。**
 * ------------------------------------------------
 * 地図・ホーム・レッスンの開始画面と同じ `remaining` を使う。ここで
 * 数え直すと、完了画面で「あと1つ」、地図で「あと2つ」が出る日が来る。
 *
 * **技が付くのを待ってから聞く**
 * ------------------------------
 * 完了画面に着くと、裏で「終えた」をサーバーへ送る（`api.complete`）。
 * 技が付くのはその返事が届いたときなので、画面が出た瞬間に聞くと
 * **たったいま取った技が数に入らない**——「あと2つ」と出してから、
 * 地図を開くと「あと1つ」になる。
 *
 * だから `award`（サーバーが返した増えた分）が届いてから聞く。
 * 届かなかった回は出さない——祝いの材料が無いのと同じ扱い。
 *
 * 出ないとき
 * ----------
 * 読めなかったとき・いちばん上の段に居るとき・段がまだ入っていない
 * 環境。どれも黙って出ない——完了画面は祝う場所なので、読めないこと
 * を知らせるために場所を取らない。
 */

import { useEffect, useState } from "react";

import { fetchLevelMap, type LevelMap } from "../../api/progression";
import { IconChevronRight } from "../Icons";

export interface NextLevelAfterLessonProps {
  /** 学習マップへ。渡されなければ、押せない1行にはせず何も出さない。 */
  onOpenMap?: () => void;
  /**
   * サーバーが返した「増えた分」。**これが届いてから聞く。**
   *
   * 中身は見ない。見るのは**届いたかどうか**だけ——技が付いたあとの
   * 数が欲しいので、順番だけが要る。
   */
  award: unknown;
}

export function NextLevelAfterLesson({
  onOpenMap,
  award,
}: NextLevelAfterLessonProps) {
  const [next, setNext] = useState<LevelMap["next"]>(null);
  const settled = award !== null && award !== undefined;

  useEffect(() => {
    if (!settled) return;
    const controller = new AbortController();
    fetchLevelMap(controller.signal)
      .then((map) => setNext(map.next))
      .catch(() => {
        /* 読めなければ出さない。祝う場所で、読めないことを知らせない */
      });
    return () => controller.abort();
  }, [settled]);

  if (!next || !onOpenMap) return null;

  return (
    <button
      type="button"
      onClick={onOpenMap}
      data-testid="completion-next-level"
      className="flex min-h-[2.75rem] w-full items-center gap-3 rounded-card
                 border border-brand-line bg-brand-soft/40 px-4 py-3 text-left
                 transition hover:bg-brand-soft active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">
          次は Lv.{next.number} {next.name}
        </span>
        <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
          {/*
            **「あと0つ」とは書かない。** 数が 0 になるのは「技が
            そろう」であって「上がる」ではない（もう片方は昇段の
            実践問題）。
          */}
          {next.remaining > 0
            ? `必要な技が、あと${next.remaining}つです`
            : "必要な技がそろいました。挑戦できます"}
        </span>
      </span>
      <IconChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
    </button>
  );
}
