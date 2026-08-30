/**
 * コースの画面のいちばん上に置く「続きから」。
 *
 * なぜ要るか
 * ----------
 * 数日ぶりに開いた人が最初に思うのは「自分はどこまでやったんだっけ」。
 * それを思い出す作業を、道のりを目で追って探させる形にしていた。
 * 現在地は道のりの中で強調されてはいるが、**押す場所が1つに
 * 決まっていない**ので、結局スクロールして探すことになる。
 *
 * この部品が答えるのは1つだけ——**次に押すのはここ**。
 *
 * 途中と、次のはじまりを区別する
 * ------------------------------
 * 途中まで進んでいるなら「Day4の途中から続ける」。まだなら
 * 「Day4をはじめる」。同じ見た目で言葉だけ変えるのではなく、
 * 途中のときは**そう書く**。書いていないと、押した先で
 * 前回の入力が残っていることが驚きになる。
 *
 * 途中かどうかは端末に残した下書き（lib/draft.ts）で分かる。
 * サーバーには聞かない——聞くと、通信が遅い日にこのカードだけ
 * あとから形が変わる。
 *
 * 1画面1動作
 * ----------
 * ここに置くボタンは1つ。下の道のりからも各レッスンを開けるが、
 * **主たる動作はこれ**という形にしておく。
 */

import { useEffect, useState } from "react";

import { IconChevronRight, IconClock } from "../Icons";
import { loadDraft } from "../../lib/draft";
import { missionStateOf } from "../../course/missions";
import type { Lesson } from "../../course/types";

export interface CourseResumeProps {
  /** 次に進む1本。無ければ何も出さない（コース完走など）。 */
  lesson: Lesson | null;
  onStart: (lessonId: string) => void;
}

export function CourseResume({ lesson, onStart }: CourseResumeProps) {
  /*
    下書きの有無は端末を見て決めるので、最初の描画では分からない。
    `useEffect` のあとで確かめる。分かるまでは「はじめる」と書いて
    おく——あとから「続ける」へ変わるのは、逆よりも驚きが小さい。
  */
  const [resume, setResume] = useState<{
    /** どこまで進んだか。区切りの名前で言う。 */
    where: string;
    /** 残りの画面数。 */
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!lesson) {
      setResume(null);
      return;
    }
    const draft = loadDraft(lesson.id);
    /*
      最初の画面に居るだけなら「途中」とは呼ばない。
      開いて閉じただけで「途中から続ける」と出ると、
      やっていないことをやったことにしてしまう。
    */
    if (!draft || draft.stepId === lesson.steps[0]?.id) {
      setResume(null);
      return;
    }

    const index = lesson.steps.findIndex((step) => step.id === draft.stepId);
    if (index < 0) {
      setResume(null);
      return;
    }

    /*
      「途中です」だけでは、思い出す手間が残る。**どこまでやったか**を
      言葉で返す。歩数（12 / 19）では言わない——内部の数で、
      本人にとっては意味を持たない。区切りの名前で言う。
    */
    const state = missionStateOf(lesson, index);
    setResume({
      where: state.missions[state.current - 1]?.label ?? "",
      left: lesson.steps.length - index,
    });
  }, [lesson]);

  if (!lesson) return null;

  const day = lesson.number > 0 ? `Day${lesson.number}` : "現在地チェック";

  return (
    <section
      className="mt-5 rounded-panel border border-brand-line bg-surface p-4 shadow-card"
      aria-labelledby="resume-heading"
      data-testid="course-resume"
    >
      <p className="text-xs font-bold text-brand" data-testid="course-resume-state">
        {resume ? `${day} 「${resume.where}」まで進みました` : "次はここから"}
      </p>

      <h2 id="resume-heading" className="mt-1.5 text-lg font-bold leading-7">
        {lesson.number > 0 && (
          <span className="mr-2 text-sm text-ink-muted">{day}</span>
        )}
        {lesson.title}
      </h2>

      {lesson.estimatedMinutes !== undefined && (
        <p
          className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted"
          data-testid="course-resume-time"
        >
          <IconClock className="h-3.5 w-3.5 shrink-0" />
          {/*
            途中なら、**残り**を言う。最初から数えた時間を出すと、
            半分終えた人にも「約8分」と出て、進んだぶんが消える。
            残りは画面数の比で見積もる——正確な数字ではないので
            「あと約」と書く。
          */}
          {resume
            ? `あと約${Math.max(
                1,
                Math.round(
                  (lesson.estimatedMinutes * resume.left) / lesson.steps.length,
                ),
              )}分`
            : `約${lesson.estimatedMinutes}分`}
        </p>
      )}

      <button
        type="button"
        onClick={() => onStart(lesson.id)}
        data-testid="course-resume-start"
        className="row-tap mt-4 flex w-full items-center justify-center gap-1.5
                   rounded-card bg-brand px-4 py-3 text-sm font-bold text-white
                   transition hover:bg-brand-dark"
      >
        {resume ? "続きから" : "はじめる"}
        <IconChevronRight className="h-4 w-4 shrink-0" />
      </button>
    </section>
  );
}
