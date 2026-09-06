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
import { FullText, MoreButton, MoreSheet } from "../MoreSheet";
import { TeachingImage } from "../../lessons/TeachingImage";
import type { TeachingImageEntry } from "../../../course/teachingImages";
import { diffSentences } from "../../../lib/diff";
import type { TermSwap } from "../../../course/lessonPlan";
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
  swaps,
  picture = null,
}: {
  original: string;
  first: string;
  improved: string;
  condition: string;
  /**
   * むずかしい言葉の言いかえ（`course/lessonPlan.ts`）。
   *
   * 「変わったところ」で**1組だけ**、代表例として出す。
   */
  swaps?: TermSwap[];
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
  /* 全文の比べ・図・差分の印。どれも「変わったところ」の奥に置く */
  const [fullCompare, setFullCompare] = useState(false);
  const [figure, setFigure] = useState(false);
  const [diffShown, setDiffShown] = useState(false);

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
        最初の結果
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
      {/*
        下限は**この節にも**置く。

        中のタブ（`compare-tabs`）に `min-h-[7rem]` を置いてあるが、
        それを包むこの節が `min-h-0` のままだと、**節のほうが先に
        潰れて**中身が枠の外へ描かれる。縮む鎖のいちばん外側に置く、
        というのがこの作りの決まり（Results.tsx に経緯がある）。

        iPhone の Safari（402×660）で、この節が 54px まで潰れ、
        112px の中身が 58px はみ出していた。
      */}
      <section
        className="flex min-h-[7rem] flex-1 flex-col"
        data-layout={bothShort ? "side-or-stack" : "tabs-or-side"}
      >
        {bothShort ? (
          // 両方短い。狭い画面でも横に並べたほうが速い
          <div className="flex min-h-[7rem] flex-1 flex-row items-stretch gap-3">
            {firstPanel()}
            {arrow}
            {improvedPanel()}
          </div>
        ) : (
          <>
            {/* 狭い画面：タブで入れ替える */}
            {/* 読める下限は縮む鎖の外側に置く（理由は Results.tsx） */}
            <div
              className="flex min-h-[7rem] flex-1 flex-col sm:hidden"
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
            <div className="hidden min-h-[7rem] flex-1 sm:flex sm:flex-row sm:items-stretch sm:gap-3">
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
      {/*
        画面には要約だけ、**1行**。

        「何を変えた」と「どう変わった」の対が、この画面のねらいそのもの
        （条件を1つ足すと結果が動く）。全部を一枚へ移したとき、押さない
        人にはその対が1つも見えなくなっていた。**結論は画面に、
        確かめる材料は一枚に。**

        2行に分けず矢印でつなぐ。原因と結果が同じ行に並ぶと、
        読まなくても対だと分かる——しかも 49px 返ってくる。
      */}
      {/*
        今回の指示で**何が良くなったか**を、2〜3行の印つきで。

        前はここが「AI初心者向けに → 275% 長くなりました」の1行だった。
        長さの%は改善そのものではない——かみくだけば言葉は増えるので、
        Day1（意味を変えずに分かりやすく）では**むしろ悪くなったように
        読める**。実機で 275% と出て、それがこの画面の唯一の答えだった。

        いま出すのは、測って言い切れることだけ（`changePointsOf`）。
        測れなかった日は黙らず、そう書く。
      */}
      <div
        className="mt-2.5 shrink-0 border-t border-line pt-2.5"
        data-testid="compare-summary"
      >
        <ul className="space-y-1" role="list" data-testid="compare-summary-change">
          {(() => {
            const points = changePointsOf(first, improved, condition);
            if (points.length === 0) {
              return (
                <li className="text-sm leading-6 text-ink-muted">
                  {NO_MEASURABLE_CHANGE}
                </li>
              );
            }
            return points.map((point) => (
              <li
                key={point}
                className="flex items-start gap-2 text-sm leading-6"
              >
                <IconCheckCircle className="mt-1 h-4 w-4 shrink-0 text-accent-teal" />
                <span className="min-w-0">{point}</span>
              </li>
            ));
          })()}
        </ul>
      </div>

      <div className="mt-3 shrink-0">
        <MoreButton testId="compare-more" onClick={() => setMore(true)}>
          変わったところを見る
        </MoreButton>
      </div>

      {more && (
        /*
          全画面で開く。**小さいシートに押し込まない。**

          ここは3節ぶんの読み物で、下から出る小さめのシートに入れると
          開いた瞬間から送ることになり、しかも背面のページと二重に
          送れる。`placement="full"` は中だけが送れる（`MoreSheet`）。
        */
        <MoreSheet
          placement="full"
          testId="changes-sheet"
          title="変わったところ"
          onClose={() => {
            setMore(false);
            setFullCompare(false);
            setFigure(false);
          }}
        >
          <p className="text-xs leading-6 text-ink-muted">
            お願いした内容が、文章にどう反映されたか見てみましょう。
          </p>

          {/* ① 何を変えた？ */}
          <section
            className="mt-3 flex items-center gap-3"
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

          {/* ② どう変わった？ */}
          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">どう変わった？</h3>
            <div className="mt-2">
              <ChangePoints before={first} after={improved} condition={condition} />
            </div>
          </section>

          {/* ③ 代表例 */}
          {swaps && swaps.length > 0 && (
            /*
              言いかえを**1組だけ**出す。3組並べると対応表になって、
              読む人が持ち帰るのは用語の知識になる。ここで見せたいのは
              「頼んだら、こういうふうに変わる」の1例。
            */
            <section className="mt-5 border-t border-line pt-4">
              <h3 className="text-xs font-bold text-ink-muted">たとえば</h3>
              <div
                className="mt-2 rounded-card bg-canvas px-3.5 py-3"
                data-testid="compare-example"
              >
                <p className="text-xs leading-5 text-ink-muted">{swaps[0].from}</p>
                <p className="mt-0.5 flex items-start gap-1.5 text-sm leading-6">
                  <IconArrowDown
                    className="mt-1 h-3.5 w-3.5 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 font-bold">{swaps[0].to}</span>
                </p>
              </div>
            </section>
          )}

          {/*
            ここから先は**押した人にだけ**。

            前はこの一枚に「1文ずつ見る（全文の赤青）」「図で見る」
            「ここまでの道のり（3本の全文）」まで積んでいた。開いた瞬間に
            赤青が画面を埋めて、上の3節まで目が戻らない。
          */}
          <div className="mt-5 space-y-2 border-t border-line pt-4">
            {picture && (
              <MoreButton testId="compare-figure-open" onClick={() => setFigure(true)}>
                図でも見る
              </MoreButton>
            )}
            <MoreButton
              testId="full-compare-open"
              onClick={() => setFullCompare(true)}
            >
              全文を比べる
            </MoreButton>
          </div>

          {figure && picture && (
            <MoreSheet
              elevated
              placement="center"
              testId="compare-figure"
              title="図で見る"
              onClose={() => setFigure(false)}
            >
              <TeachingImage
                src={picture.src}
                alt={picture.alt}
                width={picture.width}
                height={picture.height}
              />
            </MoreSheet>
          )}

          {fullCompare && (
            <MoreSheet
              elevated
              placement="full"
              testId="full-compare"
              title="全文を比べる"
              onClose={() => {
                setFullCompare(false);
                setDiffShown(false);
              }}
            >
              {/*
                元の文章から、ここまでの道のり。

                2つ並べただけだと「AIが何かした」で終わる。自分が書いた文から
                2手かかっていることは、3つ並べて初めて分かる。
              */}
              <ol className="space-y-2" role="list">
                {[
                  { id: "original" as const, label: "元の文章", body: original, icon: IconDocument },
                  { id: "first" as const, label: "1回目", body: first, icon: IconSparkle },
                  { id: "improved" as const, label: "改善後", body: improved, icon: IconCheckCircle },
                ].map((panel) => (
                  <li
                    key={panel.id}
                    data-testid={`compare-${panel.id}`}
                    className={
                      panel.id === "improved" ? "rounded-card bg-brand-soft/50 p-2" : "p-2"
                    }
                  >
                    <p
                      className={`flex items-center gap-1.5 text-xs font-bold ${
                        panel.id === "improved" ? "text-brand-dark" : "text-ink-muted"
                      }`}
                    >
                      <panel.icon className="h-3.5 w-3.5 shrink-0" />
                      {panel.label}
                    </p>
                    <div className="mt-1.5">
                      <FullText
                        label={panel.label}
                        text={panel.body}
                        testId={`full-${panel.id}`}
                      />
                    </div>
                  </li>
                ))}
              </ol>

              {/*
                消えたところが出るのは、ここだけ。上の3本は**いまある文**
                なので、消えた文は出しようがない（そこにもう無いので）。

                ただし既定では出さない。開いた瞬間に赤青が画面を埋めると、
                読む前に「難しそう」で閉じられる。
              */}
              <div className="mt-4 border-t border-line pt-3">
                {!diffShown ? (
                  <button
                    type="button"
                    onClick={() => setDiffShown(true)}
                    data-testid="full-compare-mark"
                    className="text-xs font-bold text-brand-dark underline
                               underline-offset-4"
                  >
                    変わった部分に印を付ける
                  </button>
                ) : (
                  <p className="text-sm leading-7" data-testid="compare-diff">
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
                )}
              </div>
            </MoreSheet>
          )}
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
/**
 * 測って分かった差を、短い文にして並べる。
 *
 * 見た目から切り出したのは、**同じ答えを画面と一枚の両方で使う**ため。
 * 画面には1本目だけを1行で出し（そこが「どう変わった？」）、
 * 全部は「変わったところを見る」の中で並べる。2か所で別々に数えると、
 * 画面と一枚で違うことを言う日が来る。
 */
export function changePointsOf(
  before: string,
  after: string,
  condition?: string,
): string[] {
  const points: string[] = [];

  /*
    条件を足したなら、それが**いちばん確かな「変わったところ」**。
    測るまでもなく、本人がそう頼んだから変わっている。
  */
  if (condition) points.push(`${condition}言葉を選んだ`);

  /*
    むずかしい言葉が減ったか。

    数えるのは**英字とカタカナの連なり**。専門用語かどうかは辞書が
    無いと決められないが、日本語の文章の中でこの2つが続けて出るところは、
    ほぼ用語（Query、Attention Weight、Multi-Head、トークン、
    ソフトマックス…）。1割以上減っていたら「減った」と言う。
  */
  const jargon = (text: string) =>
    (text.match(/[A-Za-z][A-Za-z-]{2,}|[ァ-ヴー]{4,}/g) ?? []).length;
  const wasJargon = jargon(before);
  if (wasJargon > 0 && jargon(after) <= wasJargon * 0.8) {
    points.push("むずかしい言葉を減らした");
  }

  /*
    一文が短くなったか。**全体の長さではなく、1文の長さ**を見る。

    前はここで「65% 長くなりました」と全体の文字数だけを出していた。
    ところが Day1 のねらいは「意味を変えずに分かりやすく」で、
    **長くなること自体は悪くない**——かみくだけば言葉は増える。
    数字だけを置くと、良くなったのか悪くなったのか読む側が判断できず、
    しかも 275% のような値は「壊れた」ようにも見える。

    分かりやすさに効くのは、1文がどれだけ短いか。ここを見る。
  */
  const perSentence = (text: string) => {
    const sentences = text.split(/[。！？\n]/).filter((one) => one.trim());
    return sentences.length === 0 ? 0 : text.length / sentences.length;
  };
  const wasLong = perSentence(before);
  if (wasLong > 0 && perSentence(after) <= wasLong * 0.85) {
    points.push("一文を短くした");
  }

  /*
    説明が増えたか。**「長くなった」を数字ではなく、意味で言う。**

    かみくだくと言葉は増える。増えたぶんは削られたのではなく
    **足された説明**なので、そう書く。
  */
  if (before.length > 0 && after.length >= before.length * 1.2) {
    points.push("説明を足してやさしくした");
  }

  const lines = (text: string) => text.split("\n").filter((line) => line.trim()).length;
  const isBulleted = (text: string) =>
    text.split("\n").filter((line) => /^\s*[・\-*•]|^\s*\d+[.)]/.test(line)).length >= 2;

  if (!isBulleted(before) && isBulleted(after)) points.push("箇条書きになりました");
  else if (lines(after) > lines(before)) points.push("行が分かれました");

  /*
    出すのは3つまで。4つ5つ並べると、**どれが今回の手柄なのか**が
    ぼやける。上から確かな順に積んであるので、頭から取る。
  */
  return points.slice(0, 3);
}

/** 測れなかったときの1行。**空欄にしない**（下のコメント参照）。 */
export const NO_MEASURABLE_CHANGE =
  "形の上では大きく変わっていません。言葉の選び方を見比べてみてください。";

export function ChangePoints({
  before,
  after,
  condition,
}: {
  before: string;
  after: string;
  /** 今回足した条件。あれば1つ目の「変わったところ」になる。 */
  condition?: string;
}) {
  const points = changePointsOf(before, after, condition);

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
        {NO_MEASURABLE_CHANGE}
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
