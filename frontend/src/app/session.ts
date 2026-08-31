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
  /** 中を見ていたコース。古い控えには入っていないので、省略できる。 */
  courseId?: string;
}

export function savePlace(place: Place): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(place));
  } catch {
    // 保存できなくても操作は続けられる
  }
}

/**
 * いまいる場所。
 *
 * `savePlace` が書いたものをそのまま読む。外部サービスへ出る直前に
 * 控えを取るために使う（auth/returnTo.ts）。読めなければホームを返す
 * ——控えが取れないだけで、認証は止めない。
 */
export function currentPlace(): Place {
  return loadPlace() ?? { screen: "HOME", lessonId: "" };
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
