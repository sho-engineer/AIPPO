/**
 * AIが返してきたものの見せ方。
 *
 * 変わった場所を示す1枚と、これまでの実行を並べる1枚。
 * どちらも「返ってきたあと」だけに出るので、まとめてある。
 */

import { useState, type ReactNode } from "react";

import { RevealText } from "../RevealText";
import { FullText, MoreButton, MoreSheet } from "../MoreSheet";
import { IconCaution } from "../../Icons";
import { diffSentences, isMostlyUnchanged } from "../../../lib/diff";
import type { RunRecord } from "../../../course/useCourseLesson";

// --------------------------------------------------------------- 結果

interface ResultProps {
  before: string;
  after: string;
  reviewPoints: string[];
  factCheck?: boolean;
  /**
   * 「変わったところを見る」の一枚に足すもの。
   *
   * これまでの結果など、**確かめたい人だけが要る**もの。画面に
   * 積むと、比べる面がその分だけ潰れる。
   */
  more?: ReactNode;
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
  more: extra,
}: ResultProps) {
  const [tab, setTab] = useState<"before" | "after">("after");
  const [more, setMore] = useState(false);
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
  /*
    AIが返す文章の長さは決まらない。**枠のほうで止める。**

    止めないと、長い回答が来た日だけ画面が伸びて、下のボタンが
    押せなくなる。ここで区切っておけば、長くてもこの面の中で送れる
    （画面は動かない）。24rem は 390px で 10行ぶん。
  */
  const panel = (
    title: string,
    body: string,
    testId: string,
    reveal = false,
    heading = true,
  ) => (
    <section
      className="flex min-h-0 flex-1 flex-col rounded-card border border-line
                 bg-surface p-3.5"
    >
      {/*
        タブで切り替えているときは、面の中の見出しを出さない。
        すぐ上のタブが「元の文章 / AIの結果」と同じことを言っていて、
        20px を使って二度言うぶん、肝心の本文が縮む。
      */}
      {heading && (
        <h3 className="shrink-0 text-xs font-bold text-ink-muted">{title}</h3>
      )}
      {/*
        下限は置かない。ここで置くと、上の入れ物がすべて `min-h-0` な
        ので**この面だけが縮まず、枠の外へ描かれる**（実際に重なった）。
        潰れ止めは入れ物の側（`result-compare` の `min-h`）が持つ。
      */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {reveal ? (
          <RevealText
            text={body}
            trigger={body}
            testId={testId}
            className="whitespace-pre-wrap break-words text-sm leading-7"
          />
        ) : (
          <p
            data-testid={testId}
            className="whitespace-pre-wrap break-words text-sm leading-7"
          >
            {body}
          </p>
        )}
      </div>
    </section>
  );

  /** 1文ずつの差分。開いた一枚の中にだけ出す。 */
  const diff = (
    <p className="text-sm leading-7">
      {parts.map((part, index) => {
        if (part.kind === "same") return <span key={index}>{part.text}</span>;
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
  );

  return (
    /*
      縦の flex。**本文の面にだけ「残りの高さ」を渡す。**

      AIが返す長さは決まらないので、面の高さを数で決めても当たらない。
      残りに合わせて縮み、入りきらないぶんは面の中で送る——画面は
      動かないので、下のボタンはいつでも押せる。
    */
    /*
      入りきらないときは、**この面の中だけ**が送れる。

      前は `min-h` で潰れ止めだけ置いていた。潰れはしないが、下限に
      届かないと中身が枠の外へ描かれて重なる（実測で、比べる面が
      32px まで縮んで下の文と重なっていた）。送れるようにしておけば、
      重ならずに全部読める——画面そのものは動かないので、ポーも
      「次へ」も出ていかない。

      ふだんは送らずに収まる。中の本文が `flex-1` で残りに合わせて
      縮むので、ここが働くのは本当に場所が足りない端末だけ。
    */
    <div
      data-testid="result-compare"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      {/* 狭い画面：タブ */}
      {/*
        読める下限は、**縮む鎖のいちばん外側**に置く。

        内側（本文の面）に置くと、外側は `min-h-0` で縮み続けるので
        面だけが枠から食み出して重なる（実際に重なった）。ここに
        置けば、足りないぶんは `result-compare` の側で送られる。
      */}
      <div className="flex min-h-[8rem] flex-1 flex-col sm:hidden">
        <div role="tablist" className="flex shrink-0 gap-2">
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
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          {tab === "before"
            ? panel("元の文章", before || "（入力なし）", "result-before-mobile", false, false)
            : panel("AIの結果", after, "result-after-mobile", true, false)}
        </div>
      </div>

      {/* 広い画面：並べる */}
      <div className="hidden min-h-[8rem] flex-1 gap-4 sm:grid sm:grid-cols-2">
        {panel("元の文章", before || "（入力なし）", "result-before")}
        {panel("AIの結果", after, "result-after", true)}
      </div>

      {/*
        差分は**その場で開かない**。開くとページが伸び、下のボタンが
        画面から出ていく。押したら別の一枚が出る形にする。
      */}
      {showDiff && (
        <div className="mt-4 shrink-0">
          <MoreButton testId="result-more" onClick={() => setMore(true)}>
            変わったところを見る
          </MoreButton>
        </div>
      )}

      {more && (
        <MoreSheet title="変わったところ" onClose={() => setMore(false)}>
          {diff}
          {/*
            文章そのものを押せるようにする。長い日はここで切れるので、
            続きを読むために一枚を送らせない（`FullText`）。
          */}
          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">元の文章</h3>
            <div className="mt-2">
              <FullText label="元の文章" text={before} testId="full-before" />
            </div>
          </section>
          <section className="mt-4">
            <h3 className="text-xs font-bold text-ink-muted">AIの結果</h3>
            <div className="mt-2">
              <FullText label="AIの結果" text={after} testId="full-after" />
            </div>
          </section>
          {reviewPoints.length > 1 && (
            <section className="mt-5 border-t border-line pt-4">
              <h3 className="text-xs font-bold text-ink-muted">ほかの見どころ</h3>
              <ul className="mt-2 space-y-1 text-sm leading-6" role="list">
                {reviewPoints.slice(1).map((point) => (
                  <li key={point}>・{point}</li>
                ))}
              </ul>
            </section>
          )}
          {extra && <div className="mt-5 border-t border-line pt-4">{extra}</div>}
        </MoreSheet>
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
      {/*
        見るところは1つだけ、**1行で**。

        前は薄青の面に見出しと本文と畳んだ一覧を積んでいて 110px
        あった。1画面に収める柱の中では、その 110px がそのまま
        「比べる面」から引かれる——実測で、比べる面が 32px まで
        潰れていた。残りは「変わったところを見る」の一枚へ移した。
      */}
      {reviewPoints.length > 0 && (
        <p
          className="mt-3 shrink-0 text-xs leading-5 text-brand-dark"
          data-testid="review-point"
        >
          <span className="font-bold">ここを見て：</span>
          {reviewPoints[0]}
        </p>
      )}

      {factCheck && (
        <p className="mt-3 flex shrink-0 items-start gap-2 rounded-card bg-caution-soft px-4 py-3 text-sm leading-6 text-caution">
          <IconCaution className="mt-1 h-4 w-4 shrink-0" />
          <span>数字・日付・価格・仕様は、AIの回答をそのまま信じず確認しましょう。</span>
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------------------- 履歴

/**
 * 前の結果を消さずに残す（要件 §6.9）。
 *
 * `flat` は「くわしく見る」の一枚の中で使う形。畳む三角を出さない
 * ——開いた先でもう一度開かせない。画面に置くときは畳んだまま出す。
 */
export function RunHistory({
  runs,
  flat = false,
}: {
  runs: RunRecord[];
  flat?: boolean;
}) {
  if (runs.length < 2) return null;

  const list = (
    <ol className="mt-2 space-y-3" role="list">
      {runs.map((run) => (
        <li key={run.sequence} data-testid={`run-${run.sequence}`}>
          <p className="text-xs font-bold text-brand-dark">{run.label}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
            {run.outputText}
          </p>
        </li>
      ))}
    </ol>
  );

  if (flat) {
    return (
      <section>
        <h3 className="text-xs font-bold text-ink-muted">
          これまでの結果（{runs.length}件）
        </h3>
        {list}
      </section>
    );
  }

  return (
    <details className="mt-4 rounded-card border border-line bg-surface px-4 py-2.5">
      <summary className="cursor-pointer text-xs font-bold text-ink-muted">
        これまでの結果（{runs.length}件）
      </summary>
      {list}
    </details>
  );
}
