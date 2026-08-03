/**
 * 振り返りと完了（AIPPO 開発概要 §10 Step 8 / §3 step 8-9）。
 *
 * - できるようになったことを示す
 * - 成果物をコピーできる
 * - 簡易アンケート（§11 必須機能）
 * - 次に試せる用途を提案する（§3 step 9）
 */

import { useState } from "react";

import { BUTTONS } from "../content/ui";

export interface SurveyQuestion {
  key: string;
  question: string;
  choices: { value: string; label: string }[];
}

/** MVP の検証項目のうち、アプリ内イベントでは測れないものを聞く。 */
export const SURVEY_QUESTIONS: readonly SurveyQuestion[] = [
  {
    key: "got_lost",
    question: "途中で「次に何をすればいいか分からない」と感じた場面はありましたか？",
    choices: [
      { value: "no", label: "なかった" },
      { value: "once", label: "1回あった" },
      { value: "many", label: "何度かあった" },
    ],
  },
  {
    key: "will_reuse",
    question: "この先1週間のうちに、またAIを使ってみようと思いますか？",
    choices: [
      { value: "yes", label: "使うと思う" },
      { value: "maybe", label: "たぶん使う" },
      { value: "no", label: "使わないと思う" },
    ],
  },
  {
    key: "want_more",
    question: "次のレッスンも学んでみたいですか？",
    choices: [
      { value: "yes", label: "学びたい" },
      { value: "maybe", label: "内容による" },
      { value: "no", label: "いまはいい" },
    ],
  },
  {
    key: "would_pay",
    question: "こうした学習が有料プランにあったら、使ってみたいですか？",
    choices: [
      { value: "yes", label: "興味がある" },
      { value: "maybe", label: "内容と価格による" },
      { value: "no", label: "興味はない" },
    ],
  },
] as const;

export type CompletionViewProps = {
  /** できるようになったこと。 */
  achievements: readonly string[];
  /** コピーできる成果物。 */
  resultText: string;
  /** 次に試せる用途。 */
  nextSuggestion: string;
  onSubmitSurvey: (answers: Record<string, string>) => void;
  /** もう一度はじめから試す。渡さないとボタンを出さない。 */
  onRestart?: () => void;
};

export function CompletionView({
  achievements,
  resultText,
  nextSuggestion,
  onSubmitSurvey,
  onRestart,
}: CompletionViewProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [surveySent, setSurveySent] = useState(false);

  const allAnswered = SURVEY_QUESTIONS.every((q) => answers[q.key]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
    } catch {
      // クリップボードが使えない環境でも操作は止めない
      setCopied(false);
    }
  }

  function handleAnswer(key: string, value: string) {
    const updated = { ...answers, [key]: value };
    setAnswers(updated);
    if (SURVEY_QUESTIONS.every((q) => updated[q.key])) {
      onSubmitSurvey(updated);
      setSurveySent(true);
    }
  }

  return (
    <div data-testid="completion-view">
      <h2 className="text-lg font-bold">できるようになりました</h2>

      <ul className="mt-4 grid gap-2" role="list">
        {achievements.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-6">
            <span aria-hidden="true">✓</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <section className="mt-8">
        <h3 className="text-sm font-bold">できあがった文章</h3>
        <p className="mt-2 whitespace-pre-wrap rounded-xl border border-line
                      bg-surface p-4 text-sm leading-7">
          {resultText}
        </p>
        <button
          type="button"
          onClick={handleCopy}
          className="mt-3 rounded-xl bg-brand px-5 py-3 text-sm text-white"
        >
          {BUTTONS.copy}
        </button>
        {copied ? (
          <span className="ml-3 text-xs text-ink-muted" role="status">
            コピーしました
          </span>
        ) : null}
      </section>

      <section className="mt-10 rounded-2xl bg-brand-soft p-5">
        <h3 className="text-sm font-bold">最後に、4つだけ教えてください</h3>
        <p className="mt-1 text-xs text-ink-muted">
          今後の改善に使います。答えなくても大丈夫です。
        </p>

        <div className="mt-4 grid gap-5">
          {SURVEY_QUESTIONS.map((q) => (
            <fieldset key={q.key}>
              <legend className="text-sm">{q.question}</legend>
              <ul className="mt-2 flex flex-wrap gap-2" role="list">
                {q.choices.map((choice) => {
                  const isSelected = answers[q.key] === choice.value;
                  return (
                    <li key={choice.value}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => handleAnswer(q.key, choice.value)}
                        className={[
                          "chip",
                          isSelected ? "chip-on" : "chip-off",
                        ].join(" ")}
                      >
                        {choice.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
        </div>

        {surveySent && allAnswered ? (
          <p className="mt-4 text-xs text-ink-muted" role="status">
            ありがとうございました。
          </p>
        ) : null}
      </section>

      <section className="mt-8">
        <h3 className="text-sm font-bold">次に試せること</h3>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          {nextSuggestion}
        </p>

        {/*
          レッスンは1本しかないので、ここで終わると行き止まりになる。
          いちばん乗り気になっている人が「もう一度やってみたい」と思ったときに
          戻る道が無いのは、原則 I に反する。
        */}
        {onRestart ? (
          <button
            type="button"
            data-testid="restart-lesson"
            onClick={onRestart}
            className="mt-4 rounded-xl border border-line bg-surface px-5 py-2.5 text-sm"
          >
            {BUTTONS.restart}
          </button>
        ) : null}
      </section>
    </div>
  );
}
