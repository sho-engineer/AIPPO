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

import { useState } from "react";

import {
  IconArrowDown,
  IconCheckCircle,
  IconDocument,
  IconSparkle,
} from "../../Icons";
import { MoreButton, MoreSheet } from "../MoreSheet";
import { TeachingImage } from "../../lessons/TeachingImage";
import type { TeachingImageEntry } from "../../../course/teachingImages";
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
  picture = null,
}: {
  original: string;
  first: string;
  improved: string;
  condition: string;
  /**
   * 同じことを図で1枚。**開いた一枚の中に置く。**
   *
   * 自分の結果で見比べたあとの裏取りとして要るが、画面へ縦に積むと
   * 235px を取り、この画面がはみ出す一番の原因になっていた。
   */
  picture?: TeachingImageEntry | null;
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

  /*
    狭い画面で長い文が2つ来たとき、どう出すか。

    前は縦に積んでいた。読めはするが、1回目と改善後が画面2つぶん
    離れるので、**スクロールしないと見比べられない**——見比べる画面
    なのに、同時に見えない。

    そこでタブに切り替える。同じ場所で入れ替わるので、目を動かさずに
    差が分かる。短いときは今までどおり横に並べる（両方いっぺんに
    見えるほうが速い）。仕組みは observation の画面（Results.tsx の
    `ResultCompare`）と同じ。
  */
  const [tab, setTab] = useState<"first" | "improved">("improved");
  const [more, setMore] = useState(false);

  /*
    面の中の見出しは、**タブで切り替えているときは出さない**。
    すぐ上のタブが「最初 / 改善後」と同じことを言っていて、22px を
    使って二度言うぶん、肝心の本文が縮む。
  */
  const firstPanel = (heading = true) => (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {heading && (
      <h3
        className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-brand"
        data-testid="result-first-heading"
      >
        <IconSparkle className="h-4 w-4 shrink-0" />
        最初のAI結果
      </h3>
      )}
      {/*
        AIが返す長さは決まらない。**枠のほうで止める。**
        止めないと、長い回答が来た日だけ画面が伸びて、下のボタンが
        押せなくなる。長くてもこの面の中で送れる（画面は動かない）。
      */}
      <p
        data-testid="result-first"
        className="mt-2 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap
                   break-words rounded-card border border-line bg-surface p-3.5
                   text-sm leading-7"
      >
        {first || "（まだありません）"}
      </p>
    </div>
  );

  const improvedPanel = (heading = true) => (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {heading && (
      <h3 className="flex shrink-0 items-center gap-1.5 text-sm font-bold text-brand-dark">
        <IconCheckCircle className="h-4 w-4 shrink-0 text-brand" />
        {condition ? `改善後（${condition}）` : "改善後"}
      </h3>
      )}
      <p
        data-testid="result-improved"
        className="mt-2 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap
                   break-words rounded-card border border-brand-line
                   bg-brand-soft/40 p-3.5 text-sm leading-7"
      >
        {!improved
          ? "（まだありません）"
          : markWorthwhile
            ? marked(improvedParts)
            : improved}
      </p>
    </div>
  );

  const arrow = (
    <div
      className={`flex shrink-0 flex-col items-center gap-2 ${
        bothShort ? "my-0 self-center" : "my-3 sm:my-0 sm:self-center"
      }`}
    >
      {/*
        矢印は、並びに合わせて向きを変える。横に並んでいるのに下向きだと、
        どちらからどちらへ変わったのか読めない。
      */}
      <IconArrowDown
        aria-hidden="true"
        className={`h-5 w-5 text-brand ${bothShort ? "-rotate-90" : "sm:-rotate-90"}`}
      />
    </div>
  );

  return (
    /* 入りきらないときは、この面の中だけが送れる（理由は Results.tsx） */
    <div
      data-testid="result-compare"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      {/*
        外枠を外した。

        前は、囲った面の中に、また囲った本文の面が2つ入っていた。
        面が二重になると、外側の枠が何を囲っているのかが分からなくなる。

        ここで囲う意味があるのは**比べる2つの本文**のほうで、
        それを束ねる枠ではない（束ねているのは画面そのもの）。
      */}
      <section
        className="flex min-h-0 flex-1 flex-col"
        data-layout={bothShort ? "side-or-stack" : "tabs-or-side"}
      >
        {bothShort ? (
          // 両方短い。狭い画面でも横に並べたほうが速い
          <div className="flex min-h-[8rem] flex-1 flex-row items-stretch gap-3">
            {firstPanel()}
            {arrow}
            {improvedPanel()}
          </div>
        ) : (
          <>
            {/* 狭い画面：タブで入れ替える */}
            {/* 読める下限は縮む鎖の外側に置く（理由は Results.tsx） */}
            <div
              className="flex min-h-[8rem] flex-1 flex-col sm:hidden"
              data-testid="compare-tabs"
            >
              <div role="tablist" className="flex shrink-0 gap-2">
                {(["first", "improved"] as const).map((name) => (
                  <button
                    key={name}
                    role="tab"
                    type="button"
                    aria-selected={tab === name}
                    onClick={() => setTab(name)}
                    className={`chip flex-1 text-sm ${
                      tab === name ? "chip-on" : "chip-off"
                    }`}
                  >
                    {name === "first" ? "最初" : "改善後"}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex min-h-0 flex-1 flex-col">
                {tab === "first" ? firstPanel(false) : improvedPanel(false)}
              </div>
            </div>

            {/* 広い画面：並べる */}
            <div className="hidden min-h-[8rem] flex-1 sm:flex sm:flex-row sm:items-stretch sm:gap-3">
              {firstPanel()}
              {arrow}
              {improvedPanel()}
            </div>
          </>
        )}
      </section>

      {/*
        画面に残すのは「何を変えたか」だけ。

        比べた結果の読み解き（1文ずつの差分・どう変わったか・元の文章
        からの道のり）は、**確かめたい人だけが要る**もの。ここへ縦に
        積むと、この画面だけで8つの塊が並び、いちばん大事な
        「2つを見比べる」が上へ押し出される。押したら開く一枚へ移した。
      */}
      <div className="mt-3 shrink-0">
        <MoreButton testId="compare-more" onClick={() => setMore(true)}>
          変わったところを見る
        </MoreButton>
      </div>

      {more && (
        <MoreSheet title="変わったところ" onClose={() => setMore(false)}>
          <section
            className="flex items-center gap-3"
            data-testid="compare-why"
          >
            <h3 className="shrink-0 text-xs font-bold text-ink-muted">何を変えた？</h3>
            <p
              className="min-w-0 rounded-badge bg-brand-soft px-3 py-1 text-sm
                         font-bold text-brand-dark"
              data-testid="added-condition"
            >
              {condition || "条件は足していません"}
            </p>
          </section>

          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">どう変わった？</h3>
            <div className="mt-2">
              <ChangePoints before={first} after={improved} />
            </div>
          </section>

          {/*
            消えたところは、ここにしか出ない。上の改善後の面は
            **足された文**を目立たせるが、消えた文は出しようがない
            （そこにもう無いので）。足されたものと消えたものを並べる。
          */}
          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">1文ずつ見る</h3>
            <p className="mt-2 text-sm leading-7">
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
          </section>

          {picture && (
            <section className="mt-5 border-t border-line pt-4">
              <h3 className="text-xs font-bold text-ink-muted">図で見る</h3>
              <div className="mt-2">
                <TeachingImage
                  src={picture.src}
                  alt={picture.alt}
                  width={picture.width}
                  height={picture.height}
                />
              </div>
            </section>
          )}

          {/*
            元の文章から、ここまでの道のり。

            2つ並べただけだと「AIが何かした」で終わる。自分が書いた文から
            2手かかっていることは、3つ並べて初めて分かる。
          */}
          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">ここまでの道のり</h3>
            <ol className="mt-2 space-y-2" role="list">
              {[
                { id: "original" as const, label: "元の文章", body: original, icon: IconDocument },
                { id: "first" as const, label: "1回目", body: first, icon: IconSparkle },
                { id: "improved" as const, label: "改善後", body: improved, icon: IconCheckCircle },
              ].map((panel) => (
                <li
                  key={panel.id}
                  data-testid={`compare-${panel.id}`}
                  className={`rounded-card border p-3 ${
                    panel.id === "improved"
                      ? "border-brand bg-brand-soft/60"
                      : "border-line bg-surface"
                  }`}
                >
                  <p
                    className={`flex items-center gap-1.5 text-xs font-bold ${
                      panel.id === "improved" ? "text-brand-dark" : "text-ink-muted"
                    }`}
                  >
                    <panel.icon className="h-3.5 w-3.5 shrink-0" />
                    {panel.label}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                    {panel.body || "（入力なし）"}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </MoreSheet>
      )}
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
 * 選んだ条件はここに入れない。条件は隣の「何を変えた？」が持っている。
 * 同じことを原因と結果の両方に置くと、2つ起きたように読める。
 */
export function ChangePoints({
  before,
  after,
}: {
  before: string;
  after: string;
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

  /*
    測って分かる差が無いときも、黙って消えない。

    「何を変えた？」の隣が空欄だと、読む側には**測れなかったのか、
    変わらなかったのか**が分からない。分からないことは分からないと書く。
  */
  if (points.length === 0) {
    return (
      <p
        className="mt-2 text-sm leading-6 text-ink-muted"
        data-testid="change-points"
      >
        長さや形は大きく変わっていません。言葉の選び方を見比べてみてください。
      </p>
    );
  }

  return (
    <div data-testid="change-points">
      <ul className="mt-2 space-y-2" role="list">
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
    </div>
  );
}
