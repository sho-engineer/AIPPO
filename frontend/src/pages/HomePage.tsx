/**
 * ホーム。
 *
 * ここは「ダッシュボード」ではない。開いた瞬間に
 * **今日なにをすればいいか**が分かる画面にする。
 *
 * 順番は上から:
 *
 *   1. ポーのあいさつ
 *   2. 今日のレッスン（題・ねらい・始めるボタン・所要時間）
 *   3. 学習の進み具合
 *   4. 7日間の道のり
 *   5. おすすめコース
 *   6. カテゴリから探す
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
import { ReviewCards } from "../components/course/ReviewCards";
import {
  IconArrow,
  IconBars,
  IconStreak,
  IconBookmark,
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconSparkle,
} from "../components/Icons";
import { useCourse } from "../course/live";
import { isComingSoon, startableLessons } from "../course/availability";
import { CATEGORIES, lookOf } from "../course/presentation";
import { CourseStampRow, NextMilestoneHint } from "../components/course/CourseStamps";
import { recommendationsForHome } from "../course/recommend";
import { useCompletedLessons } from "../course/progress";
import { readStreak, touchStreak } from "../lib/draft";
import type { Course, Lesson } from "../course/types";

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
 * 7日間の道のり。
 *
 * 丸を並べるのではなく、**1行に1回**の一覧にする。
 * 丸だけでは何の回か分からず、番号を数えないと自分の位置が読めない。
 * 題まで出せば、次に何をするのかが目で分かる。
 *
 * 桁をそろえる
 * ------------
 * 左から「Day n」「題」「状態」の3列。Day と状態の幅を固定して、
 * 題を残り全部にする。固定しないと、題の長さで Day の位置が動き、
 * 縦に読み下せなくなる（9行あるので、そこが効く）。
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
  return (
    <section aria-labelledby="roadmap-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="roadmap-heading" className="flex items-center gap-2 text-base font-bold">
          <IconMark icon={IconCalendar} className="h-[1.125rem] w-[1.125rem]" />
          7日間の道のり
        </h2>
        {/*
          「7日間」なのに回数が違うことがある（診断や最終課題が入る）。
          数は数えて出す。書き込むと、教材を足したときに合わなくなる。
        */}
        <span className="shrink-0 text-xs text-ink-muted">
          全{lessons.length}レッスン
        </span>
      </div>

      <ol className="mt-2" role="list" data-testid="day-track">
        {lessons.map((lesson) => {
          const done = completed.includes(lesson.id);
          const current = lesson.id === currentId;
          const soon = isComingSoon(lesson);

          return (
            <li key={lesson.id}>
              <button
                type="button"
                onClick={() => onSelectLesson(lesson.id)}
                disabled={soon}
                aria-disabled={soon}
                data-testid={`day-${lesson.id}`}
                className={`row row-tap items-center gap-3 disabled:cursor-not-allowed
                            ${soon ? "opacity-55" : ""}`}
              >
                {/* 左の列は幅を固定する。題の長さで位置を動かさない */}
                <span
                  className={`w-12 shrink-0 text-xs tabular-nums
                              ${current ? "font-bold text-brand-dark" : "text-ink-muted"}`}
                >
                  Day {lesson.number}
                </span>

                {/*
                  印も幅を固定する。終わった回だけチェックが入るので、
                  幅を空けておかないと題の頭が行ごとにずれる。
                */}
                <span className="flex w-4 shrink-0 justify-center" aria-hidden="true">
                  {done ? (
                    <IconCheck className="h-4 w-4 text-brand" />
                  ) : current ? (
                    <span className="h-2 w-2 rounded-full bg-brand" />
                  ) : (
                    <span className="h-2 w-2 rounded-full border border-line" />
                  )}
                </span>

                <span
                  className={`min-w-0 flex-1 truncate text-sm leading-6 ${current ? "font-bold" : ""}`}
                >
                  {lesson.title}
                </span>

                {/* 状態は右端。色だけでなく文字でも言う */}
                <span className="w-12 shrink-0 text-right text-xs">
                  {done ? (
                    <span className="text-ink-muted">完了</span>
                  ) : current ? (
                    <span className="font-bold text-brand-dark">今日</span>
                  ) : soon ? (
                    <span className="text-ink-muted">準備中</span>
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

/**
 * 今日のレッスン。この画面の主役。
 *
 * 出すのは**レッスンの**名前とねらい。コース名ではない。
 * コース名（7日でAIの最初の一歩）はどの日も同じで、今日やることを
 * 何も言っていない。開いた人が知りたいのは「次に何をするか」で、
 * それはレッスンの題とねらいにしか書かれていない。
 *
 * 所要時間はボタンの隣に置く。「8分なら今できる」と決められるように、
 * 押す直前に見える場所へ置く。
 *
 * この画面で押す場所は基本ここ1つなので、面で囲う条件を満たしている。
 * 逆に言えば、囲ってよいのはここだけ。
 */
function TodayCard({
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
      className="rounded-panel border border-line bg-surface p-4 shadow-card"
      aria-labelledby="next-heading"
      data-testid="next-up"
    >
      <p className="flex items-center gap-1.5 text-xs font-bold text-brand">
        <IconBookmark className="h-4 w-4" />
        {started ? "今日のつづき" : "今日はここから"}
      </p>

      <h2 id="next-heading" className="mt-1.5 text-xl font-bold leading-8">
        {lesson.title}
      </h2>
      <p className="mt-1 text-sm leading-7 text-ink-muted">{lesson.goal}</p>

      <div className="mt-4 flex items-center gap-3">
        <PrimaryButton
          testId="continue-lesson"
          onClick={onStart}
          trailing={<IconChevronRight className="h-5 w-5 shrink-0" />}
          className="flex-1"
        >
          {started ? "つづきをはじめる" : "はじめる"}
        </PrimaryButton>

        {lesson.estimatedMinutes !== undefined && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-ink-muted">
            <IconClock className="h-4 w-4" />約{lesson.estimatedMinutes}分
          </span>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ 進み具合

function Progress({
  course,
  done,
  total,
  days,
  realTaskCount,
  onOpenRecord,
}: {
  course: Course;
  done: number;
  total: number;
  days: number;
  realTaskCount: number;
  onOpenRecord: () => void;
}) {
  return (
    <section aria-labelledby="progress-heading" data-testid="progress-summary">
      <SectionHeading
        icon={IconBars}
        id="progress-heading"
        action={{ label: "詳細を見る", onClick: onOpenRecord }}
      >
        学習の進み具合
      </SectionHeading>

      {/*
        丸を並べたスタンプで進み具合を見せる。ただの棒より、
        1本ごとに埋まっていく実感が強い。「詳しくは完了画面で」に
        なるので、節目の一覧まではここに出さない
        （巨大なゲーミフィケーション画面にはしない）。
      */}
      <div className="mt-3">
        <CourseStampRow course={course} done={done} total={total} />
        <NextMilestoneHint course={course} done={done} />
      </div>

      {/*
        左右に1つずつ。支給デザインは右が「学習時間」だが、
        滞在時間は測っていないので、実際に数えている日数を置く。
      */}
      <div className="mt-2 flex items-baseline justify-between gap-3 text-xs">
        <p className="text-ink-muted">
          <span className="text-sm font-bold tabular-nums text-ink">
            {done} / {total}
          </span>{" "}
          レッスン完了
        </p>
        {/*
          続けた日数。炎の印を添える。
          数字だけだと、進み具合の分子と見分けが付かない。
        */}
        <p className="flex items-center gap-1 text-ink-muted">
          <IconStreak className="h-4 w-4 shrink-0 text-caution" aria-hidden="true" />
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
              lesson={nextLesson}
              started={completed.length > 0}
              onStart={() => onSelectLesson(nextLesson.id)}
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
            course={course}
            done={completed.length}
            total={startable.length}
            days={streak.days}
            realTaskCount={streak.realTaskCount}
            onOpenRecord={onOpenRecord}
          />
        </div>

        {/*
          飛ばした解説。無い日は何も出ない。

          道のりの前に置く。「次へ進む」より前に「戻れる場所」を出すのは、
          穴が空いたまま先へ進んでほしくないため。ただし押し付けない——
          出すのは節ひとつで、開かなければそのまま下へ流れる。
        */}
        <ReviewCards course={course} />

        {/* ── 7日間の道のり ── */}
        <div className="mt-7">
          <DayTrack
            lessons={course.lessons}
            completed={completed}
            currentId={nextLesson?.id ?? null}
            onSelectLesson={onSelectLesson}
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
                    /*
                      6つとも同じ大きさにする。字数（文章／情報整理）で
                      高さが変わると、2列の並びがガタつく。
                      印の大きさと文字の始まりも、行ごとにずらさない。
                    */
                    className="flex h-full min-h-[3.5rem] w-full items-center gap-2.5
                               rounded-card border border-line bg-surface px-3 py-3
                               text-left shadow-card transition
                               hover:border-brand-line active:scale-[0.99]"
                  >
                    {/* 印の列は幅を固定する。絵の形で文字の始まりを変えない */}
                    <span className="flex w-5 shrink-0 justify-center">
                      <IconMark
                        icon={look.icon}
                        tone={look.tone === "plain" ? "brand" : look.tone}
                        className="h-5 w-5"
                      />
                    </span>
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
