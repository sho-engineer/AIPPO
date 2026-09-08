/**
 * ホーム。
 *
 * ここは「ダッシュボード」ではない。**今日のつづきをやりに戻ってくる
 * 場所**にする。開いた瞬間に見えるのは、おかえりの一言と、今日の1本と、
 * それを始めるボタン。それ以外は下へ流す。
 *
 * 順番は上から:
 *
 *   1. おかえりなさい ＋ ポーのひとこと
 *   2. 今日のつづき ← **この画面の主役**
 *   3. これまでの記録（進み具合の帯）
 *   4. 身についたこと ／ 今週の学習
 *   5. ほかにも見る
 *
 * 「これから」を先に、「これまで」を後に
 * --------------------------------------
 * 3 以降はどれも「ここまでの自分」の話で、**まだ今日を始めていない人に
 * 先に見せるもの**ではない。開いた人が最初に触るものを、最初に置く。
 *
 * 面で囲うのは、今日の1本ひとつだけ
 * --------------------------------
 * 白い面が2つ3つと浮くと、どれが本題かが分からなくなる。記録も、探すも、
 * 線と余白で区切る（「身についたこと／今週の学習」の2枚だけは、数字を
 * 並べる器として例外）。
 *
 * ホームに置かないもの
 * --------------------
 * - **AI活用診断** … 受けるのは1回。毎日開く場所の主役にはしない
 * - **おすすめコース** … 「次に何をするか」は今日の1本が答える。
 *   もう1つ並べると、開くたびに選び直させることになる
 * - **Credit の話** … 学びの画面で数える話ではない
 *
 * 「AI技」と書かない
 * ------------------
 * ホームでは「身についたこと」。同じものを図鑑の中では技として扱うが、
 * 毎日開く場所に AI の語を並べると、学習アプリではなく AI の道具箱に
 * 見える。
 *
 * 1画面に収める
 * --------------
 * 上から下まで、**送らずに全部見える**ことを保つ（`e2e/homeFits.spec.ts`）。
 * 主役の下に積んであるのはどれも「ここまでの自分」の話なので、送らないと
 * 見えないなら、置いていないのとほとんど変わらない。
 *
 * 低い持ち方（iPhone の Safari で上下の帯が出ている状態＝ 402×660）では、
 * 高さで2つ畳む——今日の1本のねらい書きと、「ほかにも見る」。どちらも
 * 行き止まりにはならない（前者はレッスンの最初の一枚、後者は下の帯の
 * 「コース」と、いちばん下の「学習の道のりを見る」）。
 *
 * 数字は測ったものだけ
 * --------------------
 * 支給デザインには「学習時間 2時間15分」がある。**出していない。**
 * このアプリは滞在時間を測っていないので、出すなら数え始めるところから
 * になる。「今週の学習」も同じで、**ひらいた日を数えて**出している
 * （`lib/draft.ts` の `daysThisWeek`）。見た目のために、測っていない
 * 数字を作らない。
 */

import { useEffect, useState } from "react";

import { AppHeader, IconMark } from "../components/AppShell";
import { PoFace } from "../po/PoAvatar";
import { PrimaryButton } from "../components/aippo/PrimaryButton";
import { ReviewPrompt } from "../components/ReviewPrompt";
import { ReviewCards } from "../components/course/ReviewCards";
import {
  IconBookmark,
  IconCalendar,
  IconChevronRight,
  IconClock,
  IconMedal,
} from "../components/Icons";
import { useCourse } from "../course/live";
import { startableLessons } from "../course/availability";
import { CATEGORIES, lookOf } from "../course/presentation";
import { LessonThumbnail } from "../components/lessons/LessonThumbnail";
import { lessonThumbnail } from "../course/lessonThumbnail";
import { recommendationsForHome } from "../course/recommend";
import { useCompletedLessons, useXpSummary } from "../course/progress";
import { daysThisWeek, touchStreak } from "../lib/draft";
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
  /** 身についたことの一覧へ。 */
  onOpenSkills: () => void;
  onOpenAccount: () => void;
}

// ---------------------------------------------------------- おかえりなさい

