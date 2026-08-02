/**
 * 固定文言。
 *
 * AIPPO 開発概要 §17 により、AI生成でない文言はここへ集約し、
 * コンポーネント内にハードコードしない。
 * 専門用語（プロンプト・トークン・モデル・API 等）を含めない。
 */

export const BRAND = {
  name: "AIPPO",
  reading: "アイッポ",
  headline: "AIが気になる。でも、何をすればいいか分からない人へ。",
  subHeadline:
    "AIPPOは、実際にAIを触りながら、自分に合った使い道を見つけられるハンズオン学習アプリです。",
  tagline: "AIの最初の一歩を、ハンズオンで。",
  tutorName: "ポー",
} as const;

/** ポーの初回メッセージ（AIPPO 開発概要 §6）。 */
export const POE_GREETING =
  "はじめまして、ポーです。\n" +
  "AIに興味はあるけれど、何から始めればいいか分からなくても大丈夫です。\n" +
  "まずは、あなたに合いそうな使い方を一緒に見つけましょう。";

export const BUTTONS = {
  start: "はじめる",
  next: "次へ",
  back: "ひとつ前にもどる",
  submit: "AIに送る",
  retry: "もう一度おくる",
  cancel: "やめる",
  complete: "完了する",
  copy: "結果をコピーする",
  useSample: "用意された例文で試す",
} as const;

export const WAITING = {
  short: "AIが考えています。少しお待ちください。",
  long: "少し時間がかかっています。そのままお待ちください。",
  tooLong: "うまく届かなかったようです。もう一度おくってみましょう。",
} as const;

export const ERRORS = {
  network: "うまく届かなかったようです。もう一度おくってみましょう。",
  requiredField: (label: string) => `${label}を入力してみましょう。`,
  tooLong: (max: number) => `文章は${max}文字までにしてみましょう。`,
  emptyRealTask: "使いたい文章をひとつ入力してみましょう。",
  outOfScope:
    "この内容はこのレッスンの範囲から少し外れています。用意された例文で試してみましょう。",
  attemptLimit:
    "今回の練習ではこれ以上AIを実行できません。少し時間をおいてから、もう一度お試しください。",
} as const;

export const FALLBACK_TUTOR_MESSAGE =
  "誰が読む文章なのかを伝えると、AIの回答が変わります。";

/** 安全上の注意（AIPPO 開発概要 §15）。固定文で出す。 */
export const SAFETY = {
  beforeInput: "会社の秘密や個人情報は入力しないようにしましょう。",
  checkFacts: "数字・日付・固有名詞は、AIの回答をそのまま信じず確認しましょう。",
  expertAdvice:
    "医療・法律・お金に関わる大事な判断は、専門家にも確認しましょう。",
} as const;

export const LIMITS = {
  maxUserInputLength: 5000,
  waitingLongMs: 15_000,
  waitingTooLongMs: 30_000,
} as const;
