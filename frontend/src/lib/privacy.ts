/**
 * 送信前の、個人情報・機密情報の簡易チェック（要件 §7）。
 *
 * 完全な判定はできないし、目指さない。
 * 目的は「気づかずに送ってしまう」のを減らすことで、
 * 検閲することではない。
 *
 * 強さを2段に分けている。
 *
 *   block … 取り消せない実害が出るもの。初期状態では送信できない
 *           （パスワード・APIキー・カード番号）
 *   warn  … 場合によるもの。確認したうえで送信できる
 *           （メール・電話番号・住所・社外秘の表現）
 *
 * 判定は端末の中だけで行う。チェックのために本文をサーバーへ
 * 送っては、目的と逆になる。
 */

export type PrivacyLevel = "block" | "warn";

export interface PrivacyFinding {
  id: string;
  level: PrivacyLevel;
  /** 何が見つかったか。**見つけた文字列そのものは持たない。** */
  label: string;
}

interface Rule {
  id: string;
  level: PrivacyLevel;
  label: string;
  pattern: RegExp;
}

/**
 * 判定のもと。
 *
 * 厳しくしすぎると、ふつうの文章でも警告が出て無視されるようになる。
 * 「オオカミ少年」にしないことを優先している。
 */
const RULES: Rule[] = [
  {
    id: "api_key",
    level: "block",
    label: "APIキーのような文字列",
    // sk-... のような接頭辞つきの長い英数字。実際の鍵の形に寄せる
    pattern:
      /\b(sk|pk|rk|api|key|token)[-_][A-Za-z0-9_-]{16,}\b|\bAKIA[0-9A-Z]{16}\b|\bghp_[A-Za-z0-9]{20,}\b/i,
  },
  {
    id: "password",
    level: "block",
    // 「パスワードは xxxx」の形。単に「パスワード」と書いただけでは出さない
    label: "パスワードらしい記述",
    pattern:
      /(パスワード|ぱすわーど|password|passwd|pwd)\s*(は|:|：|=|＝)\s*\S{4,}/i,
  },
  {
    id: "credit_card",
    level: "block",
    label: "クレジットカード番号らしい数字",
    // 4桁×4。区切りは無し・空白・ハイフンを許す
    pattern: /\b(?:\d[ -]?){15}\d\b/,
  },
  {
    id: "email",
    level: "warn",
    label: "メールアドレス",
    pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/,
  },
  {
    id: "phone",
    level: "warn",
    label: "電話番号",
    // 日本の固定・携帯。年号や金額と紛れないよう区切りを必須にする
    pattern: /\b0\d{1,4}[-(（]\d{1,4}[-)）]\d{3,4}\b|\b0[789]0-?\d{4}-?\d{4}\b/,
  },
  {
    id: "address",
    level: "warn",
    label: "住所らしい記述",
    pattern: /(都|道|府|県).{0,12}(市|区|郡).{0,12}(町|丁目|番地|番|号)/,
  },
  {
    id: "confidential",
    level: "warn",
    label: "社外秘・機密を示す表現",
    pattern: /(社外秘|部外秘|機密|極秘|取扱注意|confidential|internal use only)/i,
  },
  {
    id: "my_number",
    level: "warn",
    label: "マイナンバーらしい数字",
    pattern: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/,
  },
];

export function scanForSensitive(text: string): PrivacyFinding[] {
  if (!text.trim()) return [];

  const findings: PrivacyFinding[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      findings.push({ id: rule.id, level: rule.level, label: rule.label });
    }
  }
  return findings;
}

/** 送信そのものを止めるか（要件 §7: 強く警告し、初期状態では送信不可）。 */
export function isBlocking(findings: PrivacyFinding[]): boolean {
  return findings.some((finding) => finding.level === "block");
}

/** 画面に出す見出し。固定文にする（憲章 原則 IV）。 */
export const PRIVACY_COPY = {
  title: "送る前に確認してください",
  body: "個人情報や会社の非公開情報が含まれていないか確認してください。",
  blockedBody:
    "パスワード・APIキー・カード番号は、一度送ると取り消せません。消してから送りましょう。",
  edit: "内容を修正する",
  send: "確認して送信する",
} as const;
