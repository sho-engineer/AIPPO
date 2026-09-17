/**
 * 画面の切り替え。
 *
 * タイトル → ホーム → コース一覧 → コースの中身 → レッスン。
 * レッスンの中身は教材データが決めるので、ここは器だけを持つ。
 *
 * コースを3段にしてある。1段目でどのコースかを決め、2段目で
 * 道のり（Day 0 / Day 1 …）を見て、3段目で学ぶ。段を飛ばすと、
 * いまどのコースの何本目にいるのかが画面から消える。
 *
 * いまどこにいるかは端末に覚えておく。
 * 読み込み直したときにトップへ戻されると、入力だけが残って
 * ちぐはぐな状態になる（要件 §6.6）。
 *
 * 下タブはホーム・教材一覧・設定に出す。タイトル画面とレッスン中は
 * 出さない。前者は「押す場所は1つ」が売りで、後者は1画面1タスクの
 * 途中だから、抜け道を並べると気が散る（戻る道は画面の中に用意してある）。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { BottomTabBar, type TabKey } from "./components/AppShell";
import { CoursePage } from "./pages/CoursePage";
import { CourseDetailPage } from "./pages/CourseDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HomePage } from "./pages/HomePage";
import { LessonRunner } from "./pages/LessonRunner";
import { isOverlayHistory } from "./components/course/BackStack";
import { lookupLesson, useCourse, useCourses } from "./course/live";
import { isStartable } from "./course/availability";
import { COMING_SOON_TOAST, Toast } from "./components/Toast";
import { loadPlace, savePlace } from "./app/session";
import { takeReturn } from "./auth/returnTo";
import { useAuth } from "./auth/AuthContext";
import { decideEntry } from "./app/entry";
import { WelcomePage } from "./pages/WelcomePage";
import { DiagnosisIntroPage } from "./pages/DiagnosisIntroPage";
import {
  accountGuideSeen,
  markGuestSeen,
  DIAGNOSIS_FIRST_QUESTION_ID,
  DIAGNOSIS_LESSON_ID,
} from "./course/diagnosisNudge";
import {
  hasAnyDraft,
  hasGuestStarted,
  listCompleted,
  markGuestStarted,
} from "./lib/draft";
import { EVENTS, track } from "./lib/analytics";
import { useSocialResult } from "./auth/useSocialResult";
import { nextScreen, type Screen } from "./app/screens";
import { GoHomeProvider } from "./app/navigation";
import { RecordPage } from "./pages/RecordPage";
import { RecipePage } from "./pages/RecipePage";
import { appliedTipById } from "./course/appliedTips";
import { useCompletedLessons } from "./course/progress";
import { SavedPage } from "./pages/SavedPage";
import { SkillDexPage } from "./pages/SkillDexPage";
import { WorksPage } from "./pages/WorksPage";

/**
 * 下タブを出さない画面。
 *
 * タイトルは「押す場所は1つ」が売り、レッスン中は1画面1タスクの途中
 * （戻る道は画面の中にある）。これ以外では必ず出す——下タブに無い画面
 * でも、帯ごと消すと戻る道まで消える。
 */
const NO_TAB_BAR: Partial<Record<Screen, true>> = {
  // まだ「アプリの中」ではない。行き先を5つ並べても選びようがない
  WELCOME: true,
  DIAGNOSIS_INTRO: true,
  LESSON: true,
};

/** 下タブのどれが光っているか。無い画面ではどれも光らせない。 */
const TAB_OF: Partial<Record<Screen, TabKey>> = {
  HOME: "home",
  COURSE: "course",
  // コースの中身も「コース」の中。下タブの光る場所は動かさない
  COURSE_DETAIL: "course",
  // 学習記録・あとで見るは、下タブから外した（その他とホームから開ける）。
  // どのタブも光らせない——光っていないタブを押させないため
  SKILLS: "skills",
  WORKS: "works",
  SETTINGS: "more",
};

