/**
 * ホーム。
 *
 * ここは「ダッシュボード」ではない。**今日のつづきをやりに戻ってくる
 * 場所**にする。開いた瞬間に見えるのは、おかえりの一言と、今日の1本と、
 * それを始めるボタン。それ以外は下タブの先へ置く。
 *
 * 置くものは4つだけ
 * -----------------
 *   1. 帯（ロゴとアカウント）
 *   2. おかえりなさい ＋ 小さなポー
 *   3. 今日の1本 ← **この画面の主役**
 *   4. これまでの記録（3つの数を、1行に）
 *
 * 減らした理由
 * ------------
 * 前はこの下に「そろそろもう一度」「飛ばした解説」「ほかにも見る」
 * 「学習の道のり」が積まれていた。どれも要るものだが、**積むと画面が
 * 送れるようになる**——送らないと見えない場所に置いたものは、置いて
 * いないのとほとんど変わらないうえ、主役（今日の1本）が画面の上へ
 * 追いやられる。実測でも 390×844 で下が切れていた。
 *
 * だから、それぞれの持ち主の画面へ返した。
 *
 *     そろそろもう一度・飛ばした解説 → マイ学び（`SkillDexPage`）
 *     学習の道のり                   → コース（`CoursePage`）
 *     ほかにも見る                   → コース（一覧そのもの）
 *
 * 消したのではなく、移した。行き先は下タブにあり、押せば同じものが
 * 出る（`e2e/homeMoved.spec.ts` が、移した先で使えることを見張る）。
 *
 * 面で囲うのは、今日の1本ひとつだけ
 * --------------------------------
 * 白い面が2つ3つと浮くと、どれが本題かが分からなくなる。記録の3つは
 * 数を並べるだけの器なので、薄い枠1つに収めて縦積みにしない。
 *
 * ホームに置かないもの
 * --------------------
 * - **AI活用診断** … 受けるのは1回。毎日開く場所の主役にはしない。
 *   まだの人にだけ、細い1行の入口を置く
 * - **おすすめコース** … 「次に何をするか」は今日の1本が答える
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
 * 上から下まで、**送らずに全部見える**ことを保つ
 * （`e2e/homeFits.spec.ts`。320×568 から 430×932 まで）。
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

import { AppHeader } from "../components/AppShell";
import { DIAGNOSIS_LESSON_ID } from "../course/diagnosisNudge";
import { PoFace } from "../po/PoAvatar";
import { PrimaryButton } from "../components/aippo/PrimaryButton";
import {
  IconBookmark,
  IconCalendar,
  IconChevronRight,
  IconClock,
} from "../components/Icons";
import { useCourse } from "../course/live";
import { startableLessons } from "../course/availability";
import { LessonThumbnail } from "../components/lessons/LessonThumbnail";
import { lessonThumbnail } from "../course/lessonThumbnail";
import { recommendationsForHome } from "../course/recommend";
import { useCompletedLessons, useXpSummary } from "../course/progress";
import { daysThisWeek, touchStreak } from "../lib/draft";
import { EVENTS, track } from "../lib/analytics";
import type { Lesson } from "../course/types";

export interface HomePageProps {
  onSelectLesson: (lessonId: string) => void;
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
        {/*
          低い持ち方では出さない。

          320×568 では、この1行（24px）がそのままホームのあふれ分に
          なる。言っているのは励ましだけで、消えても行き止まりには
          ならない——迎える一言（h1）のほうは残る。
        */}
        <p className="mt-1 hidden text-sm leading-6 text-ink-muted [@media(min-height:600px)]:block">
          今日も少しずつ。
        </p>
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
        {/*
          狭い画面では吹き出しを出さない。

          320px の実測で、右の塊（吹き出し 86 ＋ すきま 4 ＋ ポー 78 ＝
          168px）を引くと左に 112px しか残らず、**「はじめまして」が
          3行に割れていた**（96px。ふつうは32px）。そのぶんがそのまま
          ホームのあふれになる。

          ポーは残す。ひとこと言う役は消えるが、居ること自体が
          この画面の顔。
        */}
        <p
          data-testid="po-hero-message"
          aria-live="polite"
          className="hidden max-w-[5.5rem] rounded-card bg-surface px-2.5 py-1.5
                     text-[0.6875rem] leading-4 shadow-card min-[360px]:block"
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
      /*
        いちばん低い持ち方（320×568）だけ、内側の余白を 2px 詰める。
        ここと下のボタンの上、そして診断の1行の上で合わせて 12px
        ——それが 568px に収めるための最後のぶん（実測）。
      */
      className="rounded-panel border border-line bg-surface p-3
                 shadow-card [@media(min-height:600px)]:p-3.5"
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
        className="mt-2 w-full [@media(min-height:600px)]:mt-3"
      >
        {started ? "つづきをはじめる" : "はじめる"}
      </PrimaryButton>
    </section>
  );
}

// ------------------------------------------------------- これまでの記録

