/**
 * 見比べる画面。
 *
 * 元の文章・1回目・条件を足した2回目を、縦に並べて見せる。
 * 横に並べると、スマホでは1列ぶんの幅が足りず、どちらも読めなくなる。
 *
 * StepViews から切り出した。ここはこのアプリで一番大事な気づきの場面
 * （条件を1つ足すと結果が変わる、を体で分かるところ）なので、
 * 他のステップの都合で読みにくくならないよう、独立させてある。
 */

import { Fragment, useState } from "react";

import { IconPlay, IconSparkle } from "../../Icons";
import { diffSentences } from "../../../lib/diff";

// --------------------------------------------------------- 3段階の比較

/**
 * 元の文章 → 1回目 → 条件を足したあと。
 *
 * 2つだけ見せると「AIが何かした」で終わる。
 * 3つ並べて初めて、**条件を足すと動く**ことが分かる。
 */
export function ThreeWayCompare({
  original,
  first,
  improved,
  condition,
}: {
  original: string;
  first: string;
  improved: string;
  condition: string;
}) {
  const [tab, setTab] = useState<"original" | "first" | "improved">("improved");

  /**
   * 改善後の列だけ、変わった文を目立たせる。
   *
   * 3つ並べても、初心者はどこが違うか自力では追えない。
   * ただし色だけに頼らず、太字も併せる（要件 §6.12）。
   */
  const improvedParts = diffSentences(first, improved).filter(
    (part) => part.kind !== "removed",
  );

  const panels = [
    { id: "original" as const, label: "元の文章", body: original, tone: "border-line" },
    { id: "first" as const, label: "1回目", body: first, tone: "border-line" },
    {
      id: "improved" as const,
      label: condition ? `改善後（${condition}）` : "改善後",
      body: improved,
      tone: "border-brand",
      parts: improvedParts,
    },
  ];

  const render = (panel: (typeof panels)[number]) =>
    panel.parts ? (
      <>
        {panel.parts.map((part, index) =>
          part.kind === "added" ? (
            <mark
              key={index}
              className="rounded bg-brand-soft px-0.5 font-bold text-brand-dark"
            >
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </>
    ) : (
      panel.body || "（入力なし）"
    );

  return (
    <div data-testid="result-compare">
      {/* 狭い画面：タブ */}
      <div className="sm:hidden">
        <div role="tablist" className="flex gap-1.5">
          {panels.map((panel) => (
            <button
              key={panel.id}
              role="tab"
              type="button"
              aria-selected={tab === panel.id}
              onClick={() => setTab(panel.id)}
              className={`chip flex-1 text-xs ${
                tab === panel.id ? "chip-on" : "chip-off"
              }`}
            >
              {panel.label}
            </button>
          ))}
        </div>
        <section className="mt-3 rounded-card border border-line bg-surface p-4">
          <p className="whitespace-pre-wrap break-words text-sm leading-7">
            {render(panels.find((panel) => panel.id === tab)!)}
          </p>
        </section>
      </div>

      {/*
        広い画面：3つ並べ、あいだに向きを置く。
        ただ横に並べるだけだと「3つある」で終わり、
        左から右へ変わっていったことが読み取れない。
      */}
      <div className="hidden items-stretch gap-1 sm:flex">
        {panels.map((panel, index) => (
          <Fragment key={panel.id}>
            {index > 0 && (
              <span
                aria-hidden="true"
                className="flex shrink-0 items-center text-brand-line"
              >
                <IconPlay className="h-5 w-5" />
              </span>
            )}
            <section
              data-testid={`compare-${panel.id}`}
              className={`flex-1 rounded-card bg-surface p-4 shadow-card ${
                panel.id === "improved" ? "ring-2 ring-brand" : ""
              }`}
            >
              <h3
                className={`text-xs font-bold ${
                  panel.id === "improved" ? "text-brand-dark" : "text-ink-muted"
                }`}
              >
                {panel.label}
              </h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">
                {render(panel)}
              </p>
            </section>
          </Fragment>
        ))}
      </div>

      {/* 何が変わったか。測って分かることだけを出す */}
      <div className="mt-4">
        <ChangePoints before={first} after={improved} condition={condition} />
      </div>

      {/* 何が変わったかは、1回目と改善後の差で見せる */}
      <details className="mt-4 rounded-card border border-line bg-surface px-4 py-3">
        <summary className="cursor-pointer text-xs font-bold text-ink-muted">
          変わったところを見る
        </summary>
        <p className="mt-3 text-sm leading-7">
          {diffSentences(first, improved).map((part, index) =>
            part.kind === "same" ? (
              <span key={index}>{part.text}</span>
            ) : (
              <span
                key={index}
                className={
                  part.kind === "added"
                    ? "rounded bg-brand-soft px-1 font-bold text-brand-dark"
                    : "rounded bg-caution-soft px-1 text-caution line-through"
                }
              >
                {part.kind === "added" ? "＋" : "−"}
                {part.text}
              </span>
            ),
          )}
        </p>
      </details>
    </div>
  );
}

// --------------------------------------------------------- 変わったポイント

/**
 * 何が変わったかを短い札で示す。
 *
 * ここに出すのは**測って分かることだけ**にしている。
 * 支給デザインには「丁寧」「要点が先に来た」といった札が並んでいるが、
 * それは文章を読んで下す判断で、こちらでは確かめられない。
 * 確かめられないことを断定して出すと、外れたときに
 * 「このアプリの言うことは当てにならない」に変わる。
 *
 * 代わりに、本人が選んだ条件（事実）と、数えれば分かること
 * （文字数・行の分かれ方）を出す。「どう変わったと感じたか」は
 * observation のステップで本人に選んでもらっている。
 */
export function ChangePoints({
  before,
  after,
  condition,
}: {
  before: string;
  after: string;
  condition: string;
}) {
  const points: string[] = [];

  if (condition) points.push(condition);

  const diff = after.length - before.length;
  const rate = before.length === 0 ? 0 : Math.abs(diff) / before.length;
  // 1割に満たない差は「変わった」と言わない。誤差の範囲
  if (rate >= 0.1) {
    points.push(
      diff < 0
        ? `${Math.round(rate * 100)}% 短くなった`
        : `${Math.round(rate * 100)}% 長くなった`,
    );
  }

  const lines = (text: string) => text.split("\n").filter((line) => line.trim()).length;
  const isBulleted = (text: string) =>
    text.split("\n").filter((line) => /^\s*[・\-*•]|^\s*\d+[.)]/.test(line)).length >= 2;

  if (!isBulleted(before) && isBulleted(after)) points.push("箇条書きになった");
  else if (lines(after) > lines(before)) points.push("行が分かれた");

  if (points.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-card bg-canvas px-4 py-3"
      data-testid="change-points"
    >
      <span className="flex items-center gap-2 text-xs font-bold">
        <IconSparkle className="h-4 w-4 shrink-0 text-brand" />
        変わったポイント
      </span>
      <ul className="flex flex-wrap gap-2" role="list">
        {points.map((point) => (
          <li
            key={point}
            className="rounded-badge bg-brand-soft px-3 py-1 text-xs text-brand-dark"
          >
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

