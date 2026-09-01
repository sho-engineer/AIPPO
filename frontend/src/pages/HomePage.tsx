/**
 * ホーム。
 *
 * ここは「ダッシュボード」ではない。開いた瞬間に
 * **今日なにをすればいいか**が分かる画面にする。
 *
 * 順番は上から:
 *
 *   1. ポーのひとこと（小さく・横並び）
 *   2. 今日のレッスン ← **この画面の主役**
 *   3. これまで（続けた日数・終えた本数・覚えた技・道のり）
 *   4. 見返しどき・飛ばした解説
 *   5. おすすめコース
 *   6. カテゴリから探す
 *
 * 「これから」を先に、「これまで」を後に
 * --------------------------------------
 * 前は 3 の中身が今日の1本より上にあった。どれも「ここまでの自分」の
 * 話で、**まだ今日を始めていない人に先に見せるもの**ではない。
 * 開いた人が最初に触るものを、最初に置く。
 *
 * 面で囲うのは、今日の1本ひとつだけ
 * --------------------------------
 * 白い面が2つ3つと浮くと、どれが本題かが分からなくなる。
 * 道のりも、おすすめも、探すも、線と余白で区切る。
 *
 * 何をやめたか
 * ------------
 * - 大きなポー（`PoHero`）… 見出し2行＋大きな絵＋吹き出しで、開いた
 *   直後の1画面をほぼ使い切っていた。ポーは案内役であって扉の絵ではない
 * - 全レッスンの一覧（7日間の道のり）… ホームで一覧まで見せると、
 *   「次に何をするか」と「全体の順番」を同じ画面が二重に持つことになる。
 *   順番はコースの道のり（CourseDetailPage）が持ち、ここからは
 *   進み具合と入口だけを出す
 * - 「学習の進み具合」という独立した節 … 見出し・丸の列・節目の予告・
 *   2つの数字で、今日の1本より背が高かった。数字は上の1行へ、
 *   丸と予告は道のりのカードへ分けた
 *
 * 役割を分ける
 * ------------
 * ホーム＝「次に何をするか」。道のりの画面＝「全体の順番と現在地」。
 * どちらか一方を見れば足りる状態にしない代わりに、同じものを
 * 両方には置かない。
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
import { HomeStats } from "../components/aippo/HomeStats";
import { SkillSummary } from "../components/aippo/SkillSummary";
import { PoGreeting } from "../components/aippo/PoGreeting";
import { PrimaryButton } from "../components/aippo/PrimaryButton";
import { ReviewPrompt } from "../components/ReviewPrompt";
import { ReviewCards } from "../components/course/ReviewCards";
import { PathProgress } from "../components/course/PathProgress";
import {
  IconArrow,
  IconBookmark,
  IconChevronRight,
  IconClock,
  IconSparkle,
  IconStreak,
} from "../components/Icons";
import { useCourse } from "../course/live";
import { startableLessons } from "../course/availability";
import { CATEGORIES, lookOf } from "../course/presentation";
import { LessonThumbnail } from "../components/lessons/LessonThumbnail";
import { lessonThumbnail } from "../course/lessonThumbnail";
import { recommendationsForHome } from "../course/recommend";
import { useCompletedLessons, useXpSummary } from "../course/progress";
import { readStreak, touchStreak } from "../lib/draft";
import { EVENTS, track } from "../lib/analytics";
import type { Lesson } from "../course/types";

export interface HomePageProps {
  onSelectLesson: (lessonId: string) => void;
  /** コース一覧タブへ。 */
  onOpenCourse: () => void;
  /** いま学んでいるコースの道のりへ。一覧を経由させない。 */
  onOpenPath: (courseId: string) => void;
  /** 学習記録タブへ。 */
  onOpenRecord: () => void;
  /** AI技図鑑へ。何ができるようになったかを見る場所 */
  onOpenSkills: () => void;
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
 * 今日のレッスン。この画面の主役。
 *
 * 出すのは**レッスンの**名前とねらい。コース名ではない。
 * コース名（7日でAIの最初の一歩）はどの日も同じで、今日やることを
 * 何も言っていない。開いた人が知りたいのは「次に何をするか」で、
 * それはレッスンの題とねらいにしか書かれていない。
 *
 * 高さを抑える
 * ------------
 * 前は絵を横いっぱいに敷いていた。390px の画面で、このカード1枚が
 * ほぼ1画面ぶんの高さになり、下に何があるのか分からなくなっていた。
 * 絵は左に 38%、題とねらいは右。ボタンだけを下いっぱいに置く。
 *
 * 絵は**引き伸ばさない**（4:3 のまま。LessonThumbnail が保証する）。
 * ポーが歪んだり切れたりしてはいけない。
 *
 * 「今日はここから」は札にしない
 * ------------------------------
 * 小さな前置きの1行に留める。囲って色を付けると、肝心の題より
 * 前置きのほうが強くなる。
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
  const thumbnail = lessonThumbnail(lesson);

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

      <div className="mt-2 flex items-start gap-3">
        {/*
          今日やる1本の絵。絵の無いレッスンでは、この場所ごと出さない
          （枠だけ残すと、読み込みに失敗しているように見える）。
          文字の側は flex-1 なので、絵が無ければ横いっぱいに広がる。
        */}
        {thumbnail && <LessonThumbnail src={thumbnail} variant="side" />}

        <div className="min-w-0 flex-1">
          <h2 id="next-heading" className="text-lg font-bold leading-7">
            {lesson.title}
          </h2>
          {/*
            ねらいは2行まで。3行入ると、絵より文字のほうが背が高くなり、
            カードの高さが教材ごとにばらつく。
          */}
          <p className="mt-1 line-clamp-2 text-xs leading-6 text-ink-muted">
            {lesson.goal}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
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