/**
 * 3つの数を、1行に。
 *
 * なぜ1行か
 * ----------
 * 前は「進み具合の帯」と「◯/◯ レッスン完了」と、数字の札2枚が
 * 縦に3段だった。同じ「ここまでの自分」の話が3回出てくるうえ、
 * 合わせて 150px を使っていた——そのぶん主役（今日の1本）が上へ
 * 追いやられ、下が画面から出ていた。
 *
 * 数はどれも1桁か2桁なので、横に3つ並べても読める。枠は1つ、
 * 区切りは細い縦線だけにする。
 *
 * 押せる
 * ------
 * 3つとも、その中身の画面へ行ける。数だけ見せて終わりにすると、
 * 「5」が何のことか確かめる道が無くなる。
 */
function RecordRow({
  done,
  skills,
  week,
  onOpenRecord,
  onOpenSkills,
}: {
  done: number;
  skills: number;
  week: number;
  onOpenRecord: () => void;
  onOpenSkills: () => void;
}) {
  const cells = [
    { label: "レッスン完了", value: done, unit: "", onClick: onOpenRecord, testId: "stat-done" },
    { label: "身についたこと", value: skills, unit: "", onClick: onOpenSkills, testId: "stat-skills" },
    { label: "今週", value: week, unit: "日", onClick: onOpenRecord, testId: "stat-week" },
  ];

  return (
    <section
      aria-labelledby="record-heading"
      data-testid="progress-summary"
      className="flex items-stretch rounded-panel border border-line bg-surface"
    >
      <h2 id="record-heading" className="sr-only">
        これまでの記録
      </h2>
      {cells.map((cell, at) => (
        <button
          key={cell.label}
          type="button"
          onClick={cell.onClick}
          data-testid={cell.testId}
          /*
            `min-w-0` が要る。中の名前は折り返さないので、これが無いと
            flex の自動最小幅がその全長で止まり、320px で横にあふれる。

            当たり判定は 44px 以上（`py-2.5` ＋ 2行ぶん）。
          */
          className={`flex min-w-0 flex-1 flex-col items-center justify-center
                      px-1 py-2.5 text-center transition hover:bg-brand-soft/40
                      active:scale-[0.98] ${
                        at > 0 ? "border-l border-line" : ""
                      }`}
        >
          <span className="block w-full truncate text-[0.6875rem] leading-4 text-ink-muted">
            {cell.label}
          </span>
          <span className="mt-0.5 block text-xl font-bold leading-7 tabular-nums">
            {cell.value}
            {cell.unit && <span className="ml-0.5 text-xs font-normal">{cell.unit}</span>}
          </span>
        </button>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------ 本体

export function HomePage({
  onSelectLesson,
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

  /*
    診断を受けていない人には、常設の入口を残す。

    案内を「あとで」で閉じた人が、あとから自分で始められるように。
    受けた人には出さない——受けるのは1回で、毎日ひらく場所に
    済んだものを置き続ける理由が無い。
  */
  const showDiagnosisLink = !completed.includes(DIAGNOSIS_LESSON_ID);

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
        {!nextLesson && doneCount > 0 && (
          /*
            始められる教材を全部終えた人。**空けない。**

            前はここが `nextLesson && ...` だけで、次が無い人には
            節ごと消えていた。第1リリースでは Day1 を終えた時点で
            そうなる——終えた直後のホームが、いちばん何も無い画面に
            なる。次が来ることだけは言う。
          */
          <div
            className="mt-4 rounded-panel border border-brand-line bg-surface p-4
                       shadow-card"
            data-testid="next-coming-soon"
          >
            <p className="text-sm font-bold leading-6 text-brand-dark">
              次のLessonは準備中です
            </p>
            <p className="mt-1 text-[0.8125rem] leading-5 text-ink-muted">
              新しいLessonを順次公開予定です。
            </p>
          </div>
        )}

        {nextLesson && (
          <div className="mt-3 [@media(min-height:600px)]:mt-4">
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

        <div className="mt-3 [@media(min-height:600px)]:mt-4">
          <RecordRow
            done={doneCount}
            skills={learned?.skills ?? 0}
            week={week}
            onOpenRecord={onOpenRecord}
            onOpenSkills={onOpenSkills}
          />
        </div>

        {/*
          診断の入口。**細い1行だけ。**

          受けた人には出さない（受けるのは1回）。まだの人には、
          飛ばしたあとで思い出せる場所が要る——始めた直後の案内
          （`DiagnosisIntroPage`）を「あとで」で閉じた人の、次の入口。

          面は立てない。ホームで面を立ててよいのは今日の1本だけと
          決めてある（このファイルの冒頭）。
        */}
        {showDiagnosisLink && (
          <button
            type="button"
            onClick={() => onSelectLesson(DIAGNOSIS_LESSON_ID)}
            data-testid="open-diagnosis"
            className="mt-1 flex min-h-[2.75rem] w-full items-center justify-center gap-1
                       py-2 text-xs font-bold text-brand transition
                       hover:text-brand-dark [@media(min-height:600px)]:mt-2"
          >
            AI活用診断をやってみる
            <IconChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </main>

    </>
  );
}
