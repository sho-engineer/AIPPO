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
const VERSION = 3;

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
  /**
   * そのとき開いていた教材の版（`course/resume.ts` の `lessonRevision`）。
   *
   * 教材の並びが変わると、控えの `stepId` は生きていても**続きの意味が
   * 変わる**——回を足した日に、3問目のつもりで4問目から再開する、など。
   * 版が違うときは復元せず、最初から始めてもらう。
   *
   * 版3より前の控えには入っていない。入っていないものは「分からない」
   * であって「違う」ではないので、そこだけで捨てない。
   */
  revision?: string;
  /**
   * この試行の合言葉。
   *
   * 「最初からやり直す」で引き直す。**遅れて届いた前の試行の結果**を、
   * 新しい試行へ混ぜないための目印（`useCourseLesson` の `generation`）。
   */
  attempt?: string;
  /**
   * 誰の控えか。ログインしている人だけ入る。
   *
   * 中身は読み戻せない短い印（`course/resume.ts` の `ownerTag`）で、
   * メールそのものは端末に置かない。**別のアカウントで入った人に、
   * 前の人の続きを出さない**ため。ゲストは空。
   */
  owner?: string;
  /**
   * 送っている最中に閉じた操作の合言葉。
   *
   * これがあると、開き直したときに**同じ合言葉で送り直せる**。
   * サーバーは同じ合言葉を見たら作り直さずに前の結果を返すので
   * （`apps/ai/views.py` の `_replay`）、持ち分が2つ減らない。
   */
  pending?: { key: string; id: string };
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
  /*
    版2 … 教材の版・試行・持ち主を持っていない。**空のまま読む。**
           「分からない」であって「違う」ではないので、そこだけで
           捨てない（捨てると、いま途中の人の続きが消える）。
  */
  if (draft.version === 2) return { ...draft, version: VERSION };
  if (draft.version === 1) return { ...draft, version: VERSION, runs: [] };
  return null;
}

export function clearDraft(lessonId: string): void {
  storage()?.removeItem(keyOf(lessonId));
}

/**
 * どれか1本でも、途中まで進めた跡が残っているか。
 *
 * ゲストに「もう使っている人かどうか」を聞く手立てのひとつ
 * （`course/diagnosisNudge.ts`）。サーバーはゲストの進み具合を
 * `me` では返さないので、端末に残っているものから見るしかない。
 *
 * 1本ずつ `loadDraft` を呼ばない。**教材の一覧を知らなくても答えられる**
 * ようにしておくと、教材が増えた日にここを直さずに済む。
 */
export function hasAnyDraft(): boolean {
  const store = storage();
  if (!store) return false;

  try {
    for (let at = 0; at < store.length; at += 1) {
      if (store.key(at)?.startsWith(PREFIX)) return true;
    }
  } catch {
    /* 読めないなら「跡は無い」でよい。ここで画面を止めない */
  }
  return false;
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
  /**
   * ひらいた日（新しい順）。**14日ぶんだけ持つ。**
   *
   * 「今週の学習」を出すのに要る。連続日数（`days`）は途切れると 1 に
   * 戻るので、**今週なんども開いたこと**は残らない。かといって
   * 全部の日付を持つ必要も無い——見せるのは直近7日ぶんだけ。
   */
  openDays?: string[];
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
      openDays: Array.isArray(parsed.openDays)
        ? parsed.openDays.filter((one: unknown) => typeof one === "string")
        : [],
    };
  } catch {
    return { days: 0, lastDate: "", realTaskCount: 0, openDays: [] };
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
    openDays: [now, ...(current.openDays ?? [])].slice(0, 14),
  };
  writeStreak(next);
  return next;
}

/**
 * ゲストとして始めた跡。
 *
 * 「ゲストではじめる」を押したことだけを覚える。**学んだかどうかとは
 * 別**で、押しただけの人にも効く——学んだ跡のほうで代用すると、
 * 押してから何もしなかった人が、次に開くたびにようこそへ戻され、
 * そのたびに始め方を選び直すことになる。
 *
 * 登録した人には使わない。あちらはサーバーが本当の状態を持っている。
 */
const GUEST_KEY = "aippo:guest";

export function markGuestStarted(): void {
  try {
    window.localStorage.setItem(GUEST_KEY, "1");
  } catch {
    /* 保存できなくても、その場の操作は続けられる */
  }
}

export function hasGuestStarted(): boolean {
  try {
    return window.localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * この端末に残っている学習の跡を、まとめて消す。
 *
 * ログアウトのときに呼ぶ。**次にこの端末を使う人へ、前の人の記録を
 * 見せないため。** ホームの「レッスン完了 1」は端末とサーバーの両方を
 * 足して出しているので（`course/progress.ts`）、端末の分を残すと、
 * ログアウトしたあとのホームに前の人の数がそのまま出る。
 *
 * 消すのは**この端末の写し**だけ。サーバー側の記録は消さない——
 * ログインし直せば戻ってくる。消したいときは設定から
 * （`deleteLearningData`）。
 */
export function clearDeviceLearningCache(): void {
  const store = storage();
  if (!store) return;

  try {
    const doomed: string[] = [];
    for (let at = 0; at < store.length; at += 1) {
      const key = store.key(at);
      if (!key) continue;
      if (key.startsWith(PREFIX) || DEVICE_KEYS.has(key)) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  } catch {
    /* 消せなくても画面は動く。止める理由が無い */
  }
}

/**
 * 端末に置いてある、学習まわりの控え。
 *
 * ここに**入れないもの**を決めておく。設定（音を出すか、など）は
 * その人の記録ではなく端末の好みなので、ログアウトで戻さない。
 */
const DEVICE_KEYS = new Set([
  DONE_KEY,
  STREAK_KEY,
  GUEST_KEY,
  // いまどの画面にいたか（`app/session.ts`）
  "aippo:place",
  // 診断の案内を見たか（`course/diagnosisNudge.ts`）
  "aippo:diagnosis-nudge",
  // 診断のおすすめ順（`course/recommend.ts` の `STORAGE_KEY`）
  "aippo:recommended",
]);

/**
 * 今日より前に、この端末でひらいたことがあるか。
 *
 * 「もう使っている人」を見分けるのに使う（`course/diagnosisNudge.ts`）。
 * 連続日数（`days`）では見分けられない——`touchStreak()` は今日の分を
 * その場で 1 にするので、**初めて来た人も 1 になる**。
 *
 * だから日付そのものを見て、今日以外の日が混じっているかを聞く。
 * ホームは開いた直後に `touchStreak()` を呼ぶので、ここが true なのは
 * 「前にも来ていた」ときだけになる。
 */
export function openedBefore(): boolean {
  const now = today();
  return (readStreak().openDays ?? []).some((day) => day !== now);
}

/**
 * この7日でひらいた日数。
 *
 * ホームの「今週の学習」に出す。**数えているものだけを出す**ため、
 * 滞在時間や回数ではなく「ひらいた日」を数える——測っていない数字を
 * 見た目のために作らない。
 *
 * 「月曜から今日まで」にはしない。週の変わり目で 0 に戻ると、日曜に
 * 続けた人ほど何も無い画面を見ることになる。
 */
export function daysThisWeek(): number {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const from = since.toISOString().slice(0, 10);
  return new Set(
    (readStreak().openDays ?? []).filter((day) => day >= from),
  ).size;
}

export function countRealTask(): void {
  const current = readStreak();
  writeStreak({ ...current, realTaskCount: current.realTaskCount + 1 });
}