/**
 * 迎える一言と、ポー。
 *
 * 見出しは**いつも「おかえりなさい」ではない**。初めての人に
 * 「おかえり」と言うと、どこから帰ってきたのか分からない。
 *
 * ポーは右に小さく。吹き出しは1行で切れる長さにする——ここで2行に
 * なると、今日の1本がそのぶん下がる。
 */
function Welcome({ done, bubble }: { done: number; bubble: string }) {
  return (
    <section className="flex items-start gap-3" data-testid="home-greeting">
      <div className="min-w-0 flex-1 pt-1">
        {/*
          22px。24px にすると「おかえりなさい」が 196px になり、
          吹き出しとポーを足した幅が 390px に収まらず、見出しが
          2行に割れる（下の但し書きに実測を残した）。
        */}
        <h1 className="text-[1.375rem] font-bold leading-8">
          {done === 0 ? "はじめまして" : "おかえりなさい"}
        </h1>
        {/*
          1行に収まる長さにする。

          「今日も少しずつ、やってみましょう。」は 390px で**2行に
          折り返していた**（実測 48px）。左の柱がポー（78px）より
          高くなり、あいさつの節がそのぶん伸びる。言っていることは
          変えずに、点で切る。
        */}
        <p className="mt-1 text-sm leading-6 text-ink-muted">今日も少しずつ。</p>
      </div>

      {/*
        吹き出しとポー。**装飾ではなく、ひとこと言う役**。

        ふきだしは絵の左に置く。右に置くと画面の端に寄って、
        しっぽの向きと文字の流れが逆になる。

        右の幅を詰める理由
        ------------------
        390px の実測で、この行に使えるのは 350px（左右 20px の余白）。
        絵は `sm`（枠 78px）で、一覧まわりと同じ背丈——**ここだけ
        小さくしない**（`po/sizes.ts`。大きさは役割で決める）。
        だから詰められるのは吹き出しの側だけで、88px まで。
        右は 86 ＋ すきま 4 ＋ 78 で 168px、左に 170px 残る。

        見出し「おかえりなさい」は 22px で 154px。**24px にすると
        196px になって収まらず、3行に割れる**（実際そうなっていた）。
        吹き出しの一言も**6文字まで**。7文字で折り返し、折り返した
        ぶんだけ今日の1本が下がる。
      */}
      <div className="flex shrink-0 items-center gap-1">
        <p
          data-testid="po-hero-message"
          aria-live="polite"
          className="max-w-[5.5rem] rounded-card bg-surface px-2.5 py-1.5
                     text-[0.6875rem] leading-4 shadow-card"
        >
          {bubble}
        </p>
        <div data-testid="po-avatar" data-emotion="talking" className="pointer-events-none">
          <PoFace emotion="talking" size="sm" />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------- 今日のつづき

/**
 * 今日の1本。この画面の主役。
 *
 * 出すのは**レッスンの**名前とねらい。コース名ではない。コース名は
 * どの日も同じで、今日やることを何も言っていない。
 *
 * 絵は右、文字は左。**ボタンは幅いっぱい。** この画面でいちばん強く
 * 押せる場所は、ここ1つと決める。
 */
function TodayCard({
  lesson,
  started,
  day,
  total,
  onStart,
}: {
  lesson: Lesson;
  started: boolean;
  day: number;
  total: number;
  onStart: () => void;
}) {
  const thumbnail = lessonThumbnail(lesson);

  return (
    <section
      className="rounded-panel border border-line bg-surface p-3.5 shadow-card"
      aria-labelledby="next-heading"
      data-testid="next-up"
    >
      <p className="flex items-center gap-1.5 text-xs font-bold text-brand">
        <IconBookmark className="h-4 w-4" />
        {started ? "今日のつづき" : "今日はここから"}
      </p>

      <div className="mt-1.5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="next-heading" className="text-lg font-bold leading-7">
            {lesson.title}
          </h2>

          {/* かかる時間と、7日のうちの何日目か。押す前に決める材料 */}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            {lesson.estimatedMinutes !== undefined && (
              <span className="flex items-center gap-1">
                <IconClock className="h-3.5 w-3.5" />約{lesson.estimatedMinutes}分
              </span>
            )}
            <span className="flex items-center gap-1 tabular-nums">
              <IconCalendar className="h-3.5 w-3.5" />
              Day {day} / {total}
            </span>
          </p>

          {/*
            低い持ち方では出さない。

            Safari の上下の帯が出ていると、見える高さは 660px ほどしか
            残らない。この2行（48px）が入ると左の柱が 140px になり、
            絵（90px）より高くなって**カードごと 50px 伸びる**。
            そのぶんが下の節から引かれ、ホーム全体が1画面に収まらなくなる。

            消えても行き止まりにはならない。ねらいはレッスンを開いた
            最初の一枚（`LessonIntroModal`）が、もっと詳しく持っている。
          */}
          {/*
            畳むのは**外側の箱**。`line-clamp-2` と同じ札に `hidden` /
            `block` を置いてはいけない——`line-clamp` は
            `display:-webkit-box` を敷いて効くもので、`block` が
            後から同じ `display` を上書きする。実際そうなっていて、
            2行のはずのねらいが3行そのまま出ていた（左の柱が
            140px → 164px）。`FullText` で一度踏んだのと同じ穴。
          */}
          <div className="hidden [@media(min-height:700px)]:block">
            <p className="mt-2 line-clamp-2 text-[0.8125rem] leading-6 text-ink-muted">
              {lesson.outcomeDescription ?? lesson.goal}
            </p>
          </div>
        </div>

        {/*
          今日やる1本の絵。絵の無いレッスンでは、この場所ごと出さない
          （枠だけ残すと、読み込みに失敗しているように見える）。
        */}
        {thumbnail && <LessonThumbnail src={thumbnail} variant="side" />}
      </div>

      <PrimaryButton
        testId="continue-lesson"
        onClick={onStart}
        trailing={<IconChevronRight className="h-5 w-5 shrink-0" />}
        className="mt-3 w-full"
      >
        {started ? "つづきをはじめる" : "はじめる"}
      </PrimaryButton>
    </section>
  );
}

// ------------------------------------------------------------ これまでの記録

/**
 * どこまで来たか。**帯と丸だけ。**
 *
 * 前はここに「あと3レッスンで 1 Credit」まで出していた。学びの画面で
 * 数える話ではないうえ、進み具合の意味が「あと何回でもらえるか」に
 * すり替わる。
 */
function Record({
  done,
  total,
  onOpenRecord,
}: {
  done: number;
  total: number;
  onOpenRecord: () => void;
}) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;

  return (
    <section aria-labelledby="record-heading" data-testid="progress-summary">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="record-heading" className="text-base font-bold">
          これまでの記録
        </h2>
        <button
          type="button"
          onClick={onOpenRecord}
          data-testid="open-record"
          className="-my-2 shrink-0 py-2 text-xs text-ink-muted tabular-nums
                     transition hover:text-ink"
        >
          <span className="font-bold text-ink">
            {done} / {total}
          </span>{" "}
          レッスン完了
        </button>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-line">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>

      {/*
        丸は置かない。

        「帯」「◯/◯ レッスン完了」「丸の列」で、**同じ数を3回**
        言っていた。3回言っても分かることは増えず、44px を使う
        （丸 32 ＋ 上の余白 12）。ホームを1画面に収めるとき、
        いちばん先に落ちるのはここ。

        スタンプとして数えたい人には、コースの道のりに丸が並んで
        いる（`PathProgress`。ホームには持ち込まないと決めてある
        ——`e2e/courseStamps.spec.ts`）。
      */}
    </section>
  );
}

// ------------------------------------------ 身についたこと ／ 今週の学習

/** 数字を1つ持つ札。押すと、その中身の画面へ。 */
function StatCard({
  icon,
  tone,
  label,
  value,
  unit,
  onClick,
  testId,
}: {
  icon: Parameters<typeof IconMark>[0]["icon"];
  tone: "teal" | "rose";
  label: string;
  value: number;
  unit?: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex flex-1 items-center gap-2.5 rounded-card border border-line
                 bg-surface px-3 py-2.5 text-left transition
                 hover:border-brand-line active:scale-[0.98]"
    >
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          tone === "teal" ? "bg-accent-teal-soft" : "bg-accent-rose-soft"
        }`}
      >
        <IconMark icon={icon} tone={tone} className="h-4 w-4" />
      </span>

      {/*
        名前は折り返させない。390px で2枚を並べると1枚あたり 171px
        しか無く、「身についたこと」が2行に割れて数字が押し下げられて
        いた。**「＞」も外した**——札ごと押せることは、押したときの
        沈み込みで分かる。ここで 16px 取り返すほうが効く。
      */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs leading-4 text-ink-muted">
          {label}
        </span>
        <span className="mt-0.5 block text-lg font-bold leading-7 tabular-nums">
          {value}
          {unit && <span className="ml-0.5 text-xs font-normal">{unit}</span>}
        </span>
      </span>
    </button>
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
  /* 学んだ量。届くまでは null */
  const learned = useXpSummary();
  const [recommended, setRecommended] = useState<string[]>([]);
  const [week, setWeek] = useState(0);

  useEffect(() => {
    setRecommended(recommendationsForHome());
    // 「今日ひらいた」ことをここで1回だけ数える
    touchStreak();
    setWeek(daysThisWeek());
    /*
      開いた回。**この画面の分母。**

      見たい問いは「開いた人のうち、何人がその日の1本を始めたか」で、
      並びを変えたのはその率を上げるためだった。分母が無いと、
      押された回が増えたのか、来た人が増えただけなのかが分からない。
    */
    track(EVENTS.homeOpened);
  }, []);

  /*
    ホームで数えるのは、**AIを使う教材だけ**。

    近日公開を分母に混ぜると、始めようのないもので割ることになり、
    どれだけやっても終わらない画面になる。診断も外す——受けるのは
    1回で、毎日開く場所の「あと何本」に混ぜるものではない
    （`usesAi` が false なのは診断だけ）。
  */
  const learnable = startableLessons(course.lessons).filter(
    (lesson) => lesson.usesAi,
  );

  const nextLesson =
    learnable.find(
      (lesson) => recommended.includes(lesson.id) && !completed.includes(lesson.id),
    ) ?? learnable.find((lesson) => !completed.includes(lesson.id));

  const doneCount = learnable.filter((lesson) =>
    completed.includes(lesson.id),
  ).length;

  return (
    <>
      <AppHeader onOpenAccount={onOpenAccount} />

      {/*
        下の余白は、**下タブと同じだけ**取る。固定の数にしない。

        共通の `.page` は `pb-28`（112px）。下タブは実測 69px だが、
        中身は `pb-[max(0.5rem,env(safe-area-inset-bottom))]` を持って
        いるので、**ホームバーのある端末では 95px まで伸びる**
        （`AppShell.tsx`）。固定の 96px にすると余りが 1px しか無く、
        端末によっては下の行が帯の下へ潜る。

        72px ＋ 安全域 にすると、Chromium（安全域 0）で 3px、実機で
        11px の余り。**共通の 112px より 40px 少ない**ぶんが、
        そのままホームを1画面に収める側へ回る。
      */}
      <main className="page !pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Welcome
          done={doneCount}
          bubble={
            doneCount === 0
              ? "はじめよう！"
              : nextLesson
                ? "つづきから！"
                : "ぜんぶ完了！"
          }
        />

        {/*
          今日やること。あいさつの次はこれ。

          前は、続けた日数・技の数・…と3つはさんでいた。どれも
          「ここまでの自分」の話で、**まだ今日を始めていない人に
          先に見せるもの**ではなかった。開いた人が最初に触るものを、
          最初に置く。
        */}
        {nextLesson && (
          <div className="mt-4">
            <TodayCard
              lesson={nextLesson}
              started={doneCount > 0}
              day={nextLesson.number}
              total={learnable.length}
              onStart={() => {
                /*
                  今日の1本を押した回。**この画面の分子。**

                  ここだけを数える。下から入った回は別の話
                  （探して見つけた人）で、混ぜると「今日やること」が
                  効いたのかどうかが分からなくなる。
                */
                track(EVENTS.continueLessonClicked, { lessonId: nextLesson.id });
                onSelectLesson(nextLesson.id);
              }}
            />
          </div>
        )}

        <div className="mt-4">
          <Record done={doneCount} total={learnable.length} onOpenRecord={onOpenRecord} />
        </div>

        {/*
          2つの数字。**「AI技」とは書かない。**

          同じものを図鑑の中では技として扱うが、毎日開く場所に AI の語を
          並べると、学習アプリではなく AI の道具箱に見える。
        */}
        <div className="mt-3 flex gap-3">
          <StatCard
            icon={IconMedal}
            tone="teal"
            label="身についたこと"
            value={learned?.skills ?? 0}
            onClick={onOpenSkills}
            testId="skill-summary"
          />
          <StatCard
            icon={IconCalendar}
            tone="rose"
            label="今週の学習"
            value={week}
            unit="日"
            onClick={onOpenRecord}
            testId="week-summary"
          />
        </div>

        {/*
          そろそろ見返しどきのもの・飛ばした解説。無ければ何も出ない。
          余白はそれぞれが持つ。ここで囲うと、出すものが無い日にも
          空の余白だけが残る。
        */}
        <ReviewPrompt onSelectLesson={onSelectLesson} />
        <ReviewCards course={course} />

        {/* ── ほかにも見る ── */}
        <section
          className="mt-5 hidden [@media(min-height:800px)]:block"
          aria-labelledby="explore-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="explore-heading" className="text-base font-bold">
              ほかにも見る
            </h2>
            <button
              type="button"
              onClick={onOpenCourse}
              /* 当たり判定を広げる（py と -my を同じだけ。見た目は変わらない） */
              className="-my-2 flex shrink-0 items-center gap-0.5 py-2 text-xs font-bold
                         text-brand transition hover:text-brand-dark"
            >
              すべて見る
              <IconChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/*
            2列で4つまで。**探すのはホームの主役ではない。**

            前は6つを札で折り返して並べていた。字の長さで幅が変わるので
            列がそろわず、いちばん下の節がいちばん賑やかに見えていた。
            4つに絞って形をそろえる——残りは「すべて見る」の先にある。
          */}
          <ul className="mt-3 grid grid-cols-2 gap-2.5" role="list">
            {CATEGORIES.slice(0, 4).map((category, at) => {
              const look = lookOf(category.lessonId);
              return (
                /*
                  3つ目からは、高さのある持ち方だけ。

                  2行目（52px ＋ すきま 10px）は、390×844 でちょうど
                  収まらないぶんに当たる。**列は 2列のまま**なので、
                  出ていても出ていなくても形は崩れない。
                */
                <li
                  key={category.label}
                  className={at < 2 ? undefined : "hidden [@media(min-height:900px)]:block"}
                >
                  <button
                    type="button"
                    onClick={() => onSelectLesson(category.lessonId)}
                    data-testid={`explore-${category.lessonId}`}
                    className="flex min-h-[3.25rem] w-full items-center gap-2.5
                               rounded-card border border-line bg-surface px-3 py-2.5
                               text-sm transition hover:border-brand-line
                               active:scale-[0.98]"
                  >
                    <IconMark
                      icon={look.icon}
                      tone={look.tone === "plain" ? "brand" : look.tone}
                      className="h-[1.125rem] w-[1.125rem]"
                    />
                    <span className="min-w-0 flex-1 text-left">{category.label}</span>
                    <IconChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/*
          道のりの入口。**節にはしない。**

          全体の順番と現在地はコースの画面が持つ。ここに一覧まで出すと、
          同じものを2画面が持つことになる。行1本だけ置いて、見たい人が
          そこから入れるようにする。
        */}
        <button
          type="button"
          onClick={() => onOpenPath(course.id)}
          data-testid="open-path"
          className="mt-3 flex w-full items-center justify-center gap-1 py-2
                     text-xs text-ink-muted transition hover:text-ink"
        >
          {/*
            **コース名は入れない。**ホームで学んでいるコースは1本しか
            無いので、名前を足しても増える情報が無い。むしろ
            「AIスタートコースの道のりを見る」は、下の帯の「コース」と
            名前がぶつかる（部分一致で拾う仕掛けが、こちらを先に掴む）。
          */}
          学習の道のりを見る
          <IconChevronRight className="h-3.5 w-3.5" />
        </button>
      </main>
    </>
  );
}
