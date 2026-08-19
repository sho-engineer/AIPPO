/**
 * ホーム。
 *
 * ここは「ダッシュボード」ではない。開いた瞬間に
 * **今日なにをすればいいか**が分かる画面にする。
 *
 * 順番は上から:
 *
 *   1. 次にやるレッスン（名前・所要時間・始めるボタン）
 *   2. 7日間のどこまで来たか
 *   3. 進み具合（細い棒と「n / m」だけ）
 *   4. ほかの教材への入り口
 *
 * 以前はこれが逆だった。円グラフ・継続日数・試した回数を先に見せ、
 * 「次にやること」は横スクロールのカードの中に埋もれていた。
 * 数字を眺めに来る人はいない。学びに来ている。
 *
 * やめたもの（すべて意図的）
 * --------------------------
 * - 円形の進捗グラフ … 50% を大きく出しても、次の一手は分からない
 * - 「順調です。この調子で続けていきましょう。」 … 誰にでも当てはまる
 *   文は、読んでも何も変わらない。代わりに次の教材の名前を出す
 * - おすすめの横スクロール … 右端が切れたカードは「見落とし」を作る
 * - 「無料」「初級」「近日公開」の pill … 押せないものを押せる形にしない
 * - 大きな角丸カードの反復 … 節と余白と線で分ける
 *
 * 出すのは**自分のこと**だけ。順位も、他人との比較も出さない
 * （比べさせると、遅い人ほど続かなくなる）。
 */

import { useEffect, useState } from "react";

import { AppHeader, IconMark } from "../components/AppShell";
import { ReviewPrompt } from "../components/ReviewPrompt";
import { IconArrow, IconCheck, IconClock } from "../components/Icons";
import { useCourse } from "../course/live";
import {
  comingSoonNote,
  hasComingSoonDetail,
  isComingSoon,
  startableLessons,
} from "../course/availability";
import { CATEGORIES, lookOf } from "../course/presentation";
import { recommendationsForHome } from "../course/recommend";
import { useCompletedLessons } from "../course/progress";
import { readStreak, touchStreak } from "../lib/draft";
import type { Lesson } from "../course/types";

export interface HomePageProps {
  onSelectLesson: (lessonId: string) => void;
  /** コース一覧タブへ。 */
  onOpenCourse: () => void;
}

// ---------------------------------------------------------------- 次にやること

/**
 * 画面のいちばん上。ここだけは面で囲う。
 *
 * この画面で押す場所は基本ここ1つなので、
 * 「独立した操作単位」として囲う条件を満たしている。
 * 逆に言えば、囲ってよいのはここだけ。
 */
function NextUp({
  lesson,
  started,
  onStart,
}: {
  lesson: Lesson;
  started: boolean;
  onStart: () => void;
}) {
  return (
    <section
      className="rounded-panel border border-brand-line bg-surface p-4"
      aria-labelledby="next-heading"
      data-testid="next-up"
    >
      <p className="text-xs font-bold text-brand-dark">
        {started ? "続きから" : "今日はここから"}
      </p>

      <h2 id="next-heading" className="mt-1.5 text-lg font-bold leading-7">
        {lesson.title}
      </h2>
      <p className="mt-1 text-sm leading-7 text-ink-muted">{lesson.goal}</p>

      {/*
        所要時間は、始める前にいちばん知りたいこと。
        「8分なら今できる」と決められるように、ボタンのすぐ横に置く。
      */}
      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          data-testid="continue-lesson"
          onClick={onStart}
          className="flex items-center gap-2 rounded-cta bg-brand px-5 py-2.5 text-sm
                     font-bold text-white transition hover:bg-brand-dark active:bg-brand-dark"
        >
          {started ? "学習を続ける" : "はじめる"}
          <IconArrow className="h-4 w-4 shrink-0" />
        </button>

        {lesson.estimatedMinutes !== undefined && (
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <IconClock className="h-3.5 w-3.5 shrink-0" />
            約{lesson.estimatedMinutes}分
          </span>
        )}
      </div>
    </section>
  );
}

// -------------------------------------------------------------- 7日間の道のり

/**
 * 7日間のどこまで来たか。
 *
 * 9本ぜんぶを常に大きく出す必要は無い。**いまいる場所の前後**が
 * 見えれば足りる。終わったものは畳んで件数だけにし、
 * これから来るものは2本だけ見せる。
 *
 * 以前はここが「0〜8 の丸を9個」だった。丸だけでは何の回か分からず、
 * 押せない回まで押せる形で並んでいた。
 */
