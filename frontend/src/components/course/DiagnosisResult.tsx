/**
 * AI活用診断の結果。
 *
 * 答え終わってからの、4枚
 * ------------------------
 * 前はここが1画面だった。図・できていること・次の一歩・おすすめが
 * 同時に並び、下のボタンは「ここから始める」。**読む前に次へ行く道が
 * 目に入る**ので、結果は読まれずに押される形になっていた。
 *
 *     整理中   … 1〜1.5秒。4つの観点を順に見て、自分で現在地へ移る
 *     現在地   … 5段階のどこか・そうなった理由・回答から見えたこと
 *     4つの力  … ひし形と、強み／次に伸ばす力／次に覚えること
 *     おすすめ … 上の3つを受けた1本。ここで初めて Lesson が出る
 *
 * 順番と文言は `course/diagnosisFlow.ts` が持つ。見出しと下のボタンは
 * `LessonRunner` が出すので、**2つのファイルにまたがる**——片方だけ
 * 直すと画面の上と下で言うことがずれる。
 *
 * 「読み取りました」の1枚をやめた
 * --------------------------------
 * 5問目の直後に、4つの段（横棒）を出すだけの画面があった。押して
 * 次へ行くための1枚で、**そこで新しく分かることが無い**——同じ4つの
 * 値は、2つあとの「4つの力」でひし形として出る。同じものを2通りで
 * 見せたうえ、押す回数だけが1つ増えていた。
 *
 * 代わりに置いたのが整理中の1枚（`diagnosis/Analyzing.tsx`）。
 * こちらは**結果を出す前**にあり、押すものを持たない。
 *
 * 「回答から見えた特徴」の1枚もやめた
 * ------------------------------------
 * 判断（現在地）と根拠（特徴とその元の回答）が別の画面に置かれて
 * いた。現在地のほうは「そう出た」としか読めず、特徴のほうは答えの
 * 復習にしかならない。1枚にまとめた（`StageView`）。
 *
 * 図の切り替え（道／ひし形）もやめてある。道は現在地の画面、ひし形は
 * 4つの力の画面と、**置き場所が役を持った**ので、選ばせる必要が
 * 無くなった。残っている一枚は「ほかの候補」だけ——あれは押した人に
 * だけ要る行き先で、結果の説明ではない。
 *
 * 点数を出さない
 * --------------
 * 68点・82点のような細かい数字は見せない。刻みが細かいほど正確に
 * 見えるが、5問から出した数字にその精度は無い。段は5つまで。
 */

import { useState } from "react";

import { IconArrow, IconCheck, IconChevronRight } from "../Icons";
import { MoreSheet } from "./MoreSheet";
import { DetailSheet } from "./diagnosis/DetailSheet";
import { GrowthTrack } from "./diagnosis/GrowthTrack";
import { RadarChart } from "./diagnosis/RadarChart";
import {
  AXES,
  AXIS_LABELS,
  NEXT_LEARNING,
  NEXT_SKILL,
  scoreDiagnosis,
  stageReason,
  traitLines,
} from "../../course/diagnosisScore";
import type { DiagnosisPhase } from "../../course/diagnosisFlow";
import { lookOf } from "../../course/presentation";
import {
  recommendLeadParts,
  recommendPlan,
  type LeadParts,
} from "../../course/recommend";
import type { Lesson } from "../../course/types";

export interface DiagnosisResultProps {
  /** 診断の答え。 */
  values: Record<string, string>;
  /** おすすめの1本を引くための一覧。 */
  lessons: Lesson[];
  /** いま出している画面。決めているのは `LessonRunner`（下の帯と揃える）。 */
  phase: DiagnosisPhase;
  /**
   * 答えを直しに戻る。
   *
   * 入口は特徴の画面（`TraitsView`）の中だけ。結果を見に来た画面の
   * いちばん上に答えの一覧を置いていたころは、**結果より先に自分の
   * 答えが目に入って**いた。
   */
  onEditAnswer?: (stepId: string) => void;
  /**
   * 添えたレッスンを、その場から始める。
   *
   * 渡されなければ押せない見た目にする（`button` を出さない）。
   * 押せる形にしてあるのに押せないと、見えているだけで届かない道になる。
   */
  onPickLesson?: (lessonId: string) => void;
}

