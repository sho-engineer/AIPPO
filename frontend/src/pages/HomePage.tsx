/**
 * ホーム（支給デザイン 1枚目）。
 *
 * 以前ここは「見出し＋数字3つ＋レッスンの縦一列」だった。
 * 支給デザインは違う作りをしている。順に写している。
 *
 *   1. ポーが迎える（吹き出し＋手を振る絵）
 *   2. 進み具合を輪で見せる。数字だけより、残りが直感で分かる
 *   3. おすすめを3枚、横に並べる
 *   4. コース全体への入り口を帯で置く
 *   5. 用途から探せるようにする
 *   6. 下タブでどこへでも戻れる
 *
 * 出すのは**自分のこと**だけ。順位も、他人との比較も出さない
 * （比べさせると、遅い人ほど続かなくなる）。
 *
 * 支給デザインには「学習時間 2時間15分」が載っているが、これは出さない。
 * 滞在時間を測っていないので、出すなら作り話になる。代わりに、実際に
 * 数えている「続けている日数」と「自分の課題で試した回数」を置く。
 */

import { useEffect, useState } from "react";

import { AppHeader, Card, CardHeading, IconBadge, MetaPill } from "../components/AppShell";
import {
  IconArrow,
  IconBars,
  IconChevronRight,
  IconClock,
  IconFolder,
  IconSparkle,
  IconStar,
  IconTrend,
} from "../components/Icons";
import { COURSE } from "../course/catalog";
import { CATEGORIES, lookOf } from "../course/presentation";
import { recommendationsForHome } from "../course/recommend";
import { listCompleted, readStreak, touchStreak } from "../lib/draft";
import type { Lesson } from "../course/types";

export interface HomePageProps {
  onSelectLesson: (lessonId: string) => void;
  /** コース一覧タブへ。 */
  onOpenCourse: () => void;
}

// ------------------------------------------------------------------ 進み具合

