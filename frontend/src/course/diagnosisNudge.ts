/**
 * ホームで1度だけ出す、「まずは診断を」の案内。
 *
 * なぜ要るか
 * ----------
 * 初めて来た人のホームには、今日の1本とこれまでの記録が並ぶ。記録は
 * まだ空で、押せる場所は「はじめる」1つ——それ自体は迷わない形だが、
 * **その人に合った1本なのかどうかは誰も言っていない**。診断は
 * コースの中（`lesson-diagnosis`）にあり、探して見つけるものになっている。
 *
 * 最初の1回だけ、こちらから声をかける。
 *
 * 診断は任意のまま
 * ----------------
 * 「あとで」と「×」で閉じられて、そのままホームが使える。背景を
 * タップしても閉じない——**閉じたつもりのない取りこぼし**を作らない
 * ため（`MoreSheet` の `dismissOnScrim`）。閉じた人が後から始められる
 * ように、ホームには常設の入口を残してある（`HomePage` の
 * `open-diagnosis`）。
 *
 * 出さないほうを既定にする
 * ------------------------
 * 判断がつかない場面（サーバーの返事が読めない、保存が使えない、
 * 古いサーバー）では、**出さない**side へ倒す。案内は出しそこねても
 * 常設の入口から辿れるが、二度目を出すと「閉じたのに戻ってきた」になる。
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { hasAnyDraft, listCompleted, loadDraft, openedBefore } from "../lib/draft";
import { isSheetOpen } from "../components/course/MoreSheet";

/** 診断そのもの。教材データの id。 */
export const DIAGNOSIS_LESSON_ID = "diagnosis";

/**
 * 診断の1問目。
 *
 * 案内から始めた人は、ここへ**直接**入る。教材の1つ目は「今のAIの
 * 使い方をチェック」という開始説明の回で、そこには「診断をはじめる」が
 * もう一度置いてある——案内で説明した直後に、同じ説明をもう一度読んで
 * 同じボタンを押すことになる。
 *
 * コースの一覧から入った人は、これまでどおり開始説明から始まる。
 * あちらは案内を読んでいないので、そこが最初の説明になる。
 */
export const DIAGNOSIS_FIRST_QUESTION_ID = "ai_usage";

// ------------------------------------------------ ゲストの「見た」を覚える

const GUEST_KEY = "aippo:diagnosis-nudge";

/**
 * 保存が使えないときの控え。
 *
 * プライベートモード・容量超過・設定で無効。そこで**毎回出す**のが
 * いちばん困る形なので、せめてこの回のあいだは出し直さない。
 * 読み込み直せば消える——それは端末側の制約で、こちらでは直せない。
 */
let seenInThisSession = false;

