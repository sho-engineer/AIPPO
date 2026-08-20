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
  IconArrowDown,
  IconCheckCircle,
  IconDocument,
  IconPlay,
  IconSparkle,
} from "../../Icons";
import { diffSentences } from "../../../lib/diff";
import { fitsSideBySide } from "../../../course/compareLayout";

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

  /*
    ほとんど全部が「変わった」ときは、印を付けない。

    条件を足すと文が丸ごと書き直されることがあり、そのときは
    段落まるごとが太字の青になる。全部が目立つのは、何も目立たないのと
    同じで、しかも読みにくいだけになる。
    7割を超えたら「全体が変わった」と見なして、素のまま出す。
  */
  const addedLength = improvedParts
    .filter((part) => part.kind === "added")
    .reduce((total, part) => total + part.text.length, 0);
  const markWorthwhile =
    improved.length > 0 && addedLength / improved.length <= 0.7;

  /*
    横に並べるか、縦に積むか。決め方は compareLayout.ts に書いてある
    （1行に何文字入るかで決める）。ここでは結果だけ使う。

    広い画面（sm 以上）はいつでも横。狭い画面では、両方が短いときだけ横。
  */
  const bothShort = fitsSideBySide(first, improved);

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
      <section
        className="rounded-panel border border-line bg-surface p-4 shadow-card"
        data-layout={bothShort ? "side-or-stack" : "stack"}
      >
        <div
          className={
            bothShort
              ? // 短いので、狭い画面でも横に並べる
                "flex flex-row items-start gap-3"
              : // 長いので、広い画面（sm 以上）になってから横に並べる
                "sm:flex sm:flex-row sm:items-start sm:gap-3"
          }
        >
          <div className="min-w-0 flex-1">
            <h3
              className="flex items-center gap-1.5 text-sm font-bold text-brand"
              data-testid="result-first-heading"
            >
              <IconSparkle className="h-4 w-4 shrink-0" />
              最初のAI結果
            </h3>
            <p
              data-testid="result-first"
              className="mt-2 whitespace-pre-wrap break-words rounded-card bg-canvas
                         p-3.5 text-sm leading-7"
            >
              {first || "（まだありません）"}
            </p>
          </div>

        {/*
          あいだに「何を足したか」を置く。
          矢印だけだと、勝手に変わったように見える。

          横に並んだときは、矢印も横を向く（下向きのまま横に置くと、
          どちらからどちらへ変わったのか読めない）。
        */}
          {/*
            矢印は、並びに合わせて向きを変える。
            横に並んでいるのに下向きだと、どちらからどちらへ変わったのか
            読めない。縦のときは下向き、横のときは右向き。
          */}
          <div
            className={`flex shrink-0 flex-col items-center gap-2 ${
              bothShort ? "my-0 self-center" : "my-3 sm:my-0 sm:self-center"
            }`}
          >
            <IconArrowDown
              aria-hidden="true"
              className={`h-5 w-5 text-brand ${
                bothShort ? "-rotate-90" : "sm:-rotate-90"
              }`}
            />
            {condition && (
              <p
                className="rounded-badge bg-brand-soft px-3 py-1 text-xs font-bold
                           text-brand-dark"
                data-testid="added-condition"
              >
                追加した条件：{condition}
              </p>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-brand-dark">
              <IconCheckCircle className="h-4 w-4 shrink-0 text-brand" />
              {condition ? `改善後（${condition}）` : "改善後"}
            </h3>
            <p
              data-testid="result-improved"
              className="mt-2 whitespace-pre-wrap break-words rounded-card border
                         border-brand-line bg-brand-soft/40 p-3.5 text-sm leading-7"
            >
              {!improved
                ? "（まだありません）"
                : markWorthwhile
                  ? marked(improvedParts)
                  : improved}
            </p>
          </div>
        </div>
      </section>

      {/* 何が変わったか。測って分かることだけを出す */}
      <div className="mt-3">
        <ChangePoints before={first} after={improved} condition={condition} />
      </div>

      {/* 何が変わったかは、1回目と改善後の差で見せる */}
      <details className="mt-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
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

      {/*
        元の文章から、ここまでの道のり。

        2つ並べただけだと「AIが何かした」で終わる。
        自分が書いた文から2手かかっていることは、3つ並べて初めて分かる。
      */}
      <ol className="mt-3 flex items-stretch gap-1" role="list">
        {[
          { id: "original" as const, label: "元の文章", body: original, icon: IconDocument },
          { id: "first" as const, label: "1回目", body: first, icon: IconSparkle },
          { id: "improved" as const, label: "改善後", body: improved, icon: IconCheckCircle },
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
                className={`flex items-center gap-1 text-[0.6875rem] font-bold ${
                  panel.id === "improved" ? "text-brand-dark" : "text-ink-muted"
                }`}
              >
                <panel.icon className="h-3.5 w-3.5 shrink-0" />
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
    </div>
  );
}

// --------------------------------------------------------- 変わったところ

/**
 * 何が変わったかを、確かめられたことだけ並べる。
 *
 * ここに出すのは**測って分かることだけ**にしている。
 * 支給デザインには「要点が先に来るようになりました」「全体の表現が
 * わかりやすくなりました」といった行が並んでいるが、それは文章を読んで
 * 下す判断で、こちらでは確かめられない。確かめられないことを断定して
 * 出すと、外れたときに「このアプリの言うことは当てにならない」に変わる。
 *
 * 代わりに、数えれば分かること（文字数・行の分かれ方・箇条書きか）を、
 * 同じ形の文にして出す。「どう変わったと感じたか」は observation の
 * ステップで本人に選んでもらっている。
 *
 * 選んだ条件はここに入れない。条件は矢印の下の札
 * （「追加した条件：もっと短く」）で、原因の側として先に出している。
 * 同じことを原因と結果の両方に置くと、2つ起きたように読める。
 */
export function ChangePoints({
  before,
  after,
}: {
  before: string;
  after: string;
  /** 受け取るが出さない。呼び出し側の形を変えないために残している。 */
  condition?: string;
}) {
  const points: string[] = [];

  const diff = after.length - before.length;
  const rate = before.length === 0 ? 0 : Math.abs(diff) / before.length;
  // 1割に満たない差は「変わった」と言わない。誤差の範囲
  if (rate >= 0.1) {
    points.push(
      diff < 0
        ? `${Math.round(rate * 100)}% 短くなりました`
        : `${Math.round(rate * 100)}% 長くなりました`,
    );
  }

  const lines = (text: string) => text.split("\n").filter((line) => line.trim()).length;
  const isBulleted = (text: string) =>
    text.split("\n").filter((line) => /^\s*[・\-*•]|^\s*\d+[.)]/.test(line)).length >= 2;

  if (!isBulleted(before) && isBulleted(after)) points.push("箇条書きになりました");
  else if (lines(after) > lines(before)) points.push("行が分かれました");

  if (points.length === 0) return null;

  return (
    <section
      className="rounded-panel border border-line bg-surface p-4 shadow-card"
      data-testid="change-points"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-bold">
        <IconSparkle className="h-4 w-4 shrink-0 text-brand" />
        変わったところ
      </h3>
      <ul className="mt-2.5 space-y-2" role="list">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm leading-6">
            {/*
              印は緑にする。青はこの画面じゅうで使っているので、
              「確かめた事実」だけ色を変えると、拾い読みできる。
            */}
            <IconCheckCircle className="mt-1 h-4 w-4 shrink-0 text-accent-teal" />
            {point}
          </li>
        ))}
      </ul>
    </section>
  );
}
