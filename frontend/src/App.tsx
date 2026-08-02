/**
 * 画面の切り替え（AIPPO 開発概要 §18 Phase 1）。
 *
 * トップ → 診断 → レッスン。
 * Phase 1 では AI API を使わず、固定レスポンスで通しの導線を確認する。
 */

import { useState } from "react";

import { DiagnosisPage } from "./pages/DiagnosisPage";
import { LessonPage } from "./pages/LessonPage";
import { TopPage } from "./pages/TopPage";
import { nextScreen, type Screen } from "./app/screens";

export function App() {
  const [screen, setScreen] = useState<Screen>("TOP");
  const [lessonId, setLessonId] = useState<string | null>(null);

  switch (screen) {
    case "TOP":
      return <TopPage onStart={() => setScreen(nextScreen("TOP", "START"))} />;

    case "DIAGNOSIS":
      return (
        <DiagnosisPage
          onSelectLesson={(id) => {
            setLessonId(id);
            setScreen(nextScreen("DIAGNOSIS", "SELECT_LESSON"));
          }}
        />
      );

    case "LESSON":
      return (
        <LessonPage
          lessonId={lessonId}
          onExit={() => setScreen(nextScreen("LESSON", "BACK_TO_TOP"))}
        />
      );
  }
}
