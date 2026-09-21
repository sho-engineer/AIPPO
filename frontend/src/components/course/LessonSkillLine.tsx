/**
 * 開始画面の1行——**今回の技と、次の段までの残り。**
 *
 * なぜ1行なのか
 * -------------
 * ここはレッスンの入口で、決めたいことは「始めてよいか」だけ。
 * 札を積むと、始める前に読み物が1本できる（`steps/Outcome.tsx` の註）。
 * 1画面に収まる高さも決まっているので、足せるのは**1行**。
 *
 * **「これをやれば上がる」とは書かない。**
 * -------------------------------------
 * 上がる条件は2つあって、どちらも要る（技がそろう・昇段の実践問題を
 * 通る）。レッスンで動くのは片方だけなので、約束を先に置くと、終えた
 * 人が上がらない理由を探すことになる。ここが言うのは
 *
 *     今回の技：プロンプト
 *     Lv.2 まで、このあと あと1つ
 *
 * という**数だけ**。数なら嘘にならない。
 *
 * 出ないときは、黙って出ない
 * --------------------------
 * 読めなかったとき・技がひも付いていないレッスン・いちばん上の段。
 * どれも行を出さない——ここは本筋ではないので、読めないことを
 * 知らせるために場所を取らない。教材そのものは技が無くても学べる。
 */

import { useEffect, useState } from "react";

import { fetchLessonReward, type LessonReward } from "../../api/progression";
import { IconSparkle } from "../Icons";

export function LessonSkillLine({ lessonId }: { lessonId: string }) {
  const [reward, setReward] = useState<LessonReward | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setReward(null);
    fetchLessonReward(lessonId, controller.signal)
      .then(setReward)
      .catch(() => {
        /* 読めなければ出さない。ここで行き止まりを作らない */
      });
    return () => controller.abort();
  }, [lessonId]);

  if (reward === null) return null;

  /*
    出すのは**まだ取っていない技**だけ。やり直しの回に「今回身に
    つきます」と出すと嘘になるので、全部取っている回は行ごと消す。
  */
  const fresh = reward.skills.filter((one) => !one.acquired);
  if (fresh.length === 0) return null;

  const names = fresh.map((one) => one.name).join("・");
  const after = reward.next_level;

  return (
    <p
      data-testid="lesson-skill-line"
      className="shrink-0 flex items-center gap-2 rounded-card bg-brand-soft/40
                 px-3 py-2 text-xs leading-6"
    >
      <IconSparkle className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
      <span className="min-w-0">
        今回の技：<strong className="font-bold">{names}</strong>
        {after && (
          <span className="text-ink-muted">
            {" "}
            ／ Lv.{after.number} {after.name}まで
            {/*
              **「あと0つ」とは書かない。** 数が 0 になるのは「技が
              そろう」であって「上がる」ではないので、そろったことを
              そのまま言い、上がるとは言わない。
            */}
            {reward.remaining_after > 0
              ? `、このあと あと${reward.remaining_after}つ`
              : "に必要な技が、このあとそろいます"}
          </span>
        )}
      </span>
    </p>
  );
}