function Roadmap({
  lessons,
  completed,
  currentId,
  onSelectLesson,
}: {
  lessons: Lesson[];
  completed: string[];
  currentId: string | null;
  onSelectLesson: (id: string) => void;
}) {
  const currentIndex = lessons.findIndex((lesson) => lesson.id === currentId);

  /*
    ひとつ前から見せる。どこから来たかが見えるほうが、
    自分がどのあたりにいるか分かる。
  */
  const from = Math.max(0, currentIndex - 1);

  // いまの回と、その前後。多すぎると「まだこんなにある」に見える
  const visible = lessons.slice(from, from + 4);

  /*
    畳んだぶんの件数。

    「一覧の何番目か」ではなく、**実際に終わった数**を数える。
    位置で数えると、まだ1本も終えていない人に
    「ここまで1回おわりました」と出る（実際に出した）。
  */
  const doneBefore = lessons
    .slice(0, from)
    .filter((lesson) => completed.includes(lesson.id)).length;

  return (
    <section aria-labelledby="roadmap-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="roadmap-heading" className="section-title">
          7日間の道のり
        </h2>
        <span className="text-xs text-ink-muted">全{lessons.length}回</span>
      </div>

      <ol className="mt-2" role="list">
        {doneBefore > 0 && (
          <li className="flex items-center gap-2 border-b border-line py-2.5 text-xs text-ink-muted">
            <IconCheck className="h-3.5 w-3.5 shrink-0 text-brand" />
            ここまで{doneBefore}回おわりました
          </li>
        )}

        {visible.map((lesson) => {
          const soon = isComingSoon(lesson);
          const isCurrent = lesson.id === currentId;
          const done = completed.includes(lesson.id);

          return (
            <li key={lesson.id}>
              <button
                type="button"
                onClick={() => onSelectLesson(lesson.id)}
                disabled={soon}
                aria-disabled={soon}
                data-testid={`roadmap-${lesson.id}`}
                className={`row row-tap items-baseline disabled:cursor-not-allowed
                            ${soon ? "opacity-55" : ""}`}
              >
                {/* 回の番号。丸で囲わない。数字そのもので順番は伝わる */}
                <span
                  className={`w-12 shrink-0 text-xs tabular-nums
                              ${isCurrent ? "font-bold text-brand-dark" : "text-ink-muted"}`}
                >
                  Day {lesson.number}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm leading-6 ${isCurrent ? "font-bold" : ""}`}
                  >
                    {lesson.title}
                  </span>
                  {soon && hasComingSoonDetail(lesson) && (
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {comingSoonNote(lesson)}
                    </span>
                  )}
                </span>

                {/*
                  状態は右端に、文字で。色だけでは伝わらない人がいる。
                  「近日公開」を青い錠前の pill にはしない——
                  押せないものほど静かに置く。
                */}
                <span className="shrink-0 self-center text-xs">
                  {done ? (
                    <IconCheck className="h-4 w-4 text-brand" aria-label="おわった" />
                  ) : isCurrent ? (
                    <span className="font-bold text-brand-dark">今日</span>
                  ) : soon ? (
                    <span className="text-ink-muted">近日公開</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ------------------------------------------------------------------ 進み具合

/**
 * 進み具合。
 *
 * 細い棒と「n / m」だけ。50% を大きく見せる意味は無い。
 * 続けている日数と、自分の課題で試した回数は、実際に数えているので
 * 小さく添える（滞在時間のような、測っていない数字は出さない）。
 */
function Progress({
  done,
  total,
  days,
  realTaskCount,
  onOpenCourse,
}: {
  done: number;
  total: number;
  days: number;
  realTaskCount: number;
  onOpenCourse: () => void;
}) {
  const ratio = total === 0 ? 0 : done / total;

  return (
    <section aria-labelledby="progress-heading" data-testid="progress-summary">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="progress-heading" className="section-title">
          学習の進み具合
        </h2>
        <button
          type="button"
          onClick={onOpenCourse}
          className="shrink-0 text-xs font-bold text-brand transition hover:text-brand-dark"
        >
          教材をすべて見る
        </button>
      </div>

      <p className="mt-2 text-sm">
        <span className="font-bold tabular-nums">
          {done}/{total}
        </span>
        <span className="text-ink-muted"> レッスン完了</span>
      </p>

      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label="コース全体の進み具合"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${total}本のうち${done}本おわりました`}
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>

      {(days > 0 || realTaskCount > 0) && (
        <p className="mt-2 text-xs text-ink-muted">
          続けて{days}日
          {realTaskCount > 0 && `・自分の課題で${realTaskCount}回ためしました`}
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ 本体

export function HomePage({ onSelectLesson, onOpenCourse }: HomePageProps) {
  /*
    終わったレッスンは、端末とサーバーの両方から取る。
    登録して別の端末で開いた人にも、同じ数が出るようにする。
  */
  const course = useCourse();
  const completed = useCompletedLessons();
  const [recommended, setRecommended] = useState<string[]>([]);
  const [streak, setStreak] = useState({ days: 0, realTaskCount: 0 });

  useEffect(() => {
    setRecommended(recommendationsForHome());
    // 「今日ひらいた」ことをここで1回だけ数える
    const touched = touchStreak();
    setStreak({ days: touched.days, realTaskCount: readStreak().realTaskCount });
  }, []);

  /*
    進捗も「次」も、始められる教材だけで数える。

    近日公開を分母に混ぜると、始めようのないもので割ることになり、
    どれだけやっても終わらない画面になる。
    「次におすすめ」に混ざれば、押せないものを勧めることになる。
  */
  const startable = startableLessons(course.lessons);

  const nextLesson =
    startable.find(
      (lesson) => recommended.includes(lesson.id) && !completed.includes(lesson.id),
    ) ?? startable.find((lesson) => !completed.includes(lesson.id));

  /*
    「次」以外の、始められる教材。ここに横スクロールは使わない。
    右端で切れたカードは、そこに何かがあること自体を見落とさせる。
  */
  const others = startable.filter((lesson) => lesson.id !== nextLesson?.id).slice(0, 3);

  return (
    <>
      <AppHeader />

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        {/* ── ポーのひとこと ── */}
        {/*
          ポーは学習ガイドであって、チャットボットではない。
          画面の主役に据えず、次にやることへ添える1行だけにする。
          以前は画面上端に吹き出しの面を置き、そこに
          「今日も一緒に、AIの一歩を進めていきましょう。」と
          誰にでも当てはまる文を出していた。
        */}
        <section
          className="flex items-center gap-2.5"
          aria-label="ポーからのあいさつ"
          data-testid="po-greeting"
        >
          <img
            src="/brand/poe-wave.webp"
            alt=""
            aria-hidden="true"
            className="h-10 w-10 shrink-0 object-contain"
          />
          <p className="text-sm leading-6 text-ink-muted">
            {completed.length === 0
              ? "はじめまして、ポーです。1本目は10分で終わります。"
              : nextLesson
                ? `おかえりなさい。次は「${nextLesson.title}」です。`
                : "ここまでの教材はすべて終わりました。"}
          </p>
        </section>

        {nextLesson && (
          <div className="mt-4">
            <NextUp
              lesson={nextLesson}
              started={completed.length > 0}
              onStart={() => onSelectLesson(nextLesson.id)}
            />
          </div>
        )}

        <div className="mt-7">
          <Roadmap
            lessons={course.lessons}
            completed={completed}
            currentId={nextLesson?.id ?? null}
            onSelectLesson={onSelectLesson}
          />
        </div>

        {/*
          そろそろ見返しどきのもの。無ければ何も出ない。
          「次にやること」のすぐ下に置く——新しく進むのと、
          忘れかけを戻すのは、どちらも「今日やること」だから。
        */}
        {/*
          余白は ReviewPrompt 自身が持つ。ここで囲うと、
          出すものが無い日にも空の余白だけが残る。
        */}
        <ReviewPrompt onSelectLesson={onSelectLesson} />

        <div className="mt-7">
          <Progress
            done={completed.length}
            total={startable.length}
            days={streak.days}
            realTaskCount={streak.realTaskCount}
            onOpenCourse={onOpenCourse}
          />
        </div>

        {/* ── ほかの教材 ── */}
        {others.length > 0 && (
          <section className="mt-7" aria-labelledby="others-heading">
            <h2 id="others-heading" className="section-title">
              ほかの教材
            </h2>

            <ul className="mt-2" role="list">
              {others.map((lesson) => (
                <li key={lesson.id}>
                  <button
                    type="button"
                    onClick={() => onSelectLesson(lesson.id)}
                    data-testid={`recommend-${lesson.id}`}
                    data-availability="available"
                    className="row row-tap items-baseline"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold leading-6">
                        {lesson.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
                        {lesson.goal}
                      </span>
                    </span>
                    {lesson.estimatedMinutes !== undefined && (
                      <span className="shrink-0 self-center text-xs tabular-nums text-ink-muted">
                        {lesson.estimatedMinutes}分
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── 用途から探す ── */}
        {/*
          丸いチップを6個並べるのをやめ、2列の一覧にした。
          チップの列は「タグの群れ」に見えて、押せる入り口だと分かりにくい。
          印は器に入れず、線だけにしている。
        */}
        <section className="mt-7" aria-labelledby="category-heading">
          <h2 id="category-heading" className="section-title">
            用途から探す
          </h2>

          <ul className="mt-2 grid grid-cols-2 gap-x-4" role="list">
            {CATEGORIES.map((category) => {
              const look = lookOf(category.lessonId);
              return (
                <li key={category.label}>
                  <button
                    type="button"
                    onClick={() => onSelectLesson(category.lessonId)}
                    className="row row-tap items-center gap-2.5 py-3"
                  >
                    <IconMark
                      icon={look.icon}
                      tone={look.tone === "plain" ? "brand" : look.tone}
                      className="h-[1.125rem] w-[1.125rem]"
                    />
                    <span className="text-sm">{category.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </>
  );
}
