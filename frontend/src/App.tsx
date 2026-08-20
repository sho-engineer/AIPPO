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

import { useEffect, useState } from "react";

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
import { useSocialResult } from "./auth/useSocialResult";
import { nextScreen, type Screen } from "./app/screens";
import { RecordPage } from "./pages/RecordPage";
import { SavedPage } from "./pages/SavedPage";

/** 下タブのどれが光っているか。 */
const TAB_OF: Partial<Record<Screen, TabKey>> = {
  HOME: "home",
  COURSE: "course",
  // コースの中身も「コース」の中。下タブの光る場所は動かさない
  COURSE_DETAIL: "course",
  RECORD: "record",
  SAVED: "saved",
  SETTINGS: "more",
};

/** 下タブの行き先。 */
const SCREEN_OF_TAB: Partial<Record<TabKey, Screen>> = {
  home: "HOME",
  course: "COURSE",
  record: "RECORD",
  saved: "SAVED",
  more: "SETTINGS",
};

export function App() {
  // 教材はサーバーから届いたら差し替わる。届くまでは同梱の分で動く
  const course = useCourse();
  const restored = loadPlace();
  const [screen, setScreen] = useState<Screen>(restored?.screen ?? "TOP");
  const [lessonId, setLessonId] = useState<string>(
    restored?.lessonId ?? course.lessons[0].id,
  );
  /*
    いま中を見ているコース。

    覚えておく。読み込み直したときに一覧へ戻されると、
    せっかく選んだところからやり直しになる。
  */
  const [detailCourseId, setDetailCourseId] = useState<string>(
    restored?.courseId ?? course.id,
  );
  const courses = useCourses();

  useEffect(
    () => savePlace({ screen, lessonId, courseId: detailCourseId }),
    [screen, lessonId, detailCourseId],
  );

  const openCourse = (id: string, from: Screen) => {
    setDetailCourseId(id);
    setScreen(nextScreen(from, "OPEN_COURSE_DETAIL"));
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
    if (owner) setDetailCourseId(owner.id);

    setLessonId(id);
    setScreen(nextScreen(from, "SELECT_LESSON"));
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
        return <TopPage onStart={() => setScreen(nextScreen("TOP", "START"))} />;

      case "HOME":
        return (
          <HomePage
            onSelectLesson={(id) => openLesson(id, "HOME")}
            onOpenCourse={() => setScreen(nextScreen("HOME", "OPEN_COURSE"))}
            onOpenRecord={() => setScreen(nextScreen("HOME", "OPEN_RECORD"))}
            onOpenAccount={() => setScreen(nextScreen("HOME", "OPEN_SETTINGS"))}
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
            onBack={() => setScreen(nextScreen("COURSE_DETAIL", "OPEN_COURSE"))}
          />
        );
      }

      case "RECORD":
        return (
          <RecordPage
            onSelectLesson={(id) => openLesson(id, "RECORD")}
            onOpenCourse={() => setScreen(nextScreen("RECORD", "OPEN_COURSE"))}
          />
        );

      case "SAVED":
        return (
          <SavedPage
            onSelectLesson={(id) => openLesson(id, "SAVED")}
            onOpenCourse={() => setScreen(nextScreen("SAVED", "OPEN_COURSE"))}
            onOpenAccount={() => setScreen(nextScreen("SAVED", "OPEN_SETTINGS"))}
          />
        );

      case "SETTINGS":
        return <SettingsPage onBack={() => setScreen("HOME")} />;

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
              onOpenCourse={() => setScreen("COURSE")}
              onOpenRecord={() => setScreen("RECORD")}
              onOpenAccount={() => setScreen("SETTINGS")}
            />
          );
        }

        return (
          <LessonRunner
            key={lesson.id}
            lesson={lesson}
            onFinish={() => setScreen(nextScreen("LESSON", "BACK_TO_HOME"))}
            /* 1つ戻る先は、そのレッスンが入っているコースの中身 */
            onExit={() => setScreen(nextScreen("LESSON", "OPEN_COURSE_DETAIL"))}
            // 完了画面から、そのまま次のレッスンへ入れるようにする
            onSelectLesson={(id) => openLesson(id, "LESSON")}
          />
        );
      }
    }
  })();

  return (
    <>
      {social.result && (
        <div className="mx-auto max-w-2xl px-5 pt-4">
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
      {tab && (
        <BottomTabBar
          current={tab}
          onSelect={(key) => setScreen(SCREEN_OF_TAB[key] ?? screen)}
        />
      )}
    </>
  );
}
