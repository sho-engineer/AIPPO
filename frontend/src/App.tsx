/**
 * 画面の切り替え。
 *
 * タイトル → ホーム → コース一覧 → レッスン。
 * レッスンの中身は教材データが決めるので、ここは器だけを持つ。
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
import { SettingsPage } from "./pages/SettingsPage";
import { HomePage } from "./pages/HomePage";
import { LessonRunner } from "./pages/LessonRunner";
import { TopPage } from "./pages/TopPage";
import { lookupLesson, useCourse } from "./course/live";
import { isStartable } from "./course/availability";
import { loadPlace, savePlace } from "./app/session";
import { nextScreen, type Screen } from "./app/screens";

/** 下タブのどれが光っているか。 */
const TAB_OF: Partial<Record<Screen, TabKey>> = {
  HOME: "home",
  COURSE: "course",
  SETTINGS: "settings",
};

/** 下タブの行き先。実装のある3つだけを持つ。 */
const SCREEN_OF_TAB: Partial<Record<TabKey, Screen>> = {
  home: "HOME",
  course: "COURSE",
  settings: "SETTINGS",
};

export function App() {
  // 教材はサーバーから届いたら差し替わる。届くまでは同梱の分で動く
  const course = useCourse();
  const restored = loadPlace();
  const [screen, setScreen] = useState<Screen>(restored?.screen ?? "TOP");
  const [lessonId, setLessonId] = useState<string>(
    restored?.lessonId ?? course.lessons[0].id,
  );

  useEffect(() => savePlace({ screen, lessonId }), [screen, lessonId]);

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

    setLessonId(id);
    setScreen(nextScreen(from, "SELECT_LESSON"));
  };

  const tab = TAB_OF[screen];

  const body = (() => {
    switch (screen) {
      case "TOP":
        return <TopPage onStart={() => setScreen(nextScreen("TOP", "START"))} />;

      case "HOME":
        return (
          <HomePage
            onSelectLesson={(id) => openLesson(id, "HOME")}
            onOpenCourse={() => setScreen(nextScreen("HOME", "OPEN_COURSE"))}
          />
        );

      case "COURSE":
        return <CoursePage onSelectLesson={(id) => openLesson(id, "COURSE")} />;

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
            />
          );
        }

        return (
          <LessonRunner
            key={lesson.id}
            lesson={lesson}
            onFinish={() => setScreen(nextScreen("LESSON", "BACK_TO_HOME"))}
            onExit={() => setScreen(nextScreen("LESSON", "OPEN_COURSE"))}
            // 完了画面から、そのまま次のレッスンへ入れるようにする
            onSelectLesson={(id) => openLesson(id, "LESSON")}
          />
        );
      }
    }
  })();

  return (
    <>
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
