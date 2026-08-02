/**
 * アプリ全体の画面遷移。
 *
 * レッスン内部の9状態（lesson/machine.ts）とは別の層。
 * こちらは「トップ → 診断 → レッスン」の3画面だけを扱う。
 *
 * MVP は3画面なのでルーターを入れない。
 * 画面数が増えるか、URL共有・ブラウザバックが必要になった時点で導入する。
 */

export const SCREENS = ["TOP", "DIAGNOSIS", "LESSON"] as const;

export type Screen = (typeof SCREENS)[number];

export type ScreenEvent = "START" | "SELECT_LESSON" | "BACK_TO_TOP";

const TRANSITIONS: Record<Screen, Partial<Record<ScreenEvent, Screen>>> = {
  TOP: { START: "DIAGNOSIS" },
  DIAGNOSIS: { SELECT_LESSON: "LESSON", BACK_TO_TOP: "TOP" },
  LESSON: { BACK_TO_TOP: "TOP" },
};

/** 遷移表に無いイベントは無視し、現在の画面を維持する。 */
export function nextScreen(screen: Screen, event: ScreenEvent): Screen {
  return TRANSITIONS[screen][event] ?? screen;
}

export function canTransition(screen: Screen, event: ScreenEvent): boolean {
  return event in TRANSITIONS[screen];
}
