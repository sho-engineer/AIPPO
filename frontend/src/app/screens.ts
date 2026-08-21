/**
 * アプリ全体の画面遷移。
 *
 * レッスンの中の進行（course/engine.ts）とは別の層。
 * こちらは「タイトル → ホーム → コース一覧 → レッスン」と、設定を扱う。
 *
 * ホームとコース一覧を分けたのは、支給デザインの下タブに合わせたため。
 * ホームは「今日どこから始めるか」、コース一覧は「どのコースにするか」を
 * 決める場所で、役割が違う。1画面に混ぜると、どちらの用も中途半端になる。
 *
 * コースは3段
 * -----------
 *     COURSE（どれにするか） → COURSE_DETAIL（道のり） → LESSON（学ぶ）
 *
 * 前は COURSE から直接 LESSON へ行っていた。コースが1つしか無いあいだは
 * それで足りたが、7つに増えると「どのコースの何本目か」が画面から
 * 消える。段を1つ足して、いまどのコースの中にいるかを常に持たせる。
 *
 * 画面数が少ないうちはルーターを入れない。
 * URL共有やブラウザバックが要るようになった時点で導入する。
 */

export const SCREENS = [
  "TOP",
  "HOME",
  "COURSE",
  "COURSE_DETAIL",
  "LESSON",
  // 「こんな使い方もできます」のくわしい説明。完了画面から来る
  "RECIPE",
  "RECORD",
  "SAVED",
  "SETTINGS",
] as const;

export type Screen = (typeof SCREENS)[number];

export type ScreenEvent =
  | "START"
  | "SELECT_LESSON"
  | "BACK_TO_HOME"
  | "OPEN_COURSE"
  | "OPEN_COURSE_DETAIL"
  | "OPEN_RECIPE"
  | "OPEN_RECORD"
  | "OPEN_SAVED"
  | "OPEN_SETTINGS"
  | "BACK_TO_TOP";

const TRANSITIONS: Record<Screen, Partial<Record<ScreenEvent, Screen>>> = {
  TOP: { START: "HOME" },
  HOME: {
    SELECT_LESSON: "LESSON",
    OPEN_COURSE: "COURSE",
    OPEN_RECORD: "RECORD",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_TOP: "TOP",
  },
  COURSE: {
    // 続きの1本は、一覧から直接ひらける。読みたいのは中身であって、
    // 途中の画面ではない
    SELECT_LESSON: "LESSON",
    OPEN_COURSE_DETAIL: "COURSE_DETAIL",
    BACK_TO_HOME: "HOME",
    OPEN_RECORD: "RECORD",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_TOP: "TOP",
  },
  // コースの中身。ここから戻る先は、必ずコース一覧
  COURSE_DETAIL: {
    SELECT_LESSON: "LESSON",
    OPEN_COURSE: "COURSE",
    // 「作れるようになるもの」から、やり方の説明へ
    OPEN_RECIPE: "RECIPE",
    BACK_TO_HOME: "HOME",
    OPEN_RECORD: "RECORD",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_TOP: "TOP",
  },
  // レッスンを終えたらホームへ戻す。行き止まりにしない（憲章 原則 I）
  LESSON: {
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_COURSE_DETAIL: "COURSE_DETAIL",
    // 完了画面の「こんな使い方もできます」から、くわしい説明へ
    OPEN_RECIPE: "RECIPE",
    BACK_TO_TOP: "TOP",
  },
  /*
    使い方のくわしい説明。

    ここから足りない技のレッスンへ入れる（読んで終わりにしない）。
    戻る先はホーム——来たのは完了画面からで、そこへ戻しても
    同じレッスンをもう一度終える画面が出るだけになる。
  */
  RECIPE: {
    SELECT_LESSON: "LESSON",
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_RECORD: "RECORD",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_TOP: "TOP",
  },
  // 学習履歴。ここから同じ教材をやり直せるので、レッスンへも出られる
  RECORD: {
    SELECT_LESSON: "LESSON",
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_TOP: "TOP",
  },
  // 取っておいた教材の置き場。ここからそのまま開ける
  SAVED: {
    SELECT_LESSON: "LESSON",
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_RECORD: "RECORD",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_TOP: "TOP",
  },
  // 設定はどこからでも抜けられる
  SETTINGS: {
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_RECORD: "RECORD",
    OPEN_SAVED: "SAVED",
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
