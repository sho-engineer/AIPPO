/**
 * あとで見返したい教材の目印。
 *
 * サーバーに置く。端末にだけ持たせると、別の端末で付けた目印が
 * 見えず、ログインしている意味がそこだけ消える。
 */

import { getJson, sendJson } from "./http";

export interface Bookmark {
  lesson_id: string;
  created_at: string;
  /** もう終えたもの。終えたのに「あとで」と出したままにしない。 */
  completed: boolean;
}

export function fetchBookmarks(signal?: AbortSignal): Promise<{ items: Bookmark[] }> {
  return getJson("/api/lessons/bookmarks/", signal);
}

export function addBookmark(lessonId: string): Promise<{ bookmarked: boolean }> {
  return sendJson("/api/lessons/bookmarks/", { lesson_id: lessonId }, "POST");
}

export function removeBookmark(lessonId: string): Promise<{ bookmarked: boolean }> {
  return sendJson("/api/lessons/bookmarks/", { lesson_id: lessonId }, "DELETE");
}