/** 下タブの行き先。 */
const SCREEN_OF_TAB: Partial<Record<TabKey, Screen>> = {
  home: "HOME",
  course: "COURSE",
  skills: "SKILLS",
  works: "WORKS",
  more: "SETTINGS",
};

interface AippoHistoryState {
  aippo: true;
  depth: number;
  screen: Screen;
  lessonId: string;
  courseId: string;
  recipeId: string | null;
  /**
   * レッスンを、この回から始める。
   *
   * ホームの診断の案内から入ったときだけ入る（開始説明を飛ばして
   * 1問目へ）。**1回きり**で、次にどこかへ移った時点で消える
   * ——持ち回すと、あとで普通に開いた診断まで説明を飛ばす。
   *
   * 覚えていた場所（`savePlace`）には入れない。読み込み直したときは
   * 教材の頭から始めればよく、そこまでに進んだぶんは下書きが持っている。
   */
  startStepId: string | null;
}

function isAippoHistoryState(value: unknown): value is AippoHistoryState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<AippoHistoryState>;
  return state.aippo === true && typeof state.screen === "string";
}

/**
 * 1度だけ通る入口か。
 *
 * ここに来る道は `app/entry.ts` が決める。履歴からも、覚えていた場所
 * からも復元しない——復元すると、通り抜けたはずの入口へ戻ってしまう。
 */
function isEntryScreen(screen: Screen): boolean {
  return screen === "WELCOME" || screen === "DIAGNOSIS_INTRO";
}

const BACK_FALLBACK: Record<Screen, Screen> = {
  WELCOME: "WELCOME",
  // 案内から戻る先はホーム。ようこそへ返すと、始め方をもう一度選ばせる
  DIAGNOSIS_INTRO: "HOME",
  HOME: "HOME",
  COURSE: "HOME",
  COURSE_DETAIL: "COURSE",
  LESSON: "COURSE_DETAIL",
  RECIPE: "COURSE_DETAIL",
  RECORD: "HOME",
  SKILLS: "HOME",
  WORKS: "HOME",
  SAVED: "HOME",
  SETTINGS: "HOME",
};

