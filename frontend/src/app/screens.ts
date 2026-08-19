/**
 * アプリ全体の画面遷移。
 *
 * レッスンの中の進行（course/engine.ts）とは別の層。
 * こちらは「タイトル → ホーム → コース一覧 → レッスン」と、設定を扱う。
 *
 * ホームとコース一覧を分けたのは、支給デザインの下タブに合わせたため。
 * ホームは「今日どこから始めるか」、コース一覧は「全体を見渡す」場所で、
 * 役割が違う。1画面に混ぜると、どちらの用も中途半端になる。
 *
 * 画面数が少ないうちはルーターを入れない。
 * URL共有やブラウザバックが要るようになった時点で導入する。
 */

export const SCREENS = ["TOP", "HOME", "COURSE", "LESSON", "RECORD", "SETTINGS"] as const;

export type Screen = (typeof SCREENS)[number];

export type ScreenEvent =
  | "START"
  | "SELECT_LESSON"
  | "BACK_TO_HOME"
  | "OPEN_COURSE"
  | "OPEN_RECORD"
  | "OPEN_SETTINGS"
  | "BACK_TO_TOP";

const TRANSITIONS: Record<Screen, Partial<Record<ScreenEvent, Screen>>> = {
  TOP: { START: "HOME" },
  HOME: {
    SELECT_LESSON: "LESSON",
    OPEN_COURSE: "COURSE",
    OPEN_RECORD: "RECORD",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_TOP: "TOP",
  },
  COURSE: {
    SELECT_LESSON: "LESSON",
    BACK_TO_HOME: "HOME",
    OPEN_RECORD: "RECORD",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_TOP: "TOP",
  },
  // レッスンを終えたらホームへ戻す。行き止まりにしない（憲章 原則 I）
  LESSON: { BACK_TO_HOME: "HOME", OPEN_COURSE: "COURSE", BACK_TO_TOP: "TOP" },
  // 学習履歴。ここから同じ教材をやり直せるので、レッスンへも出られる
  RECORD: {
    SELECT_LESSON: "LESSON",
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_TOP: "TOP",
  },
  // 設定はどこからでも抜けられる
  SETTINGS: {
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_RECORD: "RECORD",
    BACK_TO_TOP: "TOP",
  },
};

/** 遷移表に無いイベントは無視し、現在の画面を維持する。 */
export function nextScreen(screen: Screen, event: ScreenEvent): Screen {
  return TRANSITIONS[screen][event] ?? screen;
}

export function canTransition(screen: Screen, event: ScreenEvent): boolean {
  return event in TRANSITIONS[screen];
}
