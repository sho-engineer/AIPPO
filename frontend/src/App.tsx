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

import { useCallback, useEffect, useState } from "react";

import { BottomTabBar, type TabKey } from "./components/AppShell";
import { CoursePage } from "./pages/CoursePage";
import { CourseDetailPage } from "./pages/CourseDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HomePage } from "./pages/HomePage";
import { LessonRunner } from "./pages/LessonRunner";
import { TopPage } from "./pages/TopPage";
import { lookupLesson, useCourse, useCourses } from "./course/live";
import { isStartable } from "./course/availability";
import { loadPlace, savePlace } from "./app/session";
import { takeReturn } from "./auth/returnTo";
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
const NO_TAB_BAR: Partial<Record<Screen, true>> = { TOP: true, LESSON: true };

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
}

function isAippoHistoryState(value: unknown): value is AippoHistoryState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Partial<AippoHistoryState>;
  return state.aippo === true && typeof state.screen === "string";
}

const BACK_FALLBACK: Record<Screen, Screen> = {
  TOP: "TOP",
  HOME: "TOP",
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
  const [initial] = useState(() => {
    const browser = window.history.state;
    if (isAippoHistoryState(browser)) return browser;
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
      screen: restored?.screen ?? "TOP",
      lessonId: restored?.lessonId ?? course.lessons[0].id,
      courseId: restored?.courseId ?? course.id,
      recipeId: null,
    };
  });
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
  const courses = useCourses();
  const completed = useCompletedLessons();

  useEffect(
    () => savePlace({ screen, lessonId, courseId: detailCourseId }),
    [screen, lessonId, detailCourseId],
  );

  const navigate = useCallback(
    (
      next: Screen,
      values: {
        lessonId?: string;
        courseId?: string;
        recipeId?: string | null;
      } = {},
    ) => {
      const state: AippoHistoryState = {
        aippo: true,
        depth: isAippoHistoryState(window.history.state)
          ? window.history.state.depth + 1
          : 1,
        screen: next,
        lessonId: values.lessonId ?? lessonId,
        courseId: values.courseId ?? detailCourseId,
        recipeId: values.recipeId === undefined ? recipeId : values.recipeId,
      };
      window.history.pushState(state, "");
      setLessonId(state.lessonId);
      setDetailCourseId(state.courseId);
      setRecipeId(state.recipeId);
      setScreen(state.screen);
    },
    [detailCourseId, lessonId, recipeId],
  );

  const goBack = useCallback(
    (fallback: Screen) => {
      const state = window.history.state;
      if (isAippoHistoryState(state) && state.depth > 0) {
        window.history.back();
        return;
      }
      navigate(fallback);
    },
    [navigate],
  );

  useEffect(() => {
    const current: AippoHistoryState = {
      aippo: true,
      depth: 0,
      screen,
      lessonId,
      courseId: detailCourseId,
      recipeId,
    };
    if (!isAippoHistoryState(window.history.state)) {
      if (screen === "TOP") {
        window.history.replaceState(current, "");
      } else {
        window.history.replaceState(
          { ...current, screen: BACK_FALLBACK[screen] },
          "",
        );
        window.history.pushState({ ...current, depth: 1 }, "");
      }
    }

    const onPopState = (event: PopStateEvent) => {
      if (!isAippoHistoryState(event.state)) return;
      setScreen(event.state.screen);
      setLessonId(event.state.lessonId);
      setDetailCourseId(event.state.courseId);
      setRecipeId(event.state.recipeId);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // The first render establishes the browser-history root exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCourse = (id: string, from: Screen) => {
    navigate(nextScreen(from, "OPEN_COURSE_DETAIL"), { courseId: id });
  };

  const openLesson = (id: string, from: Screen) => {
    /*
      近日公開の教材は開かない。

      画面側でボタンを押せなくしてあるが、ここでも止める。
      覚えていた場所からの復元（session.ts）や、古いタブに残った
      押しかけの状態からでも入れてしまうため。
      最後の砦はサーバー（apps/catalog/access.py）。
    */
    const lesson = lookupLesson(id);
    if (lesson && !isStartable(lesson)) return;

    /*
      そのレッスンが属するコースも覚えておく。
      レッスンから1つ戻る先は、そのコースの中身になる。
      ホームから直接開いた1本でも、戻る先が中途半端にならない。
    */
    const owner = courses.find((entry) =>
      entry.lessons.some((item) => item.id === id),
    );
    navigate(nextScreen(from, "SELECT_LESSON"), {
      lessonId: id,
      courseId: owner?.id,
    });
  };

  const tab = TAB_OF[screen];

  /*
    外部サービスから戻ってきたとき。

    サーバーは短い名前だけを URL へ載せる。文はこちらで持つ。
    読んだら URL から消すので、読み込み直しても二度は出ない。
  */
  const social = useSocialResult();

  const body = (() => {
    switch (screen) {
      case "TOP":
        return <TopPage onStart={() => navigate(nextScreen("TOP", "START"))} />;

      case "HOME":
        return (
          <HomePage
            onSelectLesson={(id) => openLesson(id, "HOME")}
            onOpenCourse={() => navigate(nextScreen("HOME", "OPEN_COURSE"))}
            // 「道のりを見る」から、いま学んでいるコースの中身へ直行する
            onOpenPath={(id) => openCourse(id, "HOME")}
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
              onOpenCourse={() => navigate("COURSE")}
              onOpenPath={(id) => openCourse(id, "HOME")}
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
            onFinish={() => navigate(nextScreen("LESSON", "BACK_TO_HOME"))}
            /* 1つ戻る先は、そのレッスンが入っているコースの中身 */
            onExit={() => goBack("COURSE_DETAIL")}
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
      {!NO_TAB_BAR[screen] && (
        <BottomTabBar
          current={tab}
          onSelect={(key) => navigate(SCREEN_OF_TAB[key] ?? screen)}
        />
      )}
    </GoHomeProvider>
  );
}
