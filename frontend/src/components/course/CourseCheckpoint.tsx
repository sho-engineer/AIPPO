/**
 * コースの節目（チェックポイント）。
 *
 * 3本ごとに、**ここまでで何ができるようになったか**をまとめる。
 *
 * なぜ要るか
 * ----------
 * 1本ずつの完了画面は「今日できるようになったこと」しか言わない。
 * 3本目まで来た人が実際に持っているのはその合計だが、それを見せる
 * 場所がどこにも無かった。積み上がっていることは、積み上げた本人が
 * いちばん気づきにくい。
 *
 * 前はここに、スタンプの数と特典の予告だけを出す吹き出しがあった。
 * 「3個目のスタンプ、できた！ 🎁1 Credit（近日公開）」——数と、
 * まだ使えない特典の話だけで、**できるようになったこと**が無い。
 *
 * 出すのは自分のことだけ
 * ----------------------
 * 順位も他人との比較も出さない。特典は「近日公開」と書いたまま
 * 残す——使い道がまだ無いものを獲得の報告にしない（憲章 原則 I）。
 */

import { Card } from "../AppShell";
import { PoAvatar } from "../../po/PoAvatar";
import { IconCheck } from "../Icons";
import { startableLessons } from "../../course/availability";
import type { Course } from "../../course/types";

export interface CourseCheckpointProps {
  course: Course;
  /** ここまでに終えたレッスンの id。 */
  completedIds: string[];
  /** 何本目の節目か。 */
  atCount: number;
  /** 特典の予告。まだ使えないので、そのように書く。 */
  rewardLabel: string;
}

/**
 * ここまでで、できるようになったこと。
 *
 * 教材の `outcomes`（進捗画面に出す、身についたこと）をそのまま並べる。
 * 新しく言葉を作らない——完了画面で読んだ文と同じものが並ぶほうが、
 * 「あれができるようになった」と結びつく。
 */
function outcomesSoFar(course: Course, completedIds: string[]): string[] {
  const done = new Set(completedIds);
  const found: string[] = [];

  for (const lesson of startableLessons(course.lessons)) {
    if (!done.has(lesson.id)) continue;
    for (const outcome of lesson.outcomes ?? []) {
      if (!found.includes(outcome)) found.push(outcome);
    }
  }
  return found;
}

export function CourseCheckpoint({
  course,
  completedIds,
  atCount,
  rewardLabel,
}: CourseCheckpointProps) {
  const outcomes = outcomesSoFar(course, completedIds);

  return (
    <Card testId="course-checkpoint">
      {/*
        吹き出しは compact（2行ぶんで切れる）。
        「近日公開」は、獲得済みでないことを言う唯一の言葉なので、
        ここが切れて見えなくなると、そのまま獲得の報告に見えてしまう。
      */}
      <PoAvatar
        po={{
          message: `${atCount}本おわりました。ここまでで、こんなことができます`,
          emotion: "celebrate",
          action: "wait",
        }}
        compact
      />

      {outcomes.length > 0 && (
        <ul className="mt-4 space-y-2.5" role="list" data-testid="checkpoint-outcomes">
          {outcomes.map((outcome) => (
            <li key={outcome} className="flex items-start gap-2.5 text-sm leading-7">
              <IconCheck className="mt-1.5 h-4 w-4 shrink-0 text-brand" />
              {outcome}
            </li>
          ))}
        </ul>
      )}

      {/*
        特典は予告のまま。使い道がまだ1つも無いので、
        「獲得しました」とは言わない（`course/milestones.ts`）。
      */}
      <p className="mt-4 border-t border-line pt-3 text-xs leading-6 text-ink-muted">
        {atCount}個目のスタンプ {rewardLabel}（近日公開）
      </p>
    </Card>
  );
}