function storage(): Storage | null {
  try {
    const probe = "aippo:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readGuestSeen(): boolean {
  if (seenInThisSession) return true;
  try {
    return storage()?.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGuestSeen(): void {
  seenInThisSession = true;
  try {
    storage()?.setItem(GUEST_KEY, "1");
  } catch {
    /* 保存できなくても、この回のあいだは控えが効いている */
  }
}

/** 検査用。端末の控えと、この回の控えの両方を消す。 */
export function forgetGuestSeen(): void {
  seenInThisSession = false;
  try {
    storage()?.removeItem(GUEST_KEY);
  } catch {
    /* 消せなくても、次の判定は控えのほうを見る */
  }
}

// ---------------------------------------------------------------- 出すか

export interface NudgeFacts {
  /**
   * 判断に要るものが、全部そろったか。
   *
   * ログイン状態と進み具合が届く前に判断すると、**一瞬出してから
   * 消える**か、出すべき人に出ないかのどちらかになる。そろうまでは
   * 何も出さない——待つのは長くても `me` と `progress` の1往復で、
   * 時間で待つのとは違う。
   */
  ready: boolean;
  /** この案内を、もう見せたか。 */
  seen: boolean;
  /** 診断を終えているか。 */
  diagnosisDone: boolean;
  /** 診断を始めているか（途中で閉じた人を含む）。 */
  diagnosisStarted: boolean;
  /** 何かしら学んだ跡があるか。**もう使っている人には出さない。** */
  hasHistory: boolean;
  /** ほかの一枚が、もう開いているか。重ねない。 */
  otherDialogOpen: boolean;
}

/**
 * 案内を出してよいか。**全部が揃ったときだけ true。**
 *
 * 画面から切り離してある。ここが素の関数なら、5つの条件それぞれを
 * 1行で確かめられる（`tests/diagnosisNudge.test.ts`）。
 */
export function shouldShowNudge(facts: NudgeFacts): boolean {
  if (!facts.ready) return false;
  if (facts.seen) return false;
  if (facts.diagnosisDone || facts.diagnosisStarted) return false;
  if (facts.hasHistory) return false;
  if (facts.otherDialogOpen) return false;
  return true;
}

// ------------------------------------------------------------------ 画面用

export interface DiagnosisNudge {
  /** 案内を出しているか。 */
  open: boolean;
  /** 閉じる。「あとで」「×」「Esc」「診断をはじめる」から呼ぶ。 */
  close: () => void;
}

/**
 * ホームで案内を出すかどうかを決めて、開け閉めを持つ。
 *
 * 終わったレッスンは呼ぶ側から受け取る（ホームがもう聞いている）。
 * ここで聞き直すと、同じ `progress` を1画面で3回取りに行くことになる。
 */
export function useDiagnosisNudge(completed: string[]): DiagnosisNudge {
  const auth = useAuth();
  const [open, setOpen] = useState(false);

  /*
    決めるのは1度だけ。

    開発中の作り直し（StrictMode の二度がけ）でも、ホームが描き直された
    ときでも、**判断そのものを繰り返さない**。ref に置いてあるので、
    同じ画面に居るあいだは残る。

    「出した時点で見たことにする」も、この1度の中でやる。あとに回すと、
    出ている最中に描き直しが入った拍子にもう一度数えることになる。
  */
  const decided = useRef(false);

  const markSeen = useCallback(() => {
    if (auth.user) auth.markDiagnosisNudgeSeen();
    else markGuestSeen();
  }, [auth]);

  /*
    そろったか。**時間では待たない。**

    ログインの確認（`me`）が終わり、ログインしている人なら進み具合も
    届いている状態。ゲストには進み具合が返らないので、そこは端末に
    残っているものを見る。
  */
  const ready = !auth.loading && (auth.user === null || auth.progress !== null);

  const facts: NudgeFacts = {
    ready,
    seen: auth.user
      ? /*
          読めないときは「見た」に倒す。古いサーバーは返してこないので、
          `undefined` で毎回出すと、更新のたびに全員へ案内が出る。
        */
        auth.user.diagnosis_nudge_seen !== false
      : readGuestSeen(),
    diagnosisDone: completed.includes(DIAGNOSIS_LESSON_ID),
    diagnosisStarted: loadDraft(DIAGNOSIS_LESSON_ID) !== null,
    hasHistory: auth.user
      ? (auth.progress?.completed ?? 0) + (auth.progress?.in_progress ?? 0) > 0
      : /*
          ゲストの「もう使っている人」。サーバーは数えていないので、
          端末に残る3つから見る——終えた1本・途中の下書き・前に来た日。
          最後のひとつが要るのは、**開いただけで何も始めていない人**を
          拾うため（機能が増えた日に、常連のホームへ突然出さない）。
        */
        listCompleted().length > 0 || hasAnyDraft() || openedBefore(),
    otherDialogOpen: isSheetOpen(),
  };

  const show = shouldShowNudge(facts);

  useEffect(() => {
    if (decided.current || !ready) return;
    decided.current = true;
    if (!show) return;
    setOpen(true);
    markSeen();
  }, [ready, show, markSeen]);

  const close = useCallback(() => setOpen(false), []);

  return { open, close };
}
