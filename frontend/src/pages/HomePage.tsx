/**
 * ホーム。
 *
 * ここは「ダッシュボード」ではない。開いた瞬間に
 * **今日なにをすればいいか**が分かる画面にする。
 *
 * 順番は上から:
 *
 *   1. ポーのあいさつ
 *   2. 今日のつづき（コース名・何日目・7日の道のり・始めるボタン）
 *   3. 学習の進み具合
 *   4. おすすめコース
 *   5. カテゴリから探す
 *
 * 以前はこれが逆だった。円グラフ・継続日数・試した回数を先に見せ、
 * 「次にやること」は横スクロールのカードの中に埋もれていた。
 * 数字を眺めに来る人はいない。学びに来ている。
 *
 * 出すのは**自分のこと**だけ。順位も、他人との比較も出さない
 * （比べさせると、遅い人ほど続かなくなる）。
 *
 * 数字は測ったものだけ
 * --------------------
 * 支給デザインには「学習時間 2時間15分」がある。**出していない。**
 * このアプリは滞在時間を測っていないので、出すなら数え始めるところから
 * になる。空いた場所には、実際に数えている「続けて n 日」を置いた。
 * 見た目のために、測っていない数字を作らない。
 */

import { useEffect, useState } from "react";

import { AppHeader, IconMark } from "../components/AppShell";
import { PoHero } from "../components/aippo/PoHero";
import { PrimaryButton } from "../components/aippo/PrimaryButton";
import { ReviewPrompt } from "../components/ReviewPrompt";
import {
  IconArrow,
  IconBars,
  IconBookmark,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconMedal,
  IconSparkle,
} from "../components/Icons";
import { useCourse } from "../course/live";
import { isComingSoon, startableLessons } from "../course/availability";
import { CATEGORIES, lookOf } from "../course/presentation";
import { recommendationsForHome } from "../course/recommend";
import { useCompletedLessons } from "../course/progress";
import { readStreak, touchStreak } from "../lib/draft";
import type { Lesson } from "../course/types";

export interface HomePageProps {
  onSelectLesson: (lessonId: string) => void;
  /** コース一覧タブへ。 */
  onOpenCourse: () => void;
  /** 学習記録タブへ。 */
  onOpenRecord: () => void;
  onOpenAccount: () => void;
}

// ------------------------------------------------------------ 節の見出し

/**
 * 節の見出し。左に線だけの印、右に行き先。
 *
 * 印は器に入れない。淡色の四角に入れると、節が増えるほど同じ形の四角が
 * 縦に並び、見出しそのものより印のほうが目立つ。
 */
