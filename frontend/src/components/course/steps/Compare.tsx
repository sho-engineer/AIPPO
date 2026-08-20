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

import { Fragment } from "react";

import {
  IconCheckCircle,
  IconChevronRight,
  IconPlay,
  IconSparkle,
} from "../../Icons";
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
  /**
   * 改善後の列だけ、変わった文を目立たせる。
   *
   * 3つ並べても、初心者はどこが違うか自力では追えない。
   * ただし色だけに頼らず、太字も併せる（要件 §6.12）。
   */
  const improvedParts = diffSentences(first, improved).filter(
    (part) => part.kind !== "removed",
  );

  const marked = (parts: { kind: string; text: string }[]) => (
    <>
      {parts.map((part, index) =>
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
  );

  return (
    <div data-testid="result-compare">
      {/*
        最初の結果と、条件を足したあと。**横に並べる**。

        前は札で切り替える形にしていた。切り替えだと、片方を見ている間
        もう片方は消えているので、結局どこが変わったのかは記憶で比べる
        ことになる。狭い画面でも、並べたほうが分かる。
      */}
      <section className="rounded-panel border border-line bg-surface p-4 shadow-card">
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1" data-testid="result-first">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-brand">
              <IconSparkle className="h-4 w-4 shrink-0" />
              最初のAI結果
            </h3>
            <p className="mt-2 whitespace-pre-wrap break-words border-t border-line pt-2
                          text-xs leading-6">
              {first || "（まだありません）"}
            </p>
          </div>

          {/* 左から右へ変わったこと。向きを1つ置くだけで伝わる */}
          <span
            aria-hidden="true"
            className="flex shrink-0 items-center text-brand"
          >
            <IconChevronRight className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1" data-testid="result-improved">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-brand-dark">
              <IconCheckCircle className="h-4 w-4 shrink-0 text-brand" />
              {condition ? `改善後（${condition}）` : "改善後"}
            </h3>
            <p className="mt-2 whitespace-pre-wrap break-words border-t border-line pt-2
                          text-xs leading-6">
              {improved ? marked(improvedParts) : "（まだありません）"}
            </p>
          </div>
        </div>

        {/*
          何が変わったか。比べている面の中に入れる。
          離して置くと、何と何を比べた結果なのかが結び付かない。
        */}
        <div className="mt-3 border-t border-line pt-3">
          <ChangePoints before={first} after={improved} condition={condition} />
        </div>
      </section>

      {/*
        元の文章から、ここまでの道のり。

        2つ並べただけだと「AIが何かした」で終わる。
        自分が書いた文から2手かかっていることは、3つ並べて初めて分かる。
      */}
      <ol className="mt-3 flex items-stretch gap-1" role="list">
        {[
          { id: "original" as const, label: "元の文章", body: original },
          { id: "first" as const, label: "1回目", body: first },
          { id: "improved" as const, label: "改善後", body: improved },
        ].map((panel, index) => (
          <Fragment key={panel.id}>
            {index > 0 && (
              <span
                aria-hidden="true"
                className="flex shrink-0 items-center text-brand-line"
              >
                <IconPlay className="h-4 w-4" />
              </span>
            )}
            <li
              data-testid={`compare-${panel.id}`}
              className={`min-w-0 flex-1 rounded-card border p-2.5 ${
                panel.id === "improved"
                  ? "border-brand bg-brand-soft/60"
                  : "border-line bg-surface"
              }`}
            >
              <p
                className={`text-[0.6875rem] font-bold ${
                  panel.id === "improved" ? "text-brand-dark" : "text-ink-muted"
                }`}
              >
                {panel.label}
              </p>
              {/*
                ここは道のりの目印なので、全文は出さない。
                3列に全文を入れると、1列が細長い柱になって読めない。
              */}
              <p className="mt-1 line-clamp-3 break-words text-[0.6875rem] leading-5 text-ink-muted">
                {panel.body || "（入力なし）"}
              </p>
            </li>
          </Fragment>
        ))}
      </ol>

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
      className="flex flex-wrap items-center gap-2"
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

