/**
 * 始めた直後に1度だけ出す、診断への案内。
 *
 * どこに出すか
 * ------------
 * **独立した1画面**（`pages/DiagnosisIntroPage.tsx`）。前はホームの上に
 * 浮かべていたが、後ろに自分の記録が透けている状態で「まずは診断を」と
 * 言われると、**もう始まっている場所に引き返しを求められている**ように
 * 読める。始める前の1枚として出したほうが、案内として素直になる。
 *
 * このファイルが持つのは2つだけ
 * ----------------------------
 *   ・診断そのものを指す名前（レッスンの id と、1問目の id）
 *   ・案内を「見た」かどうかの覚え方
 *
 * **どの画面から始めるか**は `app/entry.ts` が決める。案内を出すかどうかも
 * その判断の一部なので、条件をここに残すと同じ話が2か所に散る。
 *
 * 見た、を分けて持つ
 * ------------------
 * 「診断をまだ受けていない」と「案内をまだ見ていない」は違う。前者だけで
 * 出し分けると、**あとで**を押した人に毎回出る。
 *
 * 登録した人はサーバー、ゲストは端末
 * ----------------------------------
 * 端末にだけ置くと、会社のPCで閉じた人に帰りの電車でもう一度出る。
 * 登録した人の正は `UserProfile.diagnosis_nudge_seen`。
 */

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

/**
 * 登録した人の「見た」を読む。
 *
 * **読めないときは「見た」に倒す。** 古いサーバーはこの項目を返して
 * こないので、`undefined` で毎回出すと、更新のたびに全員へ案内が出る。
 * 出しそこねてもホームの常設の入口から辿れるが、二度目を出すと
 * 「閉じたのに戻ってきた」になる。
 */
export function accountGuideSeen(user: { diagnosis_nudge_seen?: boolean } | null): boolean {
  if (!user) return readGuestSeen();
  return user.diagnosis_nudge_seen !== false;
}
