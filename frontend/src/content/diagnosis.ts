/**
 * AI活用診断の質問（AIPPO 開発概要 §11）。
 *
 * 設計判断 Q-1 により、MVP は3問の選択式に絞る。
 * 自由入力なし、スコアリングなし。
 * 診断の精度は実際に使ってもらった後でないと検証できないため、
 * 先に作り込まず、まず1レッスンを完成させることを優先する。
 *
 * 質問文は固定文言（憲章 原則 IV）。専門用語を使わない（原則 I）。
 */

export type DiagnosisQuestionKey = "job_category" | "ai_experience" | "pain_point";

export interface DiagnosisChoice {
  value: string;
  label: string;
}

export interface DiagnosisQuestion {
  key: DiagnosisQuestionKey;
  /** 画面に出す問いかけ。ポーが話しかける形にする。 */
  question: string;
  choices: DiagnosisChoice[];
}

export const DIAGNOSIS_QUESTIONS: readonly DiagnosisQuestion[] = [
  {
    key: "job_category",
    question: "お仕事に近いものはどれですか？",
    choices: [
      { value: "sales", label: "営業・接客" },
      { value: "admin", label: "事務・管理" },
      { value: "planning", label: "企画・マーケティング" },
      { value: "other", label: "そのほか" },
    ],
  },
  {
    key: "ai_experience",
    question: "AIを使ったことはありますか？",
    choices: [
      { value: "none", label: "使ったことがない" },
      { value: "tried", label: "数回だけ使った" },
      { value: "occasional", label: "ときどき使う" },
      { value: "regular", label: "日常的に使う" },
    ],
  },
  {
    key: "pain_point",
    question: "いま、いちばん面倒に感じていることはどれですか？",
    choices: [
      { value: "writing", label: "文章を書く・直す" },
      { value: "summarizing", label: "長い資料をまとめる" },
      { value: "researching", label: "情報を調べる" },
      { value: "organizing", label: "数字や表を整理する" },
    ],
  },
] as const;

export type DiagnosisAnswers = Partial<Record<DiagnosisQuestionKey, string>>;

export type CompletedDiagnosisAnswers = Record<DiagnosisQuestionKey, string>;

/** 3問すべてに答えたか。 */
export function isComplete(
  answers: DiagnosisAnswers,
): answers is CompletedDiagnosisAnswers {
  return DIAGNOSIS_QUESTIONS.every((q) => Boolean(answers[q.key]));
}

/** まだ答えていない最初の設問。すべて答え終わっていれば null。 */
export function nextUnanswered(
  answers: DiagnosisAnswers,
): DiagnosisQuestion | null {
  return DIAGNOSIS_QUESTIONS.find((q) => !answers[q.key]) ?? null;
}

export const DIAGNOSIS_COPY = {
  title: "まず、3つだけ教えてください",
  subtitle: "あなたに合いそうなAIの使い道を、一緒に見つけます。",
  progress: (current: number, total: number) => `${current} / ${total}`,
  resultTitle: "あなたに合いそうな使い道です",
  resultLead: "まずは一つだけ、実際に試してみましょう。",
  comingSoon: "このあと追加予定",
} as const;
