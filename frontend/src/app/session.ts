/**
 * いまどの画面にいるかを、端末に覚えておく。
 *
 * 未ログインで使えることが前提なので、端末の中だけに置く。
 * これが無いと、レッスンの途中で読み込み直したときに
 * トップへ戻されて、入力だけが残るちぐはぐな状態になる
 * （要件 §6.6「ページ再読み込み後も同じ端末で再開できる」）。
 */

import type { Screen } from "./screens";

const KEY = "aippo:place";

export interface Place {
  screen: Screen;
  lessonId: string;
}

export function savePlace(place: Place): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(place));
  } catch {
    // 保存できなくても操作は続けられる
  }
}

export function loadPlace(): Place | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (!parsed || typeof parsed.screen !== "string") return null;
    if (typeof parsed.lessonId !== "string") return null;
    return parsed as Place;
  } catch {
    return null;
  }
}
