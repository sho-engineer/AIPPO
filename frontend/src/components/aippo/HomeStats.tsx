/**
 * ホームの、続けている記録。**1行に収める。**
 *
 * 続けた日数も、終えた本数も、どちらも「ここまでの自分」を映すもの。
 * 節に分けて大きく出すと、ホームで最初に知りたい「次に何をするか」より
 * 前に立ってしまう。数字だけを横に並べて、視線が止まらないようにする。
 *
 * 前はここが「学習の進み具合」という独立した節で、見出し・スタンプの列・
 * 節目の予告・2つの数字を持っていた。今日の1本より背が高かった。
 * 数えたものは残したまま、置き場所を分けた——ここは**数字だけ**、
 * スタンプと節目は下の「学習の道のり」が持つ。
 *
 * 出すのは自分のことだけ。順位も他人との比較も出さない（憲章）。
 *
 * 煽らない
 * --------
 * 続いていない日に「途切れました」とは書かない。0日のときは
 * 「今日がはじめの1日」と、これから始める側の言い方にする。
 * 失う恐怖で続けさせない、という方針をここでも守る。
 *
 * 目印はそのまま
 * --------------
 * `progress-summary` は「近日公開を分母に数えていないこと」を見ている
 * 検査が指している。節ごと作り直しても、**分数のある場所**は動かさない。
 */

import { IconChevronRight, IconStreak } from "../Icons";

export interface HomeStatsProps {
  /** 続けて開いた日数。 */
  days: number;
  /** 終えたレッスン。分母は「始められるもの」だけ（近日公開を混ぜない）。 */
  done: number;
  total: number;
  /** 自分の課題でためした回数。0のときは出さない。 */
  tries?: number;
  /**
   * 学習記録へ。
   *
   * 節を畳んだときに、記録への入口まで一緒に消さないために残してある。
   * 下タブからも行けるが、数字を見て「もっと見たい」と思う場所は
   * ここなので、その場に置いておく（憲章 原則 I）。
   */
  onOpenRecord?: () => void;
}

export function HomeStats({
  days,
  done,
  total,
  tries = 0,
  onOpenRecord,
}: HomeStatsProps) {
  return (
    /*
      折り返しを許す。3つ目（ためした回数）が出る人がいるので、
      横1行に押し込むと 375px で見切れる。
    */
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted"
      data-testid="progress-summary"
    >
      <p className="flex items-center gap-1.5">
        <IconStreak className="h-4 w-4 shrink-0 text-caution" aria-hidden="true" />
        {days > 0 ? (
          <>
            <span className="text-sm font-bold tabular-nums text-ink">{days}</span>
            日連続
          </>
        ) : (
          "今日がはじめの1日"
        )}
      </p>

      <p className="flex items-center gap-1.5">
        <span className="text-sm font-bold tabular-nums text-ink">
          {done} / {total}
        </span>
        レッスン完了
      </p>

      {tries > 0 && <p>自分の課題で{tries}回ためしました</p>}

      {onOpenRecord && (
        <button
          type="button"
          onClick={onOpenRecord}
          data-testid="open-record"
          /* 当たり判定を広げる（py と -my を同じだけ。見た目は変わらない） */
          className="-my-2 ml-auto flex shrink-0 items-center gap-0.5 py-2 text-xs
                     font-bold text-brand transition hover:text-brand-dark"
        >
          記録を見る
          <IconChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