export function DiagnosisResult({
  values,
  lessons,
  phase,
  onEditAnswer,
  onPickLesson,
}: DiagnosisResultProps) {
  const result = scoreDiagnosis(values);
  /*
    サーバーから届いた一覧で決める。公開状態を持っているのはこちら
    ——同梱データを見ていると、1本開いた日に診断だけが古い範囲で止まる。
  */
  const plan = recommendPlan(values, lessons);
  const find = (id: string) => lessons.find((one) => one.id === id);
  const first = find(plan.first);

  return (
    /*
      余りは、**全部の切れ目へ等しく配る**（`justify-between`）。

      1か所にまとめて置くと、そこだけぽっかり空く。伸びる仕切りを
      1つ置いて上限を付けたときは、縦の長い端末で下に 380px の
      空白が残った。余りが無いとき（402×660）は上詰めと同じ振る舞い。
    */
    <div
      className="flex min-h-0 flex-1 flex-col justify-between"
      data-testid="completion-view"
      data-phase={phase}
    >
      {phase === "stage" && (
        <StageView result={result} values={values} onEditAnswer={onEditAnswer} />
      )}
      {phase === "axes" && <AxesView result={result} />}
      {phase === "lesson" && (
        <LessonView
          lesson={first}
          /*
            なぜこの1本かは、**いま出している教材ごと**渡して作る。
            準備中の差し替えが起きているときは、そう書く（`waiting`）。
          */
          lead={recommendLeadParts(values, first, Boolean(plan.waiting))}
          waiting={plan.waiting ? find(plan.waiting) : undefined}
          others={plan.rest.map(find).filter((one): one is Lesson => Boolean(one))}
          onPick={onPickLesson}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------ ①現在地

/**
 * いまどこにいるか。**主画面は判断だけ。根拠は開いて読む。**
 *
 * なぜ分けたか
 * ------------
 * 判定と、その理由と、根拠になった回答を1枚に積んでいた。文章の量は
 * 答えの組み合わせで変わるので、**人によって画面が縦に伸びる**——
 * 実測で 390×844 が 42px、320×568 が最大 148px あふれていた。
 * 隠して収めるのではなく、**出す単位を分ける**。
 *
 *     主画面   … 段の名前・5段階の道・要約1〜2文・理由リンク・CTA
 *     開く一枚 … 詳しい判定理由／回答の振り返り（`DetailSheet`）
 *
 * 要約は作文しない
 * ----------------
 * 判定の決め方をそのまま短くしたもの（`stageReason` の1文目）。
 * 2文目——強みと現在地が噛み合わない理由——は一枚のほうへ回す。
 * 主画面に置くと、そこだけで3〜4行になる。
 *
 * ここでは Lesson の話をしない
 * ----------------------------
 * 前は同じ画面に「次の一歩 ＋ おすすめ Day1」が並んでいて、現在地を
 * 読み終える前に目がそちらへ行っていた。次の話は2画面あと。
 */
function StageView({
  result,
  values,
  onEditAnswer,
}: {
  result: ReturnType<typeof scoreDiagnosis>;
  values: Record<string, string>;
  onEditAnswer?: (stepId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const reason = stageReason(result);
  const lines = traitLines(result, values, 2);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="shrink-0 rounded-card border border-line bg-surface px-4 py-3
                   [@media(min-height:700px)]:pb-4 [@media(min-height:700px)]:pt-3.5"
      >
        {/* 道と段の名前。説明文（`summary`）は出さない——下に要約が来る */}
        <GrowthTrack stage={result.stage.number} />

        {/*
          要約。**1文だけ**（`stageReason` の先頭）。

          残りは一枚のほうへ回す。ここに全部置くと、答えの組み合わせに
          よって3〜4行になり、そのぶん画面が伸びる。
        */}
        <p
          className="mt-2.5 border-t border-line pt-2.5 text-[0.8125rem] leading-6
                     text-ink [@media(min-height:700px)]:mt-3
                     [@media(min-height:700px)]:pt-3"
          data-testid="diagnosis-stage-reason"
        >
          {reason[0]}
        </p>
      </div>

      {/*
        詳しく読む道。**カードの外に、独立した行として置く。**

        カードの中に入れると、判定の一部のように見える。ここは
        「もっと知りたい人だけが押すもの」なので、外に1行で置く。
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="diagnosis-reason-open"
        className="mt-2.5 shrink-0 self-start rounded-cta py-2 text-xs
                   font-bold text-brand-dark underline transition
                   hover:text-brand"
      >
        この結果になった理由
      </button>

      {/*
        余りは、リンクと下のボタンのあいだへ落とす。要素どうしの間隔は
        固定したまま——近さは意味を持つので、端末の高さで変えない。
      */}
      <div className="min-h-0 flex-1" aria-hidden="true" />

      {open && (
        <DetailSheet
          title="この結果になった理由"
          onClose={() => setOpen(false)}
          pages={[
            {
              label: "判定の理由",
              body: (
                <div className="space-y-2">
                  <p className="text-sm font-bold leading-6 text-brand-dark">
                    {result.stage.name}
                  </p>
                  {reason.map((text) => (
                    <p key={text} className="text-sm leading-6 text-ink">
                      {text}
                    </p>
                  ))}
                  <p className="text-[0.8125rem] leading-6 text-ink-muted">
                    {result.stage.summary}
                  </p>
                </div>
              ),
            },
            {
              label: "回答の振り返り",
              body: (
                <ul className="space-y-3" role="list" data-testid="diagnosis-traits">
                  {lines.map((line) => (
                    <li key={line.text} data-done={line.done ? "yes" : "no"}>
                      <p className="flex items-start gap-2 text-sm font-bold leading-6">
                        {/*
                          印は、言っていることと合わせる。できている
                          ことはチェック、これからは矢印——チェックは
                          「済んだ」の印なので、まだのことに付けると
                          色が見えない人には矛盾しか残らない。
                        */}
                        <span
                          aria-hidden="true"
                          className={`mt-1 flex h-4 w-4 shrink-0 items-center
                                      justify-center rounded-full text-white ${
                                        line.done ? "bg-brand" : "bg-ink-muted"
                                      }`}
                        >
                          {line.done ? (
                            <IconCheck className="h-2.5 w-2.5" />
                          ) : (
                            <IconArrow className="h-2.5 w-2.5" />
                          )}
                        </span>
                        <span className="min-w-0">{line.text}</span>
                      </p>

                      <ul
                        className="mt-1 space-y-1 pl-6"
                        role="list"
                        data-testid="diagnosis-trait-from"
                      >
                        {line.from.length === 0 ? (
                          <li className="text-xs leading-5 text-ink-muted">
                            今回の5問には、この場面が出てきませんでした。
                          </li>
                        ) : (
                          line.from.map((entry) => (
                            <li
                              key={entry.stepId}
                              className="flex items-start justify-between gap-2
                                         text-xs leading-5 text-ink-muted"
                            >
                              <span className="min-w-0">{entry.text}</span>
                              {onEditAnswer && (
                                /*
                                  「なおす」はここにある。結果を見てから
                                  「そこは違う」と気づいた人が、直せずに
                                  終わらないように。答えが並ぶこの場所が、
                                  直す入口としていちばん近い。
                                */
                                <button
                                  type="button"
                                  onClick={() => onEditAnswer(entry.stepId)}
                                  data-testid="diagnosis-edit-answer"
                                  className="shrink-0 rounded-badge border border-line
                                             px-2 py-0.5 text-[0.6875rem] leading-4
                                             text-brand-dark transition hover:bg-brand-soft"
                                >
                                  なおす
                                </button>
                              )}
                            </li>
                          ))
                        )}
                      </ul>
                    </li>
                  ))}
                  <li className="text-[0.6875rem] leading-4 text-ink-muted">
                    ※ 5つの回答から見た範囲です。外部のAIには送っていません。
                  </li>
                </ul>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------- ④4つの力

/**
 * 4つの力。**図だけで終わらせない。**
 *
 * ひし形は「どこが薄いか」を一目にするが、そこから何をすればよいかは
 * 出てこない。図の下に3行——強み／次に伸ばす力／次に覚えること——を
 * 置いて、次の画面（おすすめ）へつなぐ。
 *
 * 3行目だけ、技の名前ではなく**やること**で書く（`NEXT_LEARNING`）。
 * 「ターゲット指定」はこのアプリの中の呼び名で、初めて見る人には
 * 何をするのか分からない。
 */
function AxesView({ result }: { result: ReturnType<typeof scoreDiagnosis> }) {
  const [open, setOpen] = useState(false);
  /*
    強みと次に伸ばす力が**同じ軸を指すことがある。**

    どちらも同じ物差しで決めていないため起きる。強みは数がいちばん
    高い軸、次に伸ばす力は積み上げの順で最初に届かない軸。4つとも
    低い人（全部1〜2）では、いちばん高い軸がそのまま最初に届かない
    軸になる。

    **選定を変えて別々にはしない。** 見た目の都合で2つ目に高い軸を
    「強み」と呼ぶと、その人の強みではないものを強みとして出すことに
    なる。同じなら同じと言い、なぜそうなるのかを添える。
  */
  const same = result.strongest === result.weakest;

  return (
    /*
      縦の flex。**余った高さは、ひし形だけに渡す。**

      1行の説明と下の3行は自分の高さのまま動かず、図が置き場に
      合わせて伸び縮みする（`RadarChart` の `fluid`）。ここを
      `shrink-0` にしていたころは、中の `flex-1` が効かずに図が
      下限（92px）のまま——縦に余裕のある端末でも小さいままだった。
    */
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        図の上に説明を置かない。

        「4つのうち、どこが薄いかを見ます。」の1行があった。図の読み方の
        念押しだが、**見出し（4つの力のバランス）とポーの一言と合わせて
        3回**同じことを言っていて、しかもその 24px は図から引かれていた。
        図を大きくするのに、いちばん先に外せるのがここ。
      */}

      {/*
        ひし形。**この画面の主役はこれ。**

        前は画面の高さで出し分けていた——760px 以上ならひし形、
        それ未満なら横棒（`AxisBars`）。いちばん低い持ち方に合わせた
        結果、**実機のほとんどで横棒しか出ていなかった**。横棒は同じ
        4つの段を数として言うが、4つの関係（どこが出ていてどこが
        へこんでいるか）は一目にならない。

        いまは、どの高さでもひし形を出す。高さは置き場に任せてあり
        （`fluid`。下限 92px・上限 220px）、低い端末では小さくなるが
        **形は保たれる**。数の内訳（横棒）は置かない——同じ4つの値を
        2通りで同時に見せると、どちらを読めばよいのか決められなくなる。
        ここで見せたいのは**4つの関係**なので、ひし形1つでよい。

        左右にはみ出す軸の名前ぶん、横に 2rem 空ける。ひし形は
        正方形の中に描かれ、「条件」「仕事」の名前はその外側へ
        置かれるので（`RadarChart` の `place`）、ここを詰めると
        カードの外で切れる。
      */}
      <div
        /*
          低い端末では、図の下限を下げる。ここを 160px で固定して
          いたので、320×568 では下の3行と詰まって 54px あふれていた。
          形が潰れない下限（112px）まで下げる。
        */
        className="mt-1 flex min-h-[7rem] flex-1 justify-center px-8
                   [@media(min-height:700px)]:min-h-[10rem]"
      >
        <RadarChart axes={result.axes} focus={result.weakest} />
      </div>

      {/*
        図の下の3つ。**長さの違うものを、同じ組み方で並べない。**

        前は3つとも「名前 …… 値」の左右1行だった。短い2つ（「AIに頼む力」）
        はそれで読めるが、3つ目の「次に覚えること」は
        「誰向けか・どんな言い方かを足して、返ってくる文章を変える」と
        長く、右寄せの1行に押し込むと折り返して**行の頭と値の頭が
        段違い**になる（実機で撮って分かった）。

        短い2つは左右。長い1つは見出しの下へ、左ぞろえで置く。
      */}
      <dl
        className="mt-2 shrink-0 rounded-card bg-brand-soft/60 px-3.5 py-1.5
                   [@media(min-height:700px)]:mt-3 [@media(min-height:700px)]:py-2.5"
        data-testid="diagnosis-axes-summary"
      >
        <div className="flex items-baseline gap-3">
          <dt className="shrink-0 whitespace-nowrap text-xs leading-5 text-ink-muted">
            強み
          </dt>
          <dd
            className="min-w-0 flex-1 text-right text-sm font-bold leading-5 text-ink"
            data-testid="diagnosis-strength"
          >
            {AXIS_LABELS[result.strongest]}力
          </dd>
        </div>

        <div className="mt-1.5 flex items-baseline gap-3 border-t border-brand-line/60 pt-1.5">
          <dt className="shrink-0 whitespace-nowrap text-xs leading-5 text-ink-muted">
            次に伸ばす力
          </dt>
          <dd
            className="min-w-0 flex-1 text-right text-sm font-bold leading-5 text-brand-dark"
            data-testid="diagnosis-next-axis"
          >
            {AXIS_LABELS[result.weakest]}力
          </dd>
        </div>

        {/*
          強みと次に伸ばす力が同じ軸のとき。**言い換えずに、理由を足す。**

          4つとも低い人では、いちばん高い軸がそのまま「最初に届いて
          いない軸」になる。その人にとっては**いちばん手がかりのある
          ところを伸ばす**のが次の一歩なので、判定としては正しい。
          黙っていると同じ言葉が2行続くだけに見えるので、そう出る
          理由をここで1行だけ言う。
        */}
        {same && (
          <p
            className="mt-1.5 text-[0.6875rem] leading-4 text-ink-muted"
            data-testid="diagnosis-same-axis-note"
          >
            いま4つの中でいちばん手がかりがあるのがここでした。得意なところから伸ばすと、次が早く進みます。
          </p>
        )}

        {/*
          次に覚えること。**主画面には短い名前だけ。**

          やることの1文（`NEXT_LEARNING`）は長く、端末によって2〜3行に
          なる——そのぶんだけ画面が伸びる。ここは技の受け持ち範囲を
          短く言い、中身は開いて読む。
        */}
        <div className="mt-1.5 flex items-baseline gap-3 border-t border-brand-line/60 pt-1.5">
          <dt className="shrink-0 whitespace-nowrap text-xs leading-5 text-ink-muted">
            次に覚えること
          </dt>
          <dd
            className="min-w-0 flex-1 text-right text-sm font-bold leading-5 text-ink"
            data-testid="diagnosis-next-learning"
          >
            {NEXT_SKILL[result.weakest].name}
          </dd>
        </div>
      </dl>

      {/*
        詳しく読む道。**カードの外に、独立した行として置く。**
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="diagnosis-axes-open"
        className="mt-2 shrink-0 self-start rounded-cta py-2 text-xs font-bold
                   text-brand-dark underline transition hover:text-brand"
      >
        4つの力について詳しく
      </button>

      {open && (
        <DetailSheet
          title="4つの力について"
          onClose={() => setOpen(false)}
          pages={[
            {
              label: "次に覚えること",
              body: (
                <div className="space-y-2">
                  <p className="text-sm font-bold leading-6 text-brand-dark">
                    {NEXT_SKILL[result.weakest].name}
                  </p>
                  <p className="text-sm leading-6 text-ink">
                    {NEXT_SKILL[result.weakest].summary}
                  </p>
                  <p className="text-sm leading-6 text-ink">
                    {NEXT_LEARNING[result.weakest]}
                  </p>
                </div>
              ),
            },
            {
              label: "4つの力の読み方",
              body: (
                <div className="space-y-2">
                  <p className="text-sm leading-6 text-ink-muted">
                    4つは積み上げの順に並んでいます。手前が空いていると、
                    後ろが高くても現在地は手前になります。
                  </p>
                  <ul className="space-y-1.5" role="list">
                    {AXES.map((axis) => (
                      <li
                        key={axis}
                        className="flex items-baseline justify-between gap-3 text-sm leading-6"
                      >
                        <span
                          className={
                            axis === result.weakest
                              ? "font-bold text-brand-dark"
                              : "text-ink"
                          }
                        >
                          {AXIS_LABELS[axis]}
                        </span>
                        <span className="shrink-0 tabular-nums text-ink-muted">
                          5段階のうち {result.axes[axis]}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[0.6875rem] leading-4 text-ink-muted">
                    ※ 5つの回答から見た範囲です。外部のAIには送っていません。
                  </p>
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------- ⑤おすすめ

/**
 * おすすめの1本。**結果を読み終えてから出す。**
 *
 * 説明は診断の結果から作る（`recommendLead`）。「あなたにおすすめ」
 * とだけ書いてあると、何を見て選んだのか分からない——診断の結果と
 * つながっていない推薦は、広告と区別が付かない。
 */
function LessonView({
  lesson,
  lead,
  waiting,
  others,
  onPick,
}: {
  lesson: Lesson | undefined;
  /** なぜこの1本か。3つに分かれている（`recommendLeadParts`）。 */
  lead: LeadParts;
  /**
   * 診断が本当に指していた1本。**まだ公開していないときだけ渡る。**
   *
   * 黙って Day1 へ差し替えない。答えから出た行き先が画面に出て
   * いないと、「自分に合わせて選ばれた」のか「1本しか無いから
   * そうなった」のかが分からない——診断が効いていないように見える。
   *
   * 開始ボタンは付けない（`onPick` を渡さない）。押せる形にして
   * あるのに押せないのは、見えているだけで届かない道になる。
   */
  waiting?: Lesson;
  /**
   * その1本が刺さらなかった人の行き先。**名前は伏せて、押した人にだけ。**
   *
   * 画面に3枚並べると「次に何をするか」をもう一度選ばせることになる。
   * かといって消すと、画像をやりたくて来た人に「文章を分かりやすく
   * する」だけを出して終わる形になり、自分のための道具ではないと
   * 読まれる。決めるのは上の1本、ここはその逃げ道。
   */
  others: Lesson[];
  onPick?: (lessonId: string) => void;
}) {
  const [also, setAlso] = useState(false);
  const [why, setWhy] = useState(false);
  if (!lesson) return <div className="shrink-0" />;
  const look = lookOf(lesson.id);

  const inside = (
    <>
      <span className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center
                     rounded-card bg-surface text-brand"
        >
          <look.icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.6875rem] font-bold leading-4 text-ink-muted">
            Day {lesson.number}
          </span>
          <span
            className="block text-lg font-bold leading-7 text-brand-dark"
            data-testid="diagnosis-lesson"
          >
            {lesson.title}
          </span>
        </span>
        <IconChevronRight
          className="h-4 w-4 shrink-0 self-center text-brand"
          aria-hidden="true"
        />
      </span>
      {/*
        なぜこの1本か。**カードの中に置く。**

        外に出すと、カードと理由が別のことを言っているように読める。
        推薦と根拠は1つのまとまり。
      */}
      {/*
        なぜこの1本か。**主画面には2文まで。**

        3つつなげると 320px で 4〜5行になり、おすすめの画面だけで
        164px あふれていた（実測）。ここに置くのは**なぜこの1本なのか**に
        直接答える2つ——次に伸ばすとよいことと、その教材で試せること。
        1つ目（いまできていること）は開いて読む側へ回す。
      */}
      <span
        className="mt-3 block border-t border-brand-line/70 pt-3 text-[0.8125rem]
                   leading-6 text-ink"
        data-testid="diagnosis-reason-line"
      >
        {lead.next}
        {/*
          3つ目の文は、狭い端末では出さない（仕様は「1〜2文」なので
          1文でもよい）。320px では2文で5行になり、そのぶん画面が
          あふれていた。消すのではなく、下の「詳しく」へ回してある。
        */}
        <span className="hidden min-[361px]:inline">{lead.here}</span>
      </span>
    </>
  );

  const shape = `block w-full rounded-card border border-brand-line
                 bg-brand-soft px-3.5 py-3 text-left`;

  return (
    <div className="shrink-0">
      {/*
        いま開いている1本には、**そう名乗らせる。**

        準備中の1本を下に添えるとき、上の札に見出しが無いと、
        2つが同じ重さで並んでいるように見える。どちらが今日
        始められるのかを、読む前に決めさせない。
      */}
      {onPick ? (
        <button
          type="button"
          onClick={() => onPick(lesson.id)}
          data-testid="diagnosis-next-skill"
          className={`${shape} transition hover:border-brand`}
        >
          {inside}
        </button>
      ) : (
        <div className={shape} data-testid="diagnosis-next-skill">
          {inside}
        </div>
      )}

      {/*
        1つ目の文（いまできていること）は、押した人にだけ。
        主画面は2文までに抑えてある。
      */}
      {lead.able && (
        <button
          type="button"
          onClick={() => setWhy(true)}
          data-testid="diagnosis-lead-open"
          className="-my-1 mt-3 py-1 text-xs font-bold text-brand-dark underline
                     transition hover:text-brand"
        >
          なぜこの1本か、詳しく
        </button>
      )}

      {why && (
        <DetailSheet
          title="なぜこの1本か"
          onClose={() => setWhy(false)}
          pages={[
            {
              label: "診断からの読み取り",
              body: (
                <div className="space-y-2" data-testid="diagnosis-lead-detail">
                  <p className="text-sm leading-6 text-ink">{lead.able}</p>
                  <p className="text-sm leading-6 text-ink">{lead.next}</p>
                  {lead.here && (
                    <p className="text-sm leading-6 text-ink">{lead.here}</p>
                  )}
                </div>
              ),
            },
            ...(waiting
              ? [
                  {
                    /*
                      診断が本当に指していた1本。**黙って差し替えない。**

                      主画面から外したのは、札がもう1枚増えるとそれだけで
                      90px 使い、320px であふれていたため。**消しては
                      いない**——2文目（「いま開いているのは Day1 です」）が
                      主画面で差し替えを言い、その中身はここで読める。
                    */
                    label: "あなたに合う次のLesson",
                    body: (
                      <div className="space-y-2" data-testid="diagnosis-waiting">
                        <p className="text-sm font-bold leading-6 text-ink">
                          Day {waiting.number} {waiting.title}
                        </p>
                        <p className="text-sm leading-6 text-ink-muted">
                          この1本は準備中です。公開までは、いま開いている
                          Lesson でその手前を練習します。
                        </p>
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}

      {others.length > 0 && (
        <button
          type="button"
          onClick={() => setAlso(true)}
          data-testid="diagnosis-also-open"
          /* 当たり判定を広げる（py と -my を同じだけ。見た目は変わらない） */
          className="-my-1 mt-3 py-1 text-xs text-ink-muted underline
                     transition hover:text-ink"
        >
          ほかの候補も見る
        </button>
      )}

      {also && (
        <MoreSheet
          placement="center"
          testId="diagnosis-also-sheet"
          title="ほかの候補"
          onClose={() => setAlso(false)}
        >
          <p className="text-sm leading-6 text-ink-muted">
            上の1本が合わないときは、こちらから。
          </p>
          <ul className="mt-3 space-y-2" role="list" data-testid="diagnosis-also">
            {others.map((one) => {
              const body = (
                <>
                  <span className="block text-xs font-bold leading-4 text-ink-muted">
                    Day {one.number}
                  </span>
                  <span className="mt-0.5 block text-sm leading-5">{one.title}</span>
                </>
              );
              const row = `block w-full rounded-card border border-line
                           bg-surface px-3 py-2.5 text-left`;
              return (
                <li key={one.id}>
                  {onPick ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAlso(false);
                        onPick(one.id);
                      }}
                      data-testid="diagnosis-also-pick"
                      className={`${row} transition hover:border-brand-line`}
                    >
                      {body}
                    </button>
                  ) : (
                    <span className={row}>{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </MoreSheet>
      )}
    </div>
  );
}
