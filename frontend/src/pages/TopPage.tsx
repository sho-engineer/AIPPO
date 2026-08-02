/**
 * トップ画面（AIPPO 開発概要 §18 Phase 1）。
 *
 * ブランド・キャッチコピー・診断への導線。
 * ユーザーが次に取る行動は「はじめる」の1つだけ（憲章 原則 I）。
 */

import { PoeAvatar } from "../components/PoeAvatar";
import { BRAND, POE_GREETING } from "../content/ui";

export type TopPageProps = {
  onStart: () => void;
};

export function TopPage({ onStart }: TopPageProps) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 pb-48 sm:pb-16">
      <p className="text-sm tracking-[0.3em] text-neutral-600">
        {BRAND.name}
      </p>
      <p className="mt-1 text-xs text-neutral-600">{BRAND.reading}</p>

      <h1 className="mt-8 text-2xl font-bold leading-relaxed sm:text-3xl">
        {BRAND.headline}
      </h1>
      <p className="mt-4 text-sm leading-7 text-neutral-600">
        {BRAND.subHeadline}
      </p>

      <button
        type="button"
        onClick={onStart}
        className="mt-10 w-full rounded-xl bg-neutral-900 px-6 py-4 text-white
                   sm:w-auto"
      >
        はじめる
      </button>

      <p className="mt-4 text-xs text-neutral-600">
        3つの質問に答えるだけ。登録は必要ありません。
      </p>

      <p className="mt-16 text-xs tracking-wide text-neutral-600">
        {BRAND.tagline}
      </p>

      <PoeAvatar
        tutor={{
          message: POE_GREETING.replace(/\n/g, ""),
          emotion: "neutral",
          action: "wait",
        }}
      />
    </main>
  );
}