function SectionHeading({
  icon,
  id,
  children,
  action,
}: {
  icon: Parameters<typeof IconMark>[0]["icon"];
  id: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2 text-base font-bold">
        <IconMark icon={icon} className="h-[1.125rem] w-[1.125rem]" />
        {children}
      </h2>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          /* 当たり判定を広げる（py と -my を同じだけ。見た目は変わらない） */
          className="-my-2 flex shrink-0 items-center gap-0.5 py-2 text-xs font-bold
                     text-brand transition hover:text-brand-dark"
        >
          {action.label}
          <IconChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------- 今日のつづき

/**
 * 7日の道のりを、丸で1列に並べたもの。
 *
 * 数字だけの丸を並べる。題は出さない——7つ並べて全部に題を付けると、
 * それは道のりではなく目次になる。ここで伝えたいのは
 * 「いま何日目で、あと何日か」だけ。
 *
 * 終わった回はチェック、いまの回は青く塗る。色だけで表さないよう、
 * 読み上げ用の説明を1つずつ付ける。
 *
 * 最後の記章は修了証。ここまで来ると受け取れる、という行き先を見せる。
 */
function DayTrack({
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
  const allDone = lessons.length > 0 && lessons.every((l) => completed.includes(l.id));

  return (
    <ol
      /*
        入りきらない端末では横に流す。画面ごと横に伸びるのは避ける（§33）ので、
        流すのはこの1行の中だけにする。
      */
      className="mt-4 flex items-center justify-between overflow-x-auto pb-1"
      role="list"
      aria-label="7日間の道のり"
      data-testid="day-track"
    >
      {lessons.map((lesson, index) => {
        const done = completed.includes(lesson.id);
        const current = lesson.id === currentId;
        const soon = isComingSoon(lesson);
        const state = done ? "おわった" : current ? "今日" : soon ? "近日公開" : "これから";

        return (
          <li key={lesson.id} className="flex shrink-0 items-center">
            {/* 丸と丸をつなぐ線。道のりであることを示す */}
            {index > 0 && (
              <span
                aria-hidden="true"
                className={`h-px w-1 shrink-0 sm:w-3 ${done || current ? "bg-brand-line" : "bg-line"}`}
              />
            )}
            <button
              type="button"
              onClick={() => onSelectLesson(lesson.id)}
              disabled={soon}
              aria-label={`Day ${lesson.number} ${lesson.title}（${state}）`}
              data-testid={`day-${lesson.id}`}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                          text-xs font-bold tabular-nums transition
                          disabled:cursor-not-allowed disabled:opacity-45
                          ${
                            current
                              ? "bg-brand text-white shadow-cta"
                              : done
                                ? "bg-brand-soft text-brand-dark"
                                : "border border-line bg-surface text-ink-muted"
                          }`}
            >
              {done ? <IconCheck className="h-4 w-4" /> : lesson.number}
            </button>
          </li>
        );
      })}

      <li className="flex shrink-0 items-center">
        <span aria-hidden="true" className="h-px w-1 shrink-0 bg-line sm:w-3" />
        <span
          /*
            役を持たない span に読み上げ用の名前は付けられない（axe が拾う）。
            絵として扱うと決めて、役を明示する。
          */
          role="img"
          aria-label={allDone ? "修了証を受け取れます" : "最後まで進むと修了証"}
          className={`flex h-8 w-8 items-center justify-center rounded-full
                      ${allDone ? "bg-joy-soft text-joy" : "bg-canvas text-ink-muted/50"}`}
        >
          <IconMedal className="h-4 w-4" />
        </span>
      </li>
    </ol>
  );
}

/**
 * 今日のつづき。
 *
 * この画面で押す場所は基本ここ1つなので、面で囲う条件を満たしている。
 * 逆に言えば、囲ってよいのはここだけ。
 */
function TodayCard({
  courseTitle,
  courseDescription,
  lesson,
  dayLabel,
  started,
  lessons,
  completed,
  onStart,
  onSelectLesson,
}: {
  courseTitle: string;
  courseDescription: string;
  lesson: Lesson;
  dayLabel: string;
  started: boolean;
  lessons: Lesson[];
  completed: string[];
  onStart: () => void;
  onSelectLesson: (id: string) => void;
}) {
  return (
    <section
      className="rounded-panel border border-line bg-surface p-4 shadow-card"
      aria-labelledby="next-heading"
      data-testid="next-up"
    >
      <p className="flex items-center gap-1.5 text-xs font-bold text-brand">
        <IconBookmark className="h-4 w-4" />
        {started ? "今日のつづき" : "今日はここから"}
      </p>

      <div className="mt-1.5 flex items-start justify-between gap-3">
        <h2 id="next-heading" className="min-w-0 text-xl font-bold leading-8">
          {courseTitle}
        </h2>
        {/* 何日目か。ここだけは丸く囲う——日付は「札」として読まれる */}
        <span className="shrink-0 rounded-badge bg-brand-soft px-2.5 py-1 text-xs font-bold text-brand-dark">
          {dayLabel}
        </span>
      </div>

      <p className="mt-1 text-sm leading-7 text-ink-muted">{courseDescription}</p>

      <DayTrack
        lessons={lessons}
        completed={completed}
        currentId={lesson.id}
        onSelectLesson={onSelectLesson}
      />

      <div className="mt-4">
        <PrimaryButton
          testId="continue-lesson"
          onClick={onStart}
          trailing={<IconChevronRight className="h-5 w-5 shrink-0" />}
        >
          {started ? "つづきをはじめる" : "はじめる"}
        </PrimaryButton>
      </div>

      {/*
        次に開くのがどれかは、ボタンの下に文字で置く。
        コース名だけだと、押した先で何が始まるのか分からない。
      */}
      <p className="mt-2.5 flex items-center justify-center gap-2 text-xs text-ink-muted">
        <span className="truncate">次は「{lesson.title}」</span>
        {lesson.estimatedMinutes !== undefined && (
          <span className="flex shrink-0 items-center gap-1">
            <IconClock className="h-3.5 w-3.5" />約{lesson.estimatedMinutes}分
          </span>
        )}
      </p>
    </section>
  );
}

// ------------------------------------------------------------------ 進み具合

function Progress({
  done,
  total,
  days,
  realTaskCount,
  onOpenRecord,
}: {
  done: number;
  total: number;
  days: number;
  realTaskCount: number;
  onOpenRecord: () => void;
}) {
  const ratio = total === 0 ? 0 : done / total;

  return (
    <section aria-labelledby="progress-heading" data-testid="progress-summary">
      <SectionHeading
        icon={IconBars}
        id="progress-heading"
        action={{ label: "詳細を見る", onClick: onOpenRecord }}
      >
        学習の進み具合
      </SectionHeading>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-line"
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

      {/*
        左右に1つずつ。支給デザインは右が「学習時間」だが、
        滞在時間は測っていないので、実際に数えている日数を置く。
      */}
      <div className="mt-2 flex items-baseline justify-between gap-3 text-xs">
        <p className="text-ink-muted">
          完了レッスン{" "}
          <span className="text-sm font-bold tabular-nums text-ink">
            {done}
            <span className="text-ink-muted"> / {total}</span>
          </span>
        </p>
        <p className="text-ink-muted">
          {days > 0 ? (
            <>
              続けて{" "}
              <span className="text-sm font-bold tabular-nums text-ink">{days}</span> 日
            </>
          ) : (
            "今日がはじめの1日"
          )}
        </p>
      </div>

      {realTaskCount > 0 && (
        <p className="mt-1 text-xs text-ink-muted">
          自分の課題で{realTaskCount}回ためしました
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ 本体

export function HomePage({
  onSelectLesson,
  onOpenCourse,
  onOpenRecord,
  onOpenAccount,
}: HomePageProps) {
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
  const others = startable.filter((lesson) => lesson.id !== nextLesson?.id).slice(0, 2);

  return (
    <>
      <AppHeader onOpenAccount={onOpenAccount} />

      <main className="mx-auto max-w-2xl px-5 pb-28 pt-2">
        {/*
          ポーは学習ガイドであって、チャットボットではない。
          あいさつは1回だけ、短く。誰にでも当てはまる励ましは書かない。
        */}
        <PoHero
          title={
            <>
              こんにちは！
              <br />
              ポーです
            </>
          }
          emotion="talking"
          message={
            completed.length === 0
              ? "一緒に学んで、使える力を少しずつつけていきましょう！"
              : nextLesson
                ? `おかえりなさい。次は「${nextLesson.title}」です。`
                : "ここまでの教材はすべて終わりました。"
          }
        />

        {nextLesson && (
          <div className="mt-5">
            <TodayCard
              courseTitle={course.title}
              courseDescription={course.description}
              lesson={nextLesson}
              dayLabel={`${nextLesson.number}日目`}
              started={completed.length > 0}
              lessons={course.lessons}
              completed={completed}
              onStart={() => onSelectLesson(nextLesson.id)}
              onSelectLesson={onSelectLesson}
            />
          </div>
        )}

        {/*
          そろそろ見返しどきのもの。無ければ何も出ない。
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
            onOpenRecord={onOpenRecord}
          />
        </div>

        {/* ── おすすめコース ── */}
        {others.length > 0 && (
          <section className="mt-7" aria-labelledby="others-heading">
            <SectionHeading
              icon={IconSparkle}
              id="others-heading"
              action={{ label: "すべて見る", onClick: onOpenCourse }}
            >
              おすすめコース
            </SectionHeading>

            <ul className="mt-3 space-y-3" role="list">
              {others.map((lesson) => {
                const look = lookOf(lesson.id);
                return (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      onClick={() => onSelectLesson(lesson.id)}
                      data-testid={`recommend-${lesson.id}`}
                      data-availability="available"
                      className="flex w-full items-center gap-3 rounded-panel border
                                 border-line bg-surface p-3 text-left shadow-card
                                 transition hover:border-brand-line active:scale-[0.995]"
                    >
                      {/*
                        絵の代わりに、用途の印を淡い地に置く。
                        写真もイラストも用意が無いので、無いものを
                        それらしく埋めない。
                      */}
                      <span
                        aria-hidden="true"
                        className={`flex h-14 w-14 shrink-0 items-center justify-center
                                    rounded-card ${look.wash}`}
                      >
                        <IconMark
                          icon={look.icon}
                          tone={look.tone === "plain" ? "brand" : look.tone}
                          className="h-6 w-6"
                        />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold leading-6">
                          {lesson.title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-ink-muted">
                          {lesson.goal}
                        </span>
                        {lesson.estimatedMinutes !== undefined && (
                          <span className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                            <IconClock className="h-3.5 w-3.5" />約
                            {lesson.estimatedMinutes}分
                          </span>
                        )}
                      </span>

                      <IconChevronRight className="h-5 w-5 shrink-0 text-ink-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ── カテゴリから探す ── */}
        <section className="mt-7" aria-labelledby="category-heading">
          <SectionHeading icon={IconArrow} id="category-heading">
            カテゴリから探す
          </SectionHeading>

          <ul className="mt-3 grid grid-cols-2 gap-3" role="list">
            {CATEGORIES.map((category) => {
              const look = lookOf(category.lessonId);
              return (
                <li key={category.label}>
                  <button
                    type="button"
                    onClick={() => onSelectLesson(category.lessonId)}
                    className="flex min-h-[3.5rem] w-full items-center gap-2.5 rounded-card
                               border border-line bg-surface px-3 py-3 text-left shadow-card
                               transition hover:border-brand-line active:scale-[0.99]"
                  >
                    <IconMark
                      icon={look.icon}
                      tone={look.tone === "plain" ? "brand" : look.tone}
                      className="h-5 w-5"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {category.label}
                    </span>
                    <IconChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
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