export function App() {
  // 教材はサーバーから届いたら差し替わる。届くまでは同梱の分で動く
  const course = useCourse();
  const auth = useAuth();
  const [initial] = useState(() => {
    const browser = window.history.state;
    /*
      同じ回の中で進んだ・戻った。**入口の判断はやり直さない。**

      画面の中を動いているだけなので、そこで「初めての人か」を
      決め直すと、押した先が別の画面になる。

      ただし**入口の2枚だけは別**。あの2枚は1度だけ通るところなので、
      履歴に残った状態から復元してはいけない。

      実際に踏んだ穴
      --------------
      入口に居るあいだも、履歴にはその画面の状態が入る。読み込み直すと
      `window.history.state` はそのまま残っているので、**決め直さずに
      ようこそを描き続ける**——端末には「ゲストで始めた」印があるのに、
      何度読み込んでもようこそから出られない状態になっていた
      （検査でつかまえた。storage を消したタブを読み込み直すと必ず出る）。
    */
    if (isAippoHistoryState(browser) && !isEntryScreen(browser.screen)) {
      return { ...browser, decided: true };
    }
    /*
      外部サービス（Google）から戻ってきた回。

      押した瞬間に控えた場所を、いつもの「最後に見ていた画面」より
      先に見る。別のタブで AIPPO を開いていると、そちらが place を
      上書きするので、押した本人が違う画面へ着いてしまう
      （auth/returnTo.ts）。

      読んだら消えるので、次に開いたときは いつもどおり place に従う。
    */
    const returning = takeReturn();
    /*
      戻れた回を数える。ここまで来て初めて「登録して続きができた」と
      言える。押した回（auth_google_clicked）と対にすると、
      外へ出たまま帰ってこなかった人が何人かが出る。
    */
    if (returning) track(EVENTS.returnedToLesson, { lessonId: returning.lessonId });
    const restored = returning ?? loadPlace();
    return {
      aippo: true as const,
      depth: 0,
      /*
        外から帰ってきた回（Google の認証など）は、控えた場所がそのまま
        行き先になる。**入口の判断を挟まない**——挟むと、押す前に居た
        画面ではなく「初めての人向けの1枚」へ着く。有効な行き先を持って
        帰ってきた人を、一律でホームへ流さないための道。
      */
      screen: restored?.screen ?? "HOME",
      lessonId: restored?.lessonId ?? course.lessons[0].id,
      courseId: restored?.courseId ?? course.id,
      recipeId: null,
      startStepId: null,
      decided: Boolean(returning),
    };
  });
  /*
    どの画面から始めるかが、決まったか。

    決まるまでは**何も描かない**（`decided` が false）。ここで仮に
    ホームやようこそを出すと、決まった瞬間に別の画面へ入れ替わる
    ——一瞬だけ知らない画面が見える。決め方は `app/entry.ts`。
  */
  const [decided, setDecided] = useState(initial.decided);
  const [screen, setScreen] = useState<Screen>(initial.screen);
  const [lessonId, setLessonId] = useState<string>(initial.lessonId);
  /*
    いま中を見ているコース。

    覚えておく。読み込み直したときに一覧へ戻されると、
    せっかく選んだところからやり直しになる。
  */
  const [detailCourseId, setDetailCourseId] = useState<string>(
    initial.courseId,
  );
  /*
    いま開いている「こんな使い方もできます」。

    覚え直さない（savePlace に入れない）。読み込み直したときに
    説明だけが出ていると、どのレッスンから来たのかが分からなくなる。
  */
  const [recipeId, setRecipeId] = useState<string | null>(initial.recipeId);
  /*
    レッスンを途中の回から始めるための、1回きりの指定。
    いまの用は1つ——ホームの診断の案内から、開始説明を飛ばして1問目へ。
  */
  const [startStepId, setStartStepId] = useState<string | null>(
    initial.startStepId,
  );
  /*
    画面の下に少しだけ出る一言。いまの用は1つ——準備中の教材を
    押した人への返事（`openLesson`）。
  */
  const [toast, setToast] = useState<string | null>(null);
  const courses = useCourses();
  const completed = useCompletedLessons();

  /*
    どの画面から始めるか。**揃ってから決める。**

    条件は `app/entry.ts` が持つ。ここでやるのは材料を渡すことと、
    決まった行き先を履歴の根に据えることだけ。
  */
  useEffect(() => {
    if (decided) return;
    const entry = decideEntry({
      authLoading: auth.loading,
      signedIn: Boolean(auth.user),
      serverHistory: auth.progress
        ? auth.progress.completed + auth.progress.in_progress
        : null,
      guestStarted: hasGuestStarted(),
      guideSeen: accountGuideSeen(auth.user),
      deviceHistory: listCompleted().length > 0 || hasAnyDraft(),
      saved: loadPlace()?.screen ?? null,
    });
    if (entry.kind === "pending") return;
    setDecided(true);
    setScreen(entry.screen);
  }, [decided, auth.loading, auth.user, auth.progress]);

  /*
    ログアウトしたら、ようこそへ。

    `decided` を下ろすだけでよい——次の描画で入口の判断がやり直され、
    端末の控えは `signOut` が落としている（`AuthContext`）ので、
    行き先はようこそになる。ここで直に `setScreen("WELCOME")` と
    書かないのは、**判断の場所を2つにしない**ため。

    期限切れでログイン状態が落ちたときも同じ道を通る。落ちた先は
    ようこそで、そこから入り直せる（行ったり来たりにはならない）。
  */
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (wasSignedIn.current && !auth.user) setDecided(false);
    wasSignedIn.current = Boolean(auth.user);
  }, [auth.user]);

  useEffect(() => {
    /*
      入口の2枚は覚えない。1度だけ通るところなので、覚えて戻すと
      毎回同じ入口をくぐり直すことになる。決まる前も書かない
      ——仮の値で上書きすると、覚えていた場所が消える。
    */
    if (!decided) return;
    if (screen === "WELCOME" || screen === "DIAGNOSIS_INTRO") return;
    savePlace({ screen, lessonId, courseId: detailCourseId });
  }, [decided, screen, lessonId, detailCourseId]);

  const navigate = useCallback(
    (
      next: Screen,
      values: {
        lessonId?: string;
        courseId?: string;
        recipeId?: string | null;
        startStepId?: string;
      } = {},
      options: { replace?: boolean } = {},
    ) => {
      const state: AippoHistoryState = {
        aippo: true,
        depth: isAippoHistoryState(window.history.state)
          ? window.history.state.depth + (options.replace ? 0 : 1)
          : options.replace
            ? 0
            : 1,
        screen: next,
        lessonId: values.lessonId ?? lessonId,
        courseId: values.courseId ?? detailCourseId,
        recipeId: values.recipeId === undefined ? recipeId : values.recipeId,
        /*
          持ち回さない。**渡された回だけ効く。**

          言われなければ null。ここを「前の値を引き継ぐ」形にすると、
          診断の案内から入ったあと、別のレッスンを開いてもその id が
          付いて回る——知らない回から始まるか、無視されるかのどちらかで、
          どちらも読めない。
        */
        startStepId: values.startStepId ?? null,
      };
      /*
        `replace` は、いまの1つを**置き換える**。

        入口の2枚（ようこそ・診断の案内）から出るときに使う。あれは
        1度だけ通るところなので、履歴に残すと「戻る」でそこへ帰れて
        しまう——案内を閉じた人が、戻るを押すたびに案内を読み直す。
      */
      if (options.replace) window.history.replaceState(state, "");
      else window.history.pushState(state, "");
      setLessonId(state.lessonId);
      setDetailCourseId(state.courseId);
      setRecipeId(state.recipeId);
      setStartStepId(state.startStepId);
      setScreen(state.screen);
    },
    [detailCourseId, lessonId, recipeId],
  );

  const goBack = useCallback(
    (fallback: Screen) => {
      const state = window.history.state;
      if (isAippoHistoryState(state) && state.depth > 0) {
        /*
          積み場が持っている1つも、一緒に戻す。

          一枚（`MoreSheet`）とレッスンの中の回は、開いているあいだ
          履歴を1つ持つ（`components/course/BackStack.tsx`）。それが
          載ったまま1つだけ戻すと、**画面から出るための「戻る」が
          そちらに食べられる**——レッスンの「×」を押しても、外へ
          出ずに1回ぶん前の回へ戻るだけになる（実測で出た）。

          積み場が持つ数はいつも 0 か 1 なので、載っていれば2つ戻す。
        */
        window.history.go(isOverlayHistory(state) ? -2 : -1);
        return;
      }
      navigate(fallback);
    },
    [navigate],
  );

  /*
    履歴の根を1つだけ作る。**行き先が決まってから。**

    決まる前に作ると、根が仮の画面（まだ決めていないホーム）になり、
    そこへ「戻る」で着いてしまう。`decided` が立った最初の1回だけ走る。

    根より下にいる画面（ホーム以外）は、戻り先を1つ敷いてから自分を
    積む。そうしないと、1回目の「戻る」でアプリの外へ出る。
  */
  const rooted = useRef(false);
  useEffect(() => {
    if (!decided || rooted.current) return;
    if (isAippoHistoryState(window.history.state)) {
      rooted.current = true;
      return;
    }
    rooted.current = true;

    const current: AippoHistoryState = {
      aippo: true,
      depth: 0,
      screen,
      lessonId,
      courseId: detailCourseId,
      recipeId,
      startStepId,
    };
    /*
      入口の2枚は、それ自体が根。戻り先を敷かない——ようこその下に
      ホームを敷くと、**始め方を選ぶ前のホーム**へ戻れてしまう。
    */
    if (BACK_FALLBACK[screen] === screen || screen === "DIAGNOSIS_INTRO") {
      window.history.replaceState(current, "");
    } else {
      window.history.replaceState(
        { ...current, screen: BACK_FALLBACK[screen] },
        "",
      );
      window.history.pushState({ ...current, depth: 1 }, "");
    }
    // 根を敷くのは、決まった直後の1回きり
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decided]);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (!isAippoHistoryState(event.state)) return;
      setScreen(event.state.screen);
      setLessonId(event.state.lessonId);
      setDetailCourseId(event.state.courseId);
      setRecipeId(event.state.recipeId);
      setStartStepId(event.state.startStepId ?? null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openCourse = (id: string, from: Screen) => {
    navigate(nextScreen(from, "OPEN_COURSE_DETAIL"), { courseId: id });
  };

  const openLesson = (
    id: string,
    from: Screen,
    startAt?: string,
    options: { replace?: boolean } = {},
  ) => {
    /*
      準備中の教材は開かない。**判定はここ1か所。**

      教材の行・ホームの1本・目印の一覧・診断の結果——入口はいくつも
      あるが、開く道は全部この関数を通る。画面ごとに書き写すと、
      必ずどれかが古くなって、押せるボタンが1つ残る。

      覚えていた場所からの復元（session.ts）や、古いタブに残った
      押しかけの状態からでも入れてしまうので、画面側で押せなく
      してあってもここで止める。
      最後の砦はサーバー（apps/catalog/access.py）。

      **黙って無視しない。** 何も起きないと、壊れているのか押し方が
      悪いのかが分からないまま終わる。準備中だと一言返す。
    */
    const lesson = lookupLesson(id);
    if (lesson && !isStartable(lesson)) {
      setToast(COMING_SOON_TOAST);
      return;
    }

    /*
      そのレッスンが属するコースも覚えておく。
      レッスンから1つ戻る先は、そのコースの中身になる。
      ホームから直接開いた1本でも、戻る先が中途半端にならない。
    */
    const owner = courses.find((entry) =>
      entry.lessons.some((item) => item.id === id),
    );
    navigate(
      nextScreen(from, "SELECT_LESSON"),
      { lessonId: id, courseId: owner?.id, startStepId: startAt },
      options,
    );
  };

  const tab = TAB_OF[screen];

  /*
    外部サービスから戻ってきたとき。

    サーバーは短い名前だけを URL へ載せる。文はこちらで持つ。
    読んだら URL から消すので、読み込み直しても二度は出ない。
  */
  const social = useSocialResult();

  /**
   * 案内を「見た」ことにする。登録した人はサーバー、ゲストは端末。
   *
   * 出した時点で回す。閉じたときに回すと、読んだまま別の画面へ行った
   * 人や、読み込み直した人にもう一度出る。
   */
  const markGuideSeen = useCallback(() => {
    if (auth.user) auth.markDiagnosisNudgeSeen();
    else markGuestSeen();
  }, [auth]);

  const body = (() => {
    // 決まるまでは何も描かない。一瞬だけ別の画面が見えるのを避ける
    if (!decided) return null;

    switch (screen) {
      case "WELCOME":
        return (
          <WelcomePage
            onStartGuest={() => {
              /*
                ゲストで始めた、という印だけを立てる。**ログイン済みには
                しない**——この印は「ようこそをもう一度出さない」ため
                だけのもので、登録した人かどうかは `me` が決める。
              */
              markGuestStarted();
              /*
                行き先は決め直す。案内を見ていない初回だけ案内へ、
                それ以外はホームへ——判断は `app/entry.ts` の1か所。
              */
              setDecided(false);
            }}
            /*
              登録・ログインが**済んだ**とき。押した時点ではない。
              ここでも決め直す。登録した初日なら案内へ、続きがある人は
              覚えていた場所へ戻る。
            */
            onAuthenticated={() => setDecided(false)}
          />
        );

      case "DIAGNOSIS_INTRO":
        return (
          <DiagnosisIntroPage
            onSeen={markGuideSeen}
            onStart={() => {
              /*
                案内を、ホームに置き換えてから診断へ入る。

                案内は1度きりの画面なので、履歴に残すと**診断を途中で
                閉じた人が案内へ戻る**（そこで「あとで」をもう一度
                押すことになる）。置き換えておけば、閉じた先はホーム。
              */
              navigate("HOME", {}, { replace: true });
              openLesson(
                DIAGNOSIS_LESSON_ID,
                "DIAGNOSIS_INTRO",
                DIAGNOSIS_FIRST_QUESTION_ID,
              );
            }}
            /* 「あとで」も置き換える。戻るで案内へ帰さない */
            onSkip={() =>
              navigate(nextScreen("DIAGNOSIS_INTRO", "BACK_TO_HOME"), {}, {
                replace: true,
              })
            }
          />
        );

      case "HOME":
        return (
          <HomePage
            onSelectLesson={(id) => openLesson(id, "HOME")}
            onOpenRecord={() => navigate(nextScreen("HOME", "OPEN_RECORD"))}
            onOpenSkills={() => navigate(nextScreen("HOME", "OPEN_SKILLS"))}
            onOpenAccount={() => navigate(nextScreen("HOME", "OPEN_SETTINGS"))}
          />
        );

      case "COURSE":
        return (
          <CoursePage
            onOpenCourse={(id) => openCourse(id, "COURSE")}
            onSelectLesson={(id) => openLesson(id, "COURSE")}
          />
        );

      case "COURSE_DETAIL": {
        /*
          知らない id が入っても落とさない。いま学ぶコースへ倒す
          （覚えていた場所が古い、サーバー側で消えた、など）。
        */
        const opened =
          courses.find((entry) => entry.id === detailCourseId) ?? course;

        return (
          <CourseDetailPage
            course={opened}
            onSelectLesson={(id) => openLesson(id, "COURSE_DETAIL")}
            onBack={() => goBack("COURSE")}
            // 「作れるようになるもの」から、やり方の説明へ
            onOpenRecipe={(recipeId) => {
              navigate(nextScreen("COURSE_DETAIL", "OPEN_RECIPE"), { recipeId });
            }}
          />
        );
      }

      case "RECIPE": {
        const tip = recipeId ? appliedTipById(recipeId) : null;

        /*
          知らない id が入っても落とさない。ホームへ倒す
          （覚えていた場所が古い、教材の入れ替えで消えた、など）。
        */
        if (!tip) {
          navigate("HOME", { recipeId: null });
          return null;
        }

        return (
          <RecipePage
            tip={tip}
            lessonTitle={(id) => lookupLesson(id)?.title ?? null}
            completedIds={completed}
            onSelectLesson={(id) => openLesson(id, "RECIPE")}
            onBack={() => goBack("HOME")}
          />
        );
      }

      case "WORKS":
        return (
          <WorksPage
            onSelectLesson={(id) => openLesson(id, "WORKS")}
            onOpenCourse={() => navigate(nextScreen("WORKS", "OPEN_COURSE"))}
          />
        );

      case "SKILLS":
        return (
          <SkillDexPage
            onSelectLesson={(id) => openLesson(id, "SKILLS")}
            onOpenCourse={() => navigate(nextScreen("SKILLS", "OPEN_COURSE"))}
          />
        );

      case "RECORD":
        return (
          <RecordPage
            onSelectLesson={(id) => openLesson(id, "RECORD")}
            onOpenCourse={() => navigate(nextScreen("RECORD", "OPEN_COURSE"))}
            onOpenSkills={() => navigate(nextScreen("RECORD", "OPEN_SKILLS"))}
            onOpenWorks={() => navigate(nextScreen("RECORD", "OPEN_WORKS"))}
          />
        );

      case "SAVED":
        return (
          <SavedPage
            onSelectLesson={(id) => openLesson(id, "SAVED")}
            onOpenCourse={() => navigate(nextScreen("SAVED", "OPEN_COURSE"))}
            onOpenAccount={() => navigate(nextScreen("SAVED", "OPEN_SETTINGS"))}
          />
        );

      case "SETTINGS":
        return (
          <SettingsPage
            onBack={() => goBack("HOME")}
            onOpenRecord={() => navigate(nextScreen("SETTINGS", "OPEN_RECORD"))}
            onOpenSaved={() => navigate(nextScreen("SETTINGS", "OPEN_SAVED"))}
          />
        );

      case "LESSON": {
        // 知らない id が入っても画面を落とさない。先頭のレッスンへ倒す
        const lesson = lookupLesson(lessonId) ?? course.lessons[0];

        /*
          覚えていた場所が、あとから近日公開に変わっていることがある
          （管理画面で戻した、リリース範囲を絞った）。
          そのときはホームへ返す。開けない画面で止めない。
        */
        if (!isStartable(lesson)) {
          return (
            <HomePage
              onSelectLesson={(id) => openLesson(id, "HOME")}
              onOpenRecord={() => navigate("RECORD")}
              onOpenSkills={() => navigate("SKILLS")}
              onOpenAccount={() => navigate("SETTINGS")}
            />
          );
        }

        return (
          <LessonRunner
            key={lesson.id}
            lesson={lesson}
            /*
              案内から入った回だけ、始める場所が指定されている。
              下書きが残っている人には効かない（続きのほうが強い）。
            */
            startAtStepId={startStepId ?? undefined}
            /*
              帯の「×」の行き先。そのレッスンが入っているコースの中身。
            */
            onExit={() => goBack("COURSE_DETAIL")}
            /*
              Day 完了の「ホームに戻る」。来た道ではなく、
              **書いてあるとおりホーム**へ渡す。

              1本終えた直後に見たいのは、その1本が数に反映された
              ところ。それを出しているのはホームのほう
              （`components/course/DayCompletePage.tsx`）。
            */
            onOpenCourse={() => navigate("HOME")}
            // 完了画面から、そのまま次のレッスンへ入れるようにする
            onSelectLesson={(id) => openLesson(id, "LESSON")}
            // コース完走の締めくくりから、コース一覧へ
            onOpenCourseCatalog={() => navigate(nextScreen("LESSON", "OPEN_COURSE"))}
            // 「やり方をくわしく見る」から、使い方の説明へ
            onOpenRecipe={(tipId) => {
              navigate(nextScreen("LESSON", "OPEN_RECIPE"), { recipeId: tipId });
            }}
          />
        );
      }
    }
  })();

  /*
    帯のロゴを押したらホームへ。行き先を持っているのはここだけなので、
    ここから配る（理由は app/navigation.tsx）。
  */
  const goHome = useCallback(() => navigate("HOME"), [navigate]);

  return (
    <GoHomeProvider goHome={goHome}>
      {social.result && (
        <div className="mx-auto max-w-page px-5 pt-4">
          <p
            role="status"
            data-testid="social-result"
            className={`animate-fade-up rounded-card px-4 py-3 text-sm leading-6 ${
              social.result.kind === "error"
                ? "bg-caution-soft text-caution"
                : "bg-brand-soft text-brand-dark"
            }`}
          >
            {social.result.message}
          </p>
        </div>
      )}
      {body}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      {!NO_TAB_BAR[screen] && (
        <BottomTabBar
          current={tab}
          onSelect={(key) => navigate(SCREEN_OF_TAB[key] ?? screen)}
        />
      )}
    </GoHomeProvider>
  );
}
