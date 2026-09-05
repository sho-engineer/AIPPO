/**
 * AIが返してきたものの見せ方。
 *
 * 変わった場所を示す1枚と、これまでの実行を並べる1枚。
 * どちらも「返ってきたあと」だけに出るので、まとめてある。
 */

import { useState, type ReactNode } from "react";

import { FullText, MoreButton, MoreSheet } from "../MoreSheet";
import { IconArrowDown, IconCaution } from "../../Icons";
import { diffSentences, isMostlyUnchanged } from "../../../lib/diff";
import type { TermSwap } from "../../../course/lessonPlan";
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
  /**
   * 「変わったところを見る」を出すか。
   *
   * 出さない画面がある——結果の直後（`observation`）は、**この画面で
   * 決めることが1つ**（分かりやすくなったか）なので、そこへ「差分を
   * 読む」を並べると、答える前に読み物が増える。差分は次の画面
   * （こんなに変わった）が持っている。
   */
  showChanges?: boolean;
  /**
   * 残りの高さいっぱいに広がるか。
   *
   * 既定は広がる（`true`）。結果を読むだけの画面は、下に載るのが
   * 帯のボタンだけなので、残りに合わせて縮み、入りきらないぶんを
   * この中で送ればよい。
   *
   * 結果を見て**答える**画面（`observation`）だけ `false`。あそこは
   * 下に答えの札が載る。広がる形にすると、縮んだ枠が抜粋を切って
   * **「全文を見る」ごと消える**（実測でそうなった）。高さを決めて
   * しまえば、札の場所は必ず残る。
   */
  fill?: boolean;
  /**
   * 「ここを見て」を画面に直接出すか。
   *
   * 結果を見て**答える**画面（`observation`）では出さない。あそこで
   * するのは1つ（分かりやすくなったか）で、そこへ補助の説明を足すと
   * **通常画面に読み物が増える**。見どころは「変わったところ」の
   * 一枚の中にある。
   */
  showPoints?: boolean;
  /**
   * むずかしい言葉の言いかえ（`course/lessonPlan.ts`）。
   *
   * 「変わったところ」の一枚で、いちばん上に出す。全文を突き合わせ
   * なくても「簡単になった」が分かるのは、この対応のほう。
   */
  swaps?: TermSwap[];
  /**
   * AIの結果だけを出すか（タブを置かない）。
   *
   * 結果を見て**答える**画面で使う。あそこでするのは1つ
   * （分かりやすくなったか）で、そのために読むのはAIの結果。
   * 元の文章と切り替える札は 44px 取るが、**切り替えても答えは
   * 変わらない**——元の文章は「変わったところ」の一枚の中で、
   * 言いかえの対応と一緒に見るほうが早い。
   */
  onlyResult?: boolean;
  /**
   * 今回どんな条件で頼んだか。結果の真上に札で並べる。
   *
   * 渡すのは**実際に送った値だけ**。まだ選んでいない条件を
   * 「指定なし」と並べると、選んだ札との区別が付かなくなる。
   */
  conditions?: string[];
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
  showChanges = true,
  fill = true,
  showPoints = true,
  swaps,
  onlyResult = false,
  conditions,
}: ResultProps) {
  const [tab, setTab] = useState<"before" | "after">("after");
  const [more, setMore] = useState(false);
  /*
    全文の比べは、**一枚の中でさらに1回押した人にだけ**出す。

    開いた瞬間に長い2文が並ぶと、せっかく言いかえの対応を先に置いても
    そこまで届かない。ここで見せたいのは「簡単になった」で、
    突き合わせて確かめるのはそのあとの話。
  */
  const [fullCompare, setFullCompare] = useState(false);
  /* 差分の印。全文の一枚の中で、さらにもう一手押した人にだけ出す */
  const [marked, setMarked] = useState(false);
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
    AIが返す文章の長さは決まらない。**決まった行数の抜粋にする。**

    前は「残りの高さ」を渡し、入りきらないぶんを面の中で送る形にして
    いた。理屈は通っているが、この画面には下に問いと次へのボタンが載る。
    残りが足りないと**この面の中身が枠の外へ出る**——実測では、
    402×684 で「全文を見る」が下の選択肢に隠れていた（`overflow-y-auto`
    が枠で切っていたので、押せる場所ごと消えていた）。

    高さを決めてしまえば、その事故は形の上で起きない。3行で切り、
    残りは中央の一枚で読む。

    なぜ3行で、4行ではないか
    ------------------------
    4行だと、いちばん低い持ち方（402×684）で答えの札が 13px だけ
    下の帯に隠れる。**押せない札を出すくらいなら、1行短くする。**
    3行あれば、返ってきたものがどういう文章かは読み取れる。
  */
  const preview = (label: string, body: string, testId: string) => (
    <FullText lines={3} label={label} text={body} testId={testId} />
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
    /*
      広がるかどうかは呼ぶ側が決める（`fill`）。答える画面だけ、
      高さを決めて札の場所を残す。
    */
    <div
      data-testid="result-compare"
      className={`flex flex-col ${
        fill ? "min-h-0 flex-1 overflow-y-auto" : "shrink-0"
      }`}
    >
      {/*
        今回どんな条件で頼んだか。**結果の真上に置く。**

        結果だけを見せると、それがどのお願いに対する答えなのかが
        画面から消える。押した札をここに並べておけば、Section 2 で
        条件を足したときに「増えた札のぶんだけ結果が変わった」と
        目で追える。

        出すのは**実際に送ったものだけ**。まだ選んでいない条件
        （Section 1 では読む相手・表現）を「指定なし」と並べない。
      */}
      {conditions && conditions.length > 0 && (
        /*
          低い持ち方では出さない。**答える札のほうが先**で、条件は
          「いま送ったお願いを見る」からいつでも読める。402×660 では
          この1行（39px）が入ると、2択が画面の外へ出ていた。
        */
        <ul
          className="mb-2.5 hidden shrink-0 flex-wrap gap-1.5
                     [@media(min-height:700px)]:flex"
          role="list"
          data-testid="result-conditions"
        >
          {conditions.map((condition) => (
            <li
              key={condition}
              className="rounded-badge bg-brand-soft px-2.5 py-1 text-xs
                         font-bold text-brand-dark"
            >
              {condition}
            </li>
          ))}
        </ul>
      )}

      {/* 狭い画面：タブ */}
      {/*
        読める下限は、**縮む鎖のいちばん外側**に置く。

        内側（本文の面）に置くと、外側は `min-h-0` で縮み続けるので
        面だけが枠から食み出して重なる（実際に重なった）。ここに
        置けば、足りないぶんは `result-compare` の側で送られる。
      */}
      {/*
        スマホは**決まった行数の抜粋**にする。

        前は「残りの高さ」を渡して、入りきらないぶんを面の中で送る形に
        していた。理屈は通っているが、この画面には下に問い（分かりやすく
        なった？）と次へのボタンが載る。残りは 402×684 の実機で
        **1行ぶんしか無く**、AIの結果が読めないまま「分かりやすく
        なった？」を聞かれていた。読めなければ答えようがないので、
        勘で押すことになる。

        4行の抜粋＋「全文を見る」に替える。抜粋の高さは決まっているので
        下は動かず、全文は中央の一枚で読める（`FullText`）。
      */}
      <div className="flex shrink-0 flex-col sm:hidden">
        {!onlyResult && (
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
        )}
        <div className={onlyResult ? "" : "mt-3"}>
          {!onlyResult && tab === "before"
            ? preview("元の文章", before, "result-before-mobile")
            : preview("AIの結果", after, "result-after-mobile")}
        </div>
      </div>

      {/*
        広い画面：並べる。

        こちらも同じ抜粋にする。場所はあるが、**同じものが2つの形で
        出る**ほうが困る——スマホで見た人とパソコンで見た人で、
        「全文を見る」があったり無かったりする。
      */}
      <div className="hidden gap-4 sm:grid sm:grid-cols-2">
        <div>
          <h3 className="mb-1.5 text-xs font-bold text-ink-muted">元の文章</h3>
          {preview("元の文章", before, "result-before")}
        </div>
        <div>
          <h3 className="mb-1.5 text-xs font-bold text-ink-muted">AIの結果</h3>
          {preview("AIの結果", after, "result-after")}
        </div>
      </div>

      {/*
        差分は**その場で開かない**。開くとページが伸び、下のボタンが
        画面から出ていく。押したら別の一枚が出る形にする。
      */}
      {showChanges && (showDiff || (swaps?.length ?? 0) > 0) && (
        <div className="mt-3 shrink-0">
          <MoreButton testId="result-more" onClick={() => setMore(true)}>
            変わったところを見る
          </MoreButton>
        </div>
      )}

      {more && (
        /*
          中央に浮かべる。ここは**見て、閉じて、答える**場面で、
          下から出る形だと「送れば続きがある読み物」に見える。
        */
        <MoreSheet
          placement="center"
          testId="changes-sheet"
          title="変わったところ"
          onClose={() => {
            setMore(false);
            setFullCompare(false);
            setMarked(false);
          }}
        >
          {/*
            この一枚が何の話なのかを1行で言う。

            **元の文章の解説ではない。**前はここに用語の対応だけが
            並んでいて、読んだ人が持ち帰るのは Transformer の知識に
            なっていた。ここで持ち帰ってほしいのは「自分が頼んだこと
            が、結果のどこに出たか」のほう。
          */}
          <p className="text-xs leading-6 text-ink-muted">
            お願いした内容が、文章にどう反映されたか見てみましょう。
          </p>

          {swaps && swaps.length > 0 && (
            /*
              変わったところを、**したことの側から**並べる。

              「自己注意機構 → 言葉同士の関係を見る仕組み」だけだと
              用語の対応表になる。上に「専門用語を減らした」と置くと、
              同じ組が**自分の操作の結果**として読める——次に自分で
              頼むときに使えるのはこちら。
            */
            <ol className="mt-3 space-y-2.5" role="list" data-testid="changes-swaps">
              {swaps.slice(0, 3).map((swap, at) => (
                <li key={swap.from} className="rounded-card bg-canvas px-3.5 py-3">
                  <p className="flex items-baseline gap-1.5 text-sm font-bold leading-6">
                    <span className="shrink-0 tabular-nums text-brand">{at + 1}</span>
                    <span className="min-w-0">{swap.headline}</span>
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-ink-muted">{swap.from}</p>
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm leading-6">
                    <IconArrowDown
                      className="mt-1 h-3.5 w-3.5 shrink-0 text-brand"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 font-bold">{swap.to}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}

          {reviewPoints.length > 0 && (
            <section className={swaps && swaps.length > 0 ? "mt-4" : "mt-3"}>
              <h3 className="text-xs font-bold text-ink-muted">ここを見て</h3>
              <ul className="mt-2 space-y-1 text-sm leading-6" role="list">
                {reviewPoints.map((point) => (
                  <li key={point}>・{point}</li>
                ))}
              </ul>
            </section>
          )}

          {/*
            全文の比べは、**この一枚の中では開かない。**

            前はここで展開していて、開いた瞬間に赤青の差分と長い2文が
            この一枚の中に生えた。上の3つを読んでいる途中で下が伸びる
            ので、どこまで読んだのか分からなくなる。もう一枚にする。
          */}
          <div className="mt-4">
            <MoreButton testId="full-compare-open" onClick={() => setFullCompare(true)}>
              全文を比べる
            </MoreButton>
          </div>

          {fullCompare && (
            <MoreSheet
              elevated
              placement="center"
              testId="full-compare"
              title="全文を比べる"
              onClose={() => setFullCompare(false)}
            >
              {/*
                縦に並べる。横に並べると 390px ではどちらも読めない幅に
                なる（`ResultCompare` の広い画面と同じ理由）。
              */}
              <section>
                <h3 className="text-xs font-bold text-ink-muted">元の文章</h3>
                <div className="mt-2">
                  <FullText label="元の文章" text={before} testId="full-before" />
                </div>
              </section>

              <div className="flex justify-center py-1.5" aria-hidden="true">
                <IconArrowDown className="h-4 w-4 text-brand" />
              </div>

              <section>
                <h3 className="text-xs font-bold text-brand-dark">AIの結果</h3>
                <div className="mt-2">
                  <FullText label="AIの結果" text={after} testId="full-after" />
                </div>
              </section>

              {/*
                差分の印は**押した人にだけ**。

                開いた瞬間に赤青だらけの文が出ると、読む前に「難しそう」
                で閉じられる。ここまで来た人は突き合わせたい人なので、
                もう一手だけ預ける。
              */}
              {showDiff && (
                <div className="mt-4 border-t border-line pt-3">
                  {!marked ? (
                    <button
                      type="button"
                      onClick={() => setMarked(true)}
                      data-testid="full-compare-mark"
                      className="text-xs font-bold text-brand-dark underline
                                 underline-offset-4"
                    >
                      変わった部分に印を付ける
                    </button>
                  ) : (
                    diff
                  )}
                </div>
              )}

              {extra && <div className="mt-5 border-t border-line pt-4">{extra}</div>}
            </MoreSheet>
          )}
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
      {showPoints && reviewPoints.length > 0 && (
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
