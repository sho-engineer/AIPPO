/**
 * AI活用診断（AIPPO 開発概要 §11 / §18 Phase 1）。
 *
 * 設計判断 Q-1 により3問の選択式。1画面に1問だけ出す。
 * 選ぶと自動で次の問いへ進むため、「次へ」ボタンは置かない
 * ＝ ユーザーが取る行動は常に1つ（憲章 原則 I）。
 *
 * Phase 1 は固定レスポンス。AI も バックエンドも呼ばない。
 */

import { useState } from "react";

import { ChoiceList } from "../components/ChoiceList";
import { PoeAvatar } from "../components/PoeAvatar";
import {
  fetchRecommendations,
  type UseCaseRecommendation,
} from "../api/diagnosis";
import {
  DIAGNOSIS_COPY,
  DIAGNOSIS_QUESTIONS,
  isComplete,
  nextUnanswered,
  type DiagnosisAnswers,
} from "../content/diagnosis";
import {
  DIAGNOSIS_COMPLETE_POE,
  DIAGNOSIS_POE,
  THINKING_POE,
} from "../lesson/machine";

export type DiagnosisPageProps = {
  onSelectLesson: (lessonId: string) => void;
};

export function DiagnosisPage({ onSelectLesson }: DiagnosisPageProps) {
  const [answers, setAnswers] = useState<DiagnosisAnswers>({});
  const [recommendations, setRecommendations] = useState<
    UseCaseRecommendation[] | null
  >(null);

  const current = nextUnanswered(answers);
  const answeredCount = DIAGNOSIS_QUESTIONS.filter((q) =>
    Boolean(answers[q.key]),
  ).length;
  const currentNumber = Math.min(answeredCount + 1, DIAGNOSIS_QUESTIONS.length);

  async function handleSelect(value: string) {
    if (current === null) return;

    const updated = { ...answers, [current.key]: value };
    setAnswers(updated);

    if (isComplete(updated)) {
      setRecommendations(await fetchRecommendations(updated));
    }
  }

  if (recommendations !== null) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12 pb-48 sm:pb-12">
        <h1 className="text-xl font-bold">{DIAGNOSIS_COPY.resultTitle}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {DIAGNOSIS_COPY.resultLead}
        </p>

        <ul className="mt-8 grid gap-4" role="list">
          {recommendations.map((item) => (
            <li
              key={item.lessonId}
              className="rounded-2xl border border-neutral-200 bg-white p-5"
            >
              <h2 className="text-base font-bold">{item.headline}</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                {item.description}
              </p>

              {item.available ? (
                <button
                  type="button"
                  onClick={() => onSelectLesson(item.lessonId)}
                  className="mt-4 w-full rounded-xl bg-neutral-900 px-5 py-3
                             text-sm text-white sm:w-auto"
                >
                  これを試す
                </button>
              ) : (
                <p className="mt-4 text-xs text-neutral-600">
                  {DIAGNOSIS_COPY.comingSoon}
                </p>
              )}
            </li>
          ))}
        </ul>

        <PoeAvatar tutor={DIAGNOSIS_COMPLETE_POE} />
      </main>
    );
  }

  // 3問目に答えた直後、おすすめ用途が返るまでの間。
  // ここを描き分けないと、設問も結果も無い状態で落ちる。
  if (current === null) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12 pb-48 sm:pb-12">
        <p className="text-sm text-neutral-600" role="status">
          あなたに合いそうな使い道を探しています。
        </p>
        <PoeAvatar tutor={THINKING_POE} />
      </main>
    );
  }

  const question = current;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 pb-48 sm:pb-12">
      <p className="text-xs text-neutral-600">
        {DIAGNOSIS_COPY.progress(currentNumber, DIAGNOSIS_QUESTIONS.length)}
      </p>
      <h1 className="mt-2 text-xl font-bold">{DIAGNOSIS_COPY.title}</h1>
      <p className="mt-2 text-sm text-neutral-600">{DIAGNOSIS_COPY.subtitle}</p>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold">{question.question}</h2>
        <ChoiceList
          name={question.key}
          choices={question.choices}
          selected={answers[question.key] ?? null}
          onSelect={handleSelect}
        />
      </section>

      <PoeAvatar tutor={DIAGNOSIS_POE} />
    </main>
  );
}
