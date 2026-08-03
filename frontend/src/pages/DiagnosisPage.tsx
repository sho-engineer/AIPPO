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

import { BrandLogo } from "../components/BrandLogo";
import { ChoiceList } from "../components/ChoiceList";
import { PoeAvatar } from "../components/PoeAvatar";
import {
  fetchRecommendations,
  saveProfile,
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
      // 保存は待たない。診断は本題ではないので、失敗しても先へ進める。
      void saveProfile(updated);
      setRecommendations(await fetchRecommendations(updated));
    }
  }

  if (recommendations !== null) {
    const available = recommendations.filter((item) => item.available);
    const upcoming = recommendations.filter((item) => !item.available);

    return (
      <main className="mx-auto max-w-2xl px-6 pb-48 pt-8 sm:pb-12">
        <BrandLogo className="h-8" />

        <h1 className="mt-8 text-2xl font-bold">{DIAGNOSIS_COPY.resultTitle}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {DIAGNOSIS_COPY.resultLead}
        </p>

        {/*
          いま試せるものと、これから作るものを **同じ見た目にしない**。
          同じ重みで並べると、どれを選べばよいか分からなくなる（憲章 原則 I）。
        */}
        <ul className="mt-8 grid gap-4" role="list">
          {available.map((item) => (
            <li
              key={item.lessonId}
              className="rounded-[1.5rem] bg-brand p-7 text-white shadow-pop"
            >
              <h2 className="text-xl font-bold">{item.headline}</h2>
              <p className="mt-2 text-sm leading-7 text-white">
                {item.description}
              </p>
              <button
                type="button"
                onClick={() => onSelectLesson(item.lessonId)}
                className="mt-6 w-full rounded-2xl bg-white px-6 py-3.5 text-base
                           font-bold text-brand transition hover:bg-brand-soft sm:w-auto"
              >
                これを試す
              </button>
            </li>
          ))}
        </ul>

        {upcoming.length > 0 ? (
          <section className="mt-12">
            <h2 className="text-sm font-bold text-ink-muted">
              {DIAGNOSIS_COPY.comingSoon}
            </h2>
            <ul className="mt-3 grid gap-2" role="list">
              {upcoming.map((item) => (
                <li
                  key={item.lessonId}
                  className="border-l-2 border-brand-line pl-4 text-sm text-ink-muted"
                >
                  {item.headline}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <PoeAvatar tutor={DIAGNOSIS_COMPLETE_POE} />
      </main>
    );
  }

  // 3問目に答えた直後、おすすめ用途が返るまでの間。
  // ここを描き分けないと、設問も結果も無い状態で落ちる。
  if (current === null) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12 pb-48 sm:pb-12">
        <p className="text-sm text-ink-muted" role="status">
          あなたに合いそうな使い道を探しています。
        </p>
        <PoeAvatar tutor={THINKING_POE} />
      </main>
    );
  }

  const question = current;

  return (
    <main className="mx-auto max-w-2xl px-6 pb-48 pt-8 sm:pb-12">
      <BrandLogo className="h-8" />

      {/* あと何問かを、数字ではなく点の並びで見せる */}
      <div className="mt-8 flex items-center gap-2">
        {DIAGNOSIS_QUESTIONS.map((q, index) => (
          <span
            key={q.key}
            aria-hidden="true"
            className={`h-2 rounded-full transition-all ${
              index < currentNumber ? "w-8 bg-brand" : "w-2 bg-brand-line"
            }`}
          />
        ))}
        <span className="ml-1 text-xs text-ink-muted">
          {DIAGNOSIS_COPY.progress(currentNumber, DIAGNOSIS_QUESTIONS.length)}
        </span>
      </div>

      <h1 className="mt-4 text-2xl font-bold">{DIAGNOSIS_COPY.title}</h1>
      <p className="mt-2 text-sm text-ink-muted">{DIAGNOSIS_COPY.subtitle}</p>

      <section className="mt-8 rounded-[1.5rem] bg-surface p-7 shadow-card">
        <h2 className="text-lg font-bold">{question.question}</h2>
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