// ------------------------------------------------------------------ 本体

export function HomePage({
  onSelectLesson,
  onOpenCourse,
  onOpenPath,
  onOpenRecord,
  onOpenSkills,
  onOpenAccount,
}: HomePageProps) {
  /*
    終わったレッスンは、端末とサーバーの両方から取る。
    登録して別の端末で開いた人にも、同じ数が出るようにする。
  */
  const course = useCourse();
  const completed = useCompletedLessons();
  /* 学んだ量。届くまでは null で、この節ごと出さない */
  const learned = useXpSummary();
  const [recommended, setRecommended] = useState<string[]>([]);
  const [streak, setStreak] = useState({ days: 0, realTaskCount: 0 });

  useEffect(() => {
    setRecommended(recommendationsForHome());
    // 「今日ひらいた」ことをここで1回だけ数える
    const touched = touchStreak();
    setStreak({ days: touched.days, realTaskCount: readStreak().realTaskCount });
    /*
      開いた回。**この画面の分母。**

      見たい問いは「開いた人のうち、何人がその日の1本を始めたか」で、
      並びを変えたのはその率を上げるためだった。分母が無いと、
      押された回が増えたのか、来た人が増えただけなのかが分からない。
    */
    track(EVENTS.homeOpened);
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

      <main className="page">
        {/*
          ポーは学習ガイドであって、チャットボットでも扉の絵でもない。
          ひとことだけ、横に小さく。誰にでも当てはまる励ましは書かない。
        */}
        <PoGreeting
          emotion="talking"
          message={
            completed.length === 0
              ? "一緒に、少しずつ進めていきましょう！"
              : nextLesson
                ? `おかえりなさい。次は「${nextLesson.title}」です。`
                : "ここまでの教材はすべて終わりました。"
          }
        />

        {/*
          今日やること。あいさつの次はこれ。

          前は、続けた日数・AI技の数・…と3つはさんでいた。どれも
          「ここまでの自分」の話で、**まだ今日を始めていない人に
          先に見せるもの**ではなかった。開いた人が最初に触るものを、
          最初に置く。ここまでの記録は、この下の「これまで」に集めた。
        */}
        {nextLesson && (
          <div className="mt-4">
            <TodayCard
              lesson={nextLesson}
              started={completed.length > 0}
              onStart={() => {
                /*
                  今日の1本を押した回。**この画面の分子。**

                  ここだけを数える。下のおすすめやカテゴリから入った回は
                  別の話（探して見つけた人）で、混ぜると「今日やること」
                  が効いたのかどうかが分からなくなる。
                */
                track(EVENTS.continueLessonClicked, { lessonId: nextLesson.id });
                onSelectLesson(nextLesson.id);
              }}
            />
          </div>
        )}

        {/*
          ここまでの自分。数字・覚えた技・道のりを1つの節にまとめる。

          面では囲わない。今日の1本と同じ強さで浮かせると、
          「済んだこと」が「これからやること」と並んでしまう。
        */}
        <section className="mt-7" aria-labelledby="record-heading">
          <SectionHeading icon={IconStreak} id="record-heading">
            これまで
          </SectionHeading>

          <div className="mt-3 space-y-3">
            <HomeStats
              days={streak.days}
              done={completed.length}
              total={startable.length}
              tries={streak.realTaskCount}
              onOpenRecord={onOpenRecord}
            />

            {/*
              何ができるようになったか。終えた本数とは別のことを言う。
              1つも覚えていないうちは出さない（SkillSummary が判断する）。
            */}
            {learned && (
              <SkillSummary
                xp={learned.xp}
                skills={learned.skills}
                onOpen={onOpenSkills}
              />
            )}

            {/*
              道のりの進み具合と、その入口。

              一覧そのものはここに出さない。「全体の順番と現在地」は
              道のりの画面が持ち、ホームは「次に何をするか」に徹する。
            */}
            <PathProgress
              course={course}
              done={completed.length}
              total={startable.length}
              showCourseTitle
              framed={false}
              onOpenPath={() => onOpenPath(course.id)}
            />
          </div>
        </section>

        {/*
          そろそろ見返しどきのもの。無ければ何も出ない。
          余白は ReviewPrompt 自身が持つ。ここで囲うと、
          出すものが無い日にも空の余白だけが残る。
        */}
        <ReviewPrompt onSelectLesson={onSelectLesson} />

        {/*
          飛ばした解説。無い日は何も出ない。

          おすすめの前に置く。「次へ進む」より前に「戻れる場所」を出すのは、
          穴が空いたまま先へ進んでほしくないため。ただし押し付けない——
          出すのは節ひとつで、開かなければそのまま下へ流れる。
        */}
        <ReviewCards course={course} />

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

            {/*
              1件ずつ浮いたカードにしない。線で区切った行にする。
              今日の1本と同じ形で並ぶと、どれが今日のぶんなのかが
              一目で分からなくなる（囲ってよいのは今日の1本だけ）。
            */}
            <ul className="mt-2" role="list">
              {others.map((lesson) => {
                const look = lookOf(lesson.id);
                return (
                  <li key={lesson.id} className="border-b border-line last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onSelectLesson(lesson.id)}
                      data-testid={`recommend-${lesson.id}`}
                      data-availability="available"
                      className="row-tap flex w-full items-center gap-3 py-3.5
                                 text-left transition hover:bg-brand-soft/40"
                    >
                      {/* 印は線だけ。淡色の器を並べると、行より器が目立つ */}
                      <IconMark
                        icon={look.icon}
                        tone={look.tone === "plain" ? "brand" : look.tone}
                        className="h-5 w-5"
                      />

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold leading-6">
                          {lesson.title}
                        </span>
                        {/*
                          ねらいは書かない。題で分かるものを二度書くと、
                          並べたときに行の高さだけが増える。
                          時間は「いま押せるか」を決める材料なので残す。
                        */}
                        {lesson.estimatedMinutes !== undefined && (
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
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

          {/*
            2列のカードをやめて、札（chip）を折り返して並べる。

            6枚のカードが2列に並ぶと、面積では画面のいちばん下の節が
            いちばん大きくなる。ここは「見つからなかったときの逃げ道」
            なので、そこまで場所を取ってよい節ではない。
            札なら字の長さのぶんだけ幅を取り、6つで2〜3行に収まる。
          */}
          <ul className="mt-3 flex flex-wrap gap-2" role="list">
            {CATEGORIES.map((category) => {
              const look = lookOf(category.lessonId);
              return (
                <li key={category.label}>
                  <button
                    type="button"
                    onClick={() => onSelectLesson(category.lessonId)}
                    /* 指で押せる高さ（44px）は、札でも下回らない */
                    className="flex min-h-[2.75rem] items-center gap-2 rounded-badge
                               border border-line bg-surface px-3.5 py-2 text-sm
                               transition hover:border-brand-line hover:bg-brand-soft/40
                               active:scale-[0.97]"
                  >
                    <IconMark
                      icon={look.icon}
                      tone={look.tone === "plain" ? "brand" : look.tone}
                      className="h-4 w-4"
                    />
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
