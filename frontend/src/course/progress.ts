/**
 * どこまで来たか。
 *
 * 置き場所が2つある。
 *
 *   端末（localStorage）… 登録していなくても、すぐ出せる
 *   サーバー             … 端末をまたいでも同じ数が出る
 *
 * 出すのは**足し合わせ**にする。どちらか一方を選ぶと、必ず減って見える
 * 瞬間が出る。サーバーの返事を待つあいだは端末の分だけになり、
 * 「終わったはずのレッスンが未完了に戻った」ように見えてしまう。
 * 減る表示は、続ける気をいちばん削ぐ。
 *
 * サーバーに届かなくても画面は動く。端末の分だけで出す。
 */

import { useEffect, useState } from "react";

import { getJson } from "../api/http";
import { listCompleted } from "../lib/draft";

export interface LessonProgress {
  lesson_id: string;
  completed: boolean;
  current_step: string;
  attempt_count: number;
  updated_at: string;
}

/** 学んだ量と、いまの呼び名。減らない（`backend/apps/rewards/xp.py`）。 */
export interface XpSummary {
  total: number;
  level: string;
  next_level: string | null;
  /** 次の呼び名まで、あといくつ。最後まで来ていれば null */
  to_next: number | null;
}

export interface ProgressResponse {
  lessons: LessonProgress[];
  completed_count: number;
  in_progress_count: number;
  skills: string[];
  signed_in: boolean;
  xp: XpSummary;
}

export function fetchProgress(signal?: AbortSignal): Promise<ProgressResponse> {
  return getJson<ProgressResponse>("/api/v1/progress/", signal);
}

/**
 * 終わったレッスンの id。
 *
 * 最初は端末の分だけを返し、サーバーの返事が来たら足す。
 * 返ってくるまでのあいだも 0件にはならない。
 */
export function useCompletedLessons(): string[] {
  const [ids, setIds] = useState<string[]>(() => listCompleted());

  useEffect(() => {
    let alive = true;

    void fetchProgress()
      .then((progress) => {
        if (!alive) return;
        setIds((local) => {
          const merged = new Set(local);
          for (const lesson of progress.lessons) {
            if (lesson.completed) merged.add(lesson.lesson_id);
          }
          return [...merged];
        });
      })
      .catch(() => {
        // 届かなかった。端末の分だけで出す
      });

    return () => {
      alive = false;
    };
  }, []);

  return ids;
}

/**
 * 学んだ量と、覚えた技の数。
 *
 * 端末には持っていないので、届くまでは null。**0 を出さない**——
 * 貯めた人に「0 XP」を一瞬見せると、消えたように見える。
 * 出せないあいだは、その場所ごと出さないほうがよい。
 *
 * 届かなくても画面は動く。図鑑は学習の本筋ではないので、
 * ここで行き止まりを作らない。
 */
export function useXpSummary(): { xp: XpSummary; skills: number } | null {
  const [state, setState] = useState<{ xp: XpSummary; skills: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetchProgress(controller.signal)
      .then((progress) => {
        // 古い版のサーバーには xp が無い。その場合は出さない
        if (progress.xp) {
          setState({ xp: progress.xp, skills: progress.skills.length });
        }
      })
      .catch(() => {
        // 届かなかった。この節は出さない
      });

    return () => controller.abort();
  }, []);

  return state;
}
