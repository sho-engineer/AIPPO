/**
 * AIが返してきたものの見せ方。
 *
 * 変わった場所を示す1枚と、これまでの実行を並べる1枚。
 * どちらも「返ってきたあと」だけに出るので、まとめてある。
 */

import { useState } from "react";

import { RevealText } from "../RevealText";
import { IconCaution } from "../../Icons";
import { diffSentences, isMostlyUnchanged } from "../../../lib/diff";
import type { RunRecord } from "../../../course/useCourseLesson";

// --------------------------------------------------------------- 結果

interface ResultProps {
  before: string;
  after: string;
  reviewPoints: string[];
  factCheck?: boolean;
}

/**
 * 元と結果を見比べる（要件 §6.9）。
 *
 * 広い画面では左右に並べ、狭い画面ではタブで切り替える。
 * 狭い画面で2つ並べると、どちらも読めない幅になる。
 */
export function ResultCompare({
  before,
  after,
  reviewPoints,
  factCheck = false,
}: ResultProps) {
  const [tab, setTab] = useState<"before" | "after">("after");
  const parts = diffSentences(before, after);
  const showDiff = before.trim().length > 0 && !isMostlyUnchanged(parts);

  /*
    AIが書いたほうだけ、少しずつ現れるようにする。

    全文がいきなり出ると、返ってきたことに気づかないまま読み始める。
    書かれていく様子が見えると「自分が頼んだ結果だ」という繋がりが残り、
    待った時間にも意味が付く。

    元の文章は自分が入れたものなので、現れる意味が無い。そのまま出す。
    文字は最初から DOM にある（変えるのは見え方だけ）ので、
    読み上げもコピーも途中の状態にはならない。
  */
  const panel = (title: string, body: string, testId: string, reveal = false) => (
    <section className="rounded-card border border-line bg-surface p-4">
      <h3 className="text-xs font-bold text-ink-muted">{title}</h3>
      {reveal ? (
        <RevealText
          text={body}
          trigger={body}
          testId={testId}
          className="mt-2 whitespace-pre-wrap break-words text-sm leading-7"
        />
      ) : (
        <p
          data-testid={testId}
          className="mt-2 whitespace-pre-wrap break-words text-sm leading-7"
        >
          {body}
        </p>
      )}
    </section>
  );

  return (
    <div data-testid="result-compare">
      {/* 狭い画面：タブ */}
      <div className="sm:hidden">
        <div role="tablist" className="flex gap-2">
          {(["before", "after"] as const).map((name) => (
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
              {name === "before" ? "元の文章" : "AIの結果"}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {tab === "before"
            ? panel("元の文章", before || "（入力なし）", "result-before-mobile")
            : panel("AIの結果", after, "result-after-mobile", true)}
        </div>
      </div>

      {/* 広い画面：並べる */}
      <div className="hidden gap-4 sm:grid sm:grid-cols-2">
        {panel("元の文章", before || "（入力なし）", "result-before")}
        {panel("AIの結果", after, "result-after", true)}
      </div>

      {showDiff && (
        <details className="mt-4 rounded-card border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-xs font-bold text-ink-muted">
            変わったところを見る
          </summary>
          <p className="mt-3 text-sm leading-7">
            {parts.map((part, index) => {
              if (part.kind === "same") {
                return <span key={index}>{part.text}</span>;
              }
              // 色だけで表さない。記号を必ず添える
              const isAdded = part.kind === "added";
              return (
                <span
                  key={index}
                  className={
                    isAdded
                      ? "rounded bg-brand-soft px-1 font-bold text-brand-dark"
                      : "rounded bg-caution-soft px-1 text-caution line-through"
                  }
                >
                  {isAdded ? "＋" : "−"}
                  {part.text}
                </span>
              );
            })}
          </p>
        </details>
      )}

      {/*
        見るところは**1つだけ**渡す。

        前は3つ並べていた（「元の意味が変わっていないか」「指定した
        長さになっているか」「読む相手に合った言葉づかいか」）。
        結果の本文のすぐ下に40字ぶんの確認事項が積まれるので、
        **いちばん手応えのある瞬間に、いちばん読ませていた**。

        3つとも見てほしいのは本当だが、3つ渡すと1つも見ない。
        残りは畳んだ中に置いてある（上の `details`）。

        教材データはこれまでどおり3つ持っている。**減らしたのは
        一度に見せる数**であって、中身ではない。
      */}
      {reviewPoints.length > 0 && (
        <section className="mt-5 rounded-card bg-brand-soft px-4 py-3">
          <h3 className="text-xs font-bold text-brand-dark">ここを見て</h3>
          <p className="mt-1 text-sm leading-6" data-testid="review-point">
            {reviewPoints[0]}
          </p>
          {reviewPoints.length > 1 && (
            <details className="mt-2">
              {/*
                薄青の上なので brand（#1268E8）では 4.42:1 しか出ず、
                本文の下限（4.5:1）に届かない。すぐ上の見出しと同じ
                brand-dark にする（axe が見ている）。
              */}
              <summary className="cursor-pointer list-none text-xs font-bold text-brand-dark">
                ほかの見どころ
              </summary>
              <ul className="mt-2 space-y-1 text-sm leading-6" role="list">
                {reviewPoints.slice(1).map((point) => (
                  <li key={point}>・{point}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {factCheck && (
        <p className="mt-3 flex items-start gap-2 rounded-card bg-caution-soft px-4 py-3 text-sm leading-6 text-caution">
          <IconCaution className="mt-1 h-4 w-4 shrink-0" />
          <span>数字・日付・価格・仕様は、AIの回答をそのまま信じず確認しましょう。</span>
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------------------- 履歴

/** 前の結果を消さずに残す（要件 §6.9）。 */
export function RunHistory({ runs }: { runs: RunRecord[] }) {
  if (runs.length < 2) return null;

  return (
    <details className="mt-5 rounded-card border border-line bg-surface px-4 py-3">
      <summary className="cursor-pointer text-xs font-bold text-ink-muted">
        これまでの結果（{runs.length}件）
      </summary>
      <ol className="mt-3 space-y-3" role="list">
        {runs.map((run) => (
          <li key={run.sequence} data-testid={`run-${run.sequence}`}>
            <p className="text-xs font-bold text-brand-dark">{run.label}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
              {run.outputText}
            </p>
          </li>
        ))}
      </ol>
    </details>
  );
}
