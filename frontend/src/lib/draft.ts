/**
 * 入力の自動保存（要件 §6.6）。
 *
 * 未ログインで使えることが前提なので、端末の中だけに置く。
 * 読み込み直しても、同じ端末なら続きから始められる。
 *
 * localStorage が使えない場面（プライベートモード、容量超過、
 * 設定で無効）でも、**アプリは止めない**。保存できないだけで、
 * その場の操作は続けられるようにする。
 */

import type { StepValues } from "../course/types";

const PREFIX = "aippo:draft:";
/**
 * 形が変わったら上げる。古い下書きを読み込んで壊れるのを防ぐ。
 *
 * **上げるときは、古い形を読める道を必ず残すこと。** 版が違うだけで
 * 捨てると、いま途中まで進めている人の続きがまるごと消える——
 * 「レッスンを毎回最初からやり直させない」の正反対になる。
 * 下の `migrate()` がその道。
 */
const VERSION = 2;

/**
 * AI の実行1回分。**続きから始めるために要る。**
 *
 * 前は覚えていなかった。ステップだけ戻すので、開き直した人は
 * 「3つを比べる」の画面に着くのに**比べる中身が空**だった。
 * 進み具合だけ残って、作ったものが消えている状態になる。
 *
 * `usage`（どのモデルを何トークン使ったか）は覚えない。続きを
 * 始めるのに要らないし、端末に溜める理由も無い。
 */
export interface SavedRun {
  sequence: number;
  stepId: string;
  label: string;
  inputText: string;
  outputText: string;
}

export interface Draft {
  version: number;
  lessonId: string;
  stepId: string;
  values: StepValues;
  /** 自分の課題を飛ばしたか。飛ばしたことも記録する（要件 §6.10）。 */
  realTaskSkipped?: boolean;
  /** AI が返したもの。無ければ空（古い下書きと、まだ送っていない回）。 */
  runs?: SavedRun[];
  updatedAt: number;
}

function storage(): Storage | null {
  try {
    const test = "aippo:probe";
    window.localStorage.setItem(test, "1");
    window.localStorage.removeItem(test);
    return window.localStorage;
  } catch {
    return null;
  }
}

function keyOf(lessonId: string): string {
  return `${PREFIX}${lessonId}`;
}

export function saveDraft(draft: Omit<Draft, "version" | "updatedAt">): void {
  const store = storage();
  if (!store) return;

  try {
    store.setItem(
      keyOf(draft.lessonId),
      JSON.stringify({ ...draft, version: VERSION, updatedAt: Date.now() }),
    );
  } catch {
    // 容量超過。保存できないだけで、操作は続けられる
  }
}

export function loadDraft(lessonId: string): Draft | null {
  const store = storage();
  if (!store) return null;

  const raw = store.getItem(keyOf(lessonId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Draft;
    // 読めない形のものは捨てる。壊れた下書きで画面を壊さない
    if (typeof parsed.stepId !== "string") return null;
    if (typeof parsed.values !== "object" || parsed.values === null) return null;
    return migrate(parsed);
  } catch {
    return null;
  }
}

/**
 * 古い形の下書きを、いまの形として読む。
 *
 * **版が違うだけで捨てない。** 捨てると、いま途中まで進めている人の
 * 続きがまるごと消える。中身が読めるなら読む。
 *
 *   版1 … `runs` を持っていない。空として読む。ステップと入力は
 *          そのまま使えるので、続きからは始められる（比べる画面まで
 *          戻っていた人だけ、中身が空になる）
 *
 * 知らない版が来たら捨てる。未来の形は読めないので、
 * 読めたふりをすると壊れ方が読めなくなる。
 */
function migrate(draft: Draft): Draft | null {
  if (draft.version === VERSION) return draft;
  if (draft.version === 1) return { ...draft, version: VERSION, runs: [] };
  return null;
}

export function clearDraft(lessonId: string): void {
  storage()?.removeItem(keyOf(lessonId));
}

/** 完了したレッスン。進捗画面で使う。 */
const DONE_KEY = "aippo:completed";

export function markCompleted(lessonId: string): void {
  const store = storage();
  if (!store) return;

  const done = new Set(listCompleted());
  done.add(lessonId);
  try {
    store.setItem(
      DONE_KEY,
      JSON.stringify({ lessons: [...done], updatedAt: Date.now() }),
    );
  } catch {
    /* 保存できなくても操作は続けられる */
  }
}

export function listCompleted(): string[] {
  const store = storage();
  if (!store) return [];

  try {
    const parsed = JSON.parse(store.getItem(DONE_KEY) ?? "{}");
    return Array.isArray(parsed.lessons) ? parsed.lessons : [];
  } catch {
    return [];
  }
}

/**
 * 連続学習日数（要件 §14）。
 *
 * 他人との比較はしない。自分の続き具合だけを見せる。
 */
const STREAK_KEY = "aippo:streak";

interface Streak {
  days: number;
  lastDate: string;
  /** 自分の課題で試した回数。 */
  realTaskCount: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function readStreak(): Streak {
  const store = storage();
  if (!store) return { days: 0, lastDate: "", realTaskCount: 0 };

  try {
    const parsed = JSON.parse(store.getItem(STREAK_KEY) ?? "{}");
    return {
      days: Number(parsed.days) || 0,
      lastDate: typeof parsed.lastDate === "string" ? parsed.lastDate : "",
      realTaskCount: Number(parsed.realTaskCount) || 0,
    };
  } catch {
    return { days: 0, lastDate: "", realTaskCount: 0 };
  }
}

function writeStreak(streak: Streak): void {
  try {
    storage()?.setItem(STREAK_KEY, JSON.stringify(streak));
  } catch {
    /* 保存できなくても操作は続けられる */
  }
}

/** 今日ひらいたことを記録する。同じ日に何度呼んでも増えない。 */
export function touchStreak(): Streak {
  const current = readStreak();
  const now = today();
  if (current.lastDate === now) return current;

  const next: Streak = {
    ...current,
    lastDate: now,
    days: current.lastDate === yesterday() ? current.days + 1 : 1,
  };
  writeStreak(next);
  return next;
}

export function countRealTask(): void {
  const current = readStreak();
  writeStreak({ ...current, realTaskCount: current.realTaskCount + 1 });
}