/**
 * 円い進み具合。
 *
 * SVG の円を1本使い、破線の間隔で減らしている。
 * 割合は文字でも必ず出す。輪の長さだけで伝えると、
 * 色や形が見えにくい人に何も伝わらない。
 */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const ratio = total === 0 ? 0 : done / total;
  const percent = Math.round(ratio * 100);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className="relative flex h-28 w-28 shrink-0 items-center justify-center"
      /*
        輪と割合は「9本中いくつ終わったか」を表している。
        割合の文字だけでは、読み上げに何本中の何本かが届かない。
        値そのものを持たせておくと、検査でも文字の書き方に依存せず読める。
      */
      role="progressbar"
      aria-label="コース全体の進み具合"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${total}本のうち${done}本おわりました`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className="stroke-brand-soft"
        />
        {/*
          0件のときは描かない。端を丸めてあるので、長さ0でも点が1つ
          残ってしまい、「少しだけ進んでいる」ように見える。
        */}
        {ratio > 0 && (
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            className="stroke-brand transition-[stroke-dasharray] duration-700"
            strokeDasharray={`${circumference * ratio} ${circumference}`}
          />
        )}
      </svg>
      <p className="absolute text-center">
        <span className="text-2xl font-bold leading-none">{percent}</span>
        <span className="text-sm font-bold">%</span>
        <span className="block text-xs text-ink-muted">完了</span>
      </p>
    </div>
  );
}

function ProgressCard({
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
  return (
    <Card testId="progress-summary">
      <CardHeading
        icon={IconTrend}
        action={
          <button
            type="button"
            onClick={onOpenCourse}
            /*
              うすい青の上では brand をそのまま使わない。
              #1268E8 と #E8F1FE の差は 4.42 で、4.5 にわずかに届かない
              （検査で実際に落ちた）。一段濃い brand-dark なら 5.18。
            */
            className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-3 py-1.5
                       text-xs font-bold text-brand-dark transition hover:bg-brand-line"
          >
            詳細を見る
            <IconChevronRight className="h-3.5 w-3.5" />
          </button>
        }
      >
        学習の進み具合
      </CardHeading>

      {/*
        輪と数字を横に並べる。数字は縦に積み、あいだを線で区切る。
        3つを横一列にすると、狭い画面で「おわったレッスン」が
        2行に折れて、輪と高さが合わなくなる。
      */}
      <div className="mt-5 flex items-center gap-4">
        <ProgressRing done={done} total={total} />

        <dl className="flex-1 divide-y divide-line">
          <div className="flex items-baseline justify-between gap-2 pb-2.5">
            <dt className="text-xs text-ink-muted">おわったレッスン</dt>
            <dd className="shrink-0">
              <span className="text-xl font-bold">{done}</span>
              <span className="text-sm text-ink-muted">/{total}</span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 py-2.5">
            <dt className="text-xs text-ink-muted">続けている日数</dt>
            <dd className="shrink-0 text-xl font-bold">
              {days}
              <span className="text-sm">日</span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 pt-2.5">
            <dt className="text-xs text-ink-muted">自分の課題で試した回数</dt>
            <dd className="shrink-0 text-xl font-bold">
              {realTaskCount}
              <span className="text-sm">回</span>
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-5 flex items-center gap-2 rounded-card bg-brand-soft px-4 py-3 text-sm text-brand-dark">
        <IconStar className="h-4 w-4 shrink-0" />
        {done === 0
          ? "まずは1つ。10分あれば終わります。"
          : "順調です。この調子で続けていきましょう。"}
      </p>
    </Card>
  );
}

// ------------------------------------------------------------ おすすめカード

/**
 * おすすめ1枚。
 *
 * 支給デザインでは絵の部分にポーが描かれているが、用途ごとの絵は
 * 手元に無い。勝手に描き起こすことはしないので、うすい地に用途の印を
 * 置いて代わりにしている（絵が用意できれば、ここだけ差し替えられる）。
 */
function RecommendCard({
  lesson,
  done,
  onSelect,
}: {
  lesson: Lesson;
  done: boolean;
  onSelect: () => void;
}) {
  const look = lookOf(lesson.id);

  return (
    <li className="w-64 shrink-0 sm:w-auto">
      <button
        type="button"
        onClick={onSelect}
        data-testid={`recommend-${lesson.id}`}
        className="flex h-full w-full flex-col overflow-hidden rounded-panel bg-surface
                   text-left shadow-card transition hover:-translate-y-0.5
                   hover:shadow-panel active:translate-y-0 active:scale-[0.99]"
      >
        <div className={`relative flex h-28 items-center justify-center ${look.wash}`}>
          <IconBadge icon={look.icon} tone={look.tone} size="lg" />
          <span
            className="absolute left-3 top-3 rounded-full bg-surface/90 px-2.5 py-1
                       text-[0.6875rem] font-bold text-brand"
          >
            {done ? "おわった" : "初級"}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <h3 className="text-sm font-bold leading-6">{lesson.title}</h3>
          <p className="mt-1.5 flex-1 text-xs leading-6 text-ink-muted">{lesson.goal}</p>

          <div className="mt-3 flex items-center gap-4 border-t border-line pt-3">
            {lesson.estimatedMinutes !== undefined && (
              <MetaPill icon={IconClock} value={`${lesson.estimatedMinutes}分`} />
            )}
            <MetaPill icon={IconBars} value="初級" />
          </div>
        </div>
      </button>
    </li>
  );
}

// ------------------------------------------------------------------ 本体

export function HomePage({ onSelectLesson, onOpenCourse }: HomePageProps) {
  const [completed, setCompleted] = useState<string[]>([]);
  const [recommended, setRecommended] = useState<string[]>([]);
  const [streak, setStreak] = useState({ days: 0, realTaskCount: 0 });

  useEffect(() => {
    setCompleted(listCompleted());
    setRecommended(recommendationsForHome());
    // 「今日ひらいた」ことをここで1回だけ数える
    const touched = touchStreak();
    setStreak({ days: touched.days, realTaskCount: readStreak().realTaskCount });
  }, []);

  const cards = recommended
    .map((id) => COURSE.lessons.find((lesson) => lesson.id === id))
    .filter((lesson): lesson is Lesson => lesson !== undefined);

  const nextLesson =
    COURSE.lessons.find(
      (lesson) => recommended.includes(lesson.id) && !completed.includes(lesson.id),
    ) ?? COURSE.lessons.find((lesson) => !completed.includes(lesson.id));

  return (
    <>
      <AppHeader />

      <main className="mx-auto max-w-2xl px-5 pb-28">
        {/* ── ポーが迎える ── */}
        {/*
          上から順に現れる。遅れは 40ms 刻みで、4段目より下は増やさない。
          待ち時間が伸びるほど「遅いアプリ」に感じられる。動きは
          「順番がある」ことだけを伝えれば足りる。
        */}
        <section
          className="flex animate-fade-up items-end gap-2 pt-2"
          aria-label="ポーからのあいさつ"
          data-testid="po-greeting"
        >
          <div className="flex-1 rounded-panel rounded-br-md bg-surface px-4 py-3 shadow-card">
            <p className="text-sm font-bold">こんにちは、ポーです。</p>
            <p className="mt-1 text-xs leading-6 text-ink-muted">
              今日も一緒に、AIの一歩を進めていきましょう。
            </p>
          </div>
          <img
            src="/brand/poe-wave.webp"
            alt=""
            aria-hidden="true"
            className="h-24 w-24 shrink-0 animate-float object-contain sm:h-28 sm:w-28"
          />
        </section>

        <div className="mt-4 animate-fade-up [animation-delay:0.04s]">
          <ProgressCard
            done={completed.length}
            total={COURSE.lessons.length}
            days={streak.days}
            realTaskCount={streak.realTaskCount}
            onOpenCourse={onOpenCourse}
          />
        </div>

        {/* ── おすすめ ── */}
        {cards.length > 0 && (
          <section
            className="mt-8 animate-fade-up [animation-delay:0.08s]"
            aria-labelledby="recommend-heading"
          >
            <div className="flex items-center gap-3">
              <IconBadge icon={IconSparkle} tone="plain" size="sm" />
              <h2 id="recommend-heading" className="flex-1 text-base font-bold">
                おすすめコース
              </h2>
              <button
                type="button"
                onClick={onOpenCourse}
                className="flex items-center gap-1 text-xs font-bold text-brand
                           transition hover:text-brand-dark"
              >
                すべて見る
                <IconChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/*
              狭い画面では横に流す。縦に積むと、他の節が下へ押し出されて
              「まだ先がある」ことが分からなくなる。
            */}
            <ul
              className="mt-4 flex snap-x gap-4 overflow-x-auto pb-2
                         sm:grid sm:grid-cols-3 sm:overflow-visible"
              role="list"
            >
              {cards.map((lesson) => (
                <RecommendCard
                  key={lesson.id}
                  lesson={lesson}
                  done={completed.includes(lesson.id)}
                  onSelect={() => onSelectLesson(lesson.id)}
                />
              ))}
            </ul>
          </section>
        )}

        {/* ── コース全体への入り口 ── */}
        {nextLesson && (
          <section
            className="relative mt-8 animate-fade-up overflow-hidden rounded-panel
                       bg-brand-soft p-5 [animation-delay:0.12s]"
            aria-labelledby="course-banner-heading"
          >
            <div className="flex items-start gap-2">
              <span className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">
                無料
              </span>
              <h2 id="course-banner-heading" className="text-lg font-bold leading-7">
                {COURSE.title}
              </h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              1日10分で、AIの使い方をやさしく学べます。
            </p>

            {/* 全体の中でどこまで来たか。番号は押せる */}
            <ol className="mt-4 flex gap-1.5 sm:gap-2" role="list">
              {COURSE.lessons.map((lesson) => {
                const isDone = completed.includes(lesson.id);
                const isNext = lesson.id === nextLesson.id;
                return (
                  <li key={lesson.id} className="flex-1">
                    <button
                      type="button"
                      onClick={() => onSelectLesson(lesson.id)}
                      aria-label={`${lesson.title}${isDone ? "（おわった）" : ""}`}
                      className={`flex aspect-square w-full items-center justify-center rounded-full
                                  text-xs font-bold transition
                                  ${
                                    isDone
                                      ? "bg-brand text-white"
                                      : isNext
                                        ? "bg-surface text-brand ring-2 ring-brand"
                                        : "bg-surface text-ink-muted hover:text-brand"
                                  }`}
                    >
                      {lesson.number}
                    </button>
                  </li>
                );
              })}
            </ol>

            <button
              type="button"
              data-testid="continue-lesson"
              onClick={() => onSelectLesson(nextLesson.id)}
              className="mt-5 flex w-full items-center justify-center gap-3 rounded-full
                         bg-brand-grad py-3.5 pl-6 pr-4 text-base font-bold text-white shadow-pop
                         transition hover:brightness-110 active:brightness-95
                         sm:w-auto sm:px-8"
            >
              <span className="flex-1">
                {completed.length === 0 ? "はじめる" : "続きから"}
              </span>
              <IconArrow className="h-5 w-5 shrink-0" />
            </button>
          </section>
        )}

        {/* ── 用途から探す ── */}
        <section
          className="mt-8 animate-fade-up [animation-delay:0.12s]"
          aria-labelledby="category-heading"
        >
          <div className="flex items-center gap-3">
            <IconBadge icon={IconFolder} tone="plain" size="sm" />
            <h2 id="category-heading" className="text-base font-bold">
              カテゴリから探す
            </h2>
          </div>

          <ul className="mt-4 flex flex-wrap gap-2.5" role="list">
            {CATEGORIES.map((category) => {
              const look = lookOf(category.lessonId);
              return (
                <li key={category.label}>
                  <button
                    type="button"
                    onClick={() => onSelectLesson(category.lessonId)}
                    className="flex items-center gap-2 rounded-full bg-surface py-2 pl-2 pr-4
                               text-sm shadow-card transition hover:-translate-y-0.5
                               hover:shadow-panel"
                  >
                    <IconBadge icon={look.icon} tone={look.tone} size="sm" />
                    {category.label}
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
