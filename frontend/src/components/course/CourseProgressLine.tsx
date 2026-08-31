/**
 * コースの進み具合。**2行だけ。**
 *
 *     3 / 6 レッスン
 *     AI技 5個習得
 *
 * この画面が答えるのは「いまどこ / 次はこれ / あとこれだけ」で、
 * ここは「あとこれだけ」の担当。数え方の説明も、次の特典の予告も
 * 置かない——スタンプと Credit は下へ回す（コースの主役にしない）。
 *
 * 分母に準備中を入れない
 * ----------------------
 * 始めようのないもので割ると、どれだけ進めても 100% にならない。
 * 準備中が何本あるかは、帯の下に一言で添える——**黙って隠さない。**
 * コースが画像まで行くことは、始める前に知りたいことなので、
 * 「いま開ける分」と「これから開く分」の両方を出す。
 *
 * AI技の数は、届いたときだけ出す
 * ------------------------------
 * サーバーが数える（`useXpSummary`）。届かないときは行ごと出さない。
 * 0 のときも出さない——「0個」は、増えていないと言われるだけになる。
 */

export interface CourseProgressLineProps {
  /** 終えた Day の数。 */
  done: number;
  /** いま始められる Day の数。 */
  total: number;
  /** まだ開けない Day の数。0 なら触れない。 */
  comingSoon: number;
  /** 覚えた AI技の数。届いていない・0 なら渡さない。 */
  skills?: number;
}

export function CourseProgressLine({
  done,
  total,
  comingSoon,
  skills,
}: CourseProgressLineProps) {
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));

  return (
    <div className="mt-4" data-testid="course-progress-line">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-sm font-bold tabular-nums">
          <span data-testid="course-progress-count">
            {done} / {total}
          </span>{" "}
          レッスン
        </p>
        {skills !== undefined && skills > 0 && (
          <p data-testid="course-progress-skills" className="text-sm text-ink-muted">
            AI技 {skills}個習得
          </p>
        )}
      </div>

      {/*
        帯。数字と同じことを言うが、割合は形のほうが速く読める。
        読み上げには数字のほうが届くので、帯は飾りとして隠す。
      */}
      <div
        aria-hidden="true"
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-soft"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      {comingSoon > 0 && (
        <p className="mt-2 text-xs leading-6 text-ink-muted">
          このあと{comingSoon}本、準備中のレッスンがあります。
        </p>
      )}
    </div>
  );
}
