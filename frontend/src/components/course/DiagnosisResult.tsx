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
import { Analyzing } from "./diagnosis/Analyzing";
import { GrowthTrack } from "./diagnosis/GrowthTrack";
import { RadarChart } from "./diagnosis/RadarChart";
import { prefersReducedMotion } from "../../course/motion";
import {
  AXIS_LABELS,
  NEXT_LEARNING,
  scoreDiagnosis,
  stageReason,
  traitLines,
} from "../../course/diagnosisScore";
import type { DiagnosisPhase } from "../../course/diagnosisFlow";
import { lookOf } from "../../course/presentation";
import { recommendLead, recommendPlan } from "../../course/recommend";
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
  /**
   * 整理中の1枚を見終わった。**現在地へ移る合図。**
   *
   * 画面を決めているのは `LessonRunner` なので、移るのもあちら。
   * ここから呼ぶのは「終わった」ことだけ。
   */
  onAnalyzed?: () => void;
}

export function DiagnosisResult({
  values,
  lessons,
  phase,
  onEditAnswer,
  onPickLesson,
  onAnalyzed,
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
      {phase === "analyzing" && (
        <Analyzing
          /*
            **結果ができているか**を、演出と別に渡す。

            採点は同期の計算なので、ここまで来ていれば `result` は
            できている。それでも旗を立てて渡すのは、「時間が来たから
            次へ」という作りにしないため——そう書くと、失敗しても
            時間だけで進む形がいつでも作れてしまう。
          */
          ready={Boolean(result)}
          reduced={prefersReducedMotion()}
          onDone={onAnalyzed ?? (() => {})}
        />
      )}
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
          lead={recommendLead(values, first, Boolean(plan.waiting))}
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
 * いまどこにいるか。**判定と、その理由を同じ画面に。**
 *
 * 前は2枚に割れていた
 * --------------------
 * 「あなたの現在地」には段の名前と道だけ、「回答から見えた特徴」には
 * 3行とその根拠。**判断と根拠が別の画面**にあるので、現在地のほうは
 * 「そう出た」としか読めず、特徴のほうは答えの復習にしかならない。
 * 押して次へ行く回数も1つ増えていた。
 *
 * 1枚にまとめた。出す順は、読む順そのもの。
 *
 *     道      … 5段階のどこか（形で）
 *     段の名前 … そこの呼び名（言葉で）
 *     理由    … **なぜそこなのか**（1〜2文）
 *     特徴    … 回答から見えたこと（最大2つ）と、元になった答え
 *
 * 理由は作文しない
 * ----------------
 * 判定の決め方をそのまま言葉にする（`stageReason`）。現在地は
 * 「積み上げの順で見て、最初に届かなかった軸」から決まるので、
 * 言うのは**どこまで届いたか**と**どこが最初に空いたか**だけ。
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
  /*
    特徴は2つまで。**後ろから採る**ので、最後は必ず「これから」になる
    ——そこが次の画面（4つの力）へのつながり。
  */
  const lines = traitLines(result, values, 2);
  const reason = stageReason(result);

  return (
    <div className="shrink-0">
      <div
        className="rounded-card border border-line bg-surface px-4 py-3
                   [@media(min-height:700px)]:pb-4 [@media(min-height:700px)]:pt-3.5"
      >
        {/*
          道と段の名前。説明文（`summary`）は出さない——下に「なぜ
          そこなのか」が来るので、同じ画面で2通りの説明が並ぶ。
        */}
        <GrowthTrack stage={result.stage.number} />

        {/*
          そうなった理由。**判定の決め方から作る。**

          「条件を加える力」が高いのに現在地が手前、という組み合わせは
          実際に起きる（積み上げの順で見るため）。そのときは、なぜ
          そう出るのかも一緒に言う（`stageReason` の2文目）。
        */}
        <div
          className="mt-2.5 border-t border-line pt-2.5
                     [@media(min-height:700px)]:mt-3 [@media(min-height:700px)]:pt-3"
          data-testid="diagnosis-stage-reason"
        >
          {reason.map((text) => (
            <p key={text} className="text-[0.8125rem] leading-6 text-ink first:mt-0 [&+p]:mt-1.5">
              {text}
            </p>
          ))}
        </div>
      </div>

      {/*
        回答から見えたこと。**元になった自分の答えを、その場に添える。**

        行だけを出すと、どこからそう判断したのかが分からない。
        根拠は作文せず、**選んだ札に書いてあった言葉**をそのまま置く
        （`answerLines`）。

        「これから」の行には、たいてい根拠になる答えが無い——その力を
        動かした回答が1つも無いからそうなっている。無理に理由を作らず、
        5問に出てこなかったことをそのまま書く。
      */}
      <ul
        className="mt-2.5 space-y-2 [@media(min-height:700px)]:mt-3
                   [@media(min-height:700px)]:space-y-2.5"
        role="list"
        data-testid="diagnosis-traits"
      >
        {lines.map((line, at) => (
          <li
            key={line.text}
            data-done={line.done ? "yes" : "no"}
            /*
              低い端末では、**1つに絞る**（仕様は「最大2項目」）。

              1項目は、行と、その元になった答えと、「なおす」で
              90px 前後。375×667 では2つ並べるとそれだけで画面が
              あふれる。落とすのは前のほう——最後の1つは必ず
              「これから」で、次の画面へのつながりになっている。
            */
            className={
              at < lines.length - 1
                ? "hidden [@media(min-height:700px)]:block"
                : undefined
            }
          >
            <p className="flex items-start gap-2 text-[0.8125rem] font-bold leading-6">
              {/*
                印は、**言っていることと合わせる。**

                前はどちらの行にも同じチェックを付け、色だけ変えて
                いた。「AIへの頼み方はこれから」にチェックが付いて
                いる状態で、実機の写しで見て気づいた——チェックは
                「済んだ」の印なので、**まだのことを済んだと言って
                いる**ことになる。色が見えない人には、その矛盾しか
                残らない。

                できていることはチェック、これからは矢印にする。
              */}
              <span
                aria-hidden="true"
                className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center
                            rounded-full text-white ${
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
                    className="flex items-start justify-between gap-2 text-xs leading-5
                               text-ink-muted"
                  >
                    <span className="min-w-0">{entry.text}</span>
                    {onEditAnswer && (
                      /*
                        「なおす」はここにある。結果を見てから「そこは
                        違う」と気づく人がいて、直せないと出た結果を
                        信じるしかなくなる。答えが並ぶこの場所が、直す
                        入口としていちばん近い。
                      */
                      <button
                        type="button"
                        onClick={() => onEditAnswer(entry.stepId)}
                        data-testid="diagnosis-edit-answer"
                        className="shrink-0 rounded-badge border border-line px-2 py-0.5
                                   text-[0.6875rem] leading-4 text-brand-dark transition
                                   hover:bg-brand-soft"
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
      </ul>

      {/*
        言い切らない。**5問から分かる範囲**をここで断っておく。

        上の行はどれも「あなたはこうだ」の形をしている。5問の自己申告と
        ミニ問題から出したものなので、そこまでを言う。
      */}
      <p className="mt-2 text-[0.6875rem] leading-4 text-ink-muted [@media(min-height:700px)]:mt-3">
        ※ 5つの回答から見た範囲です。外部のAIには送っていません。
      </p>
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
      <div className="mt-1 flex min-h-[10rem] flex-1 justify-center px-8">
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
        className="mt-3 shrink-0 rounded-card bg-brand-soft/60 px-3.5 py-2
                   [@media(min-height:700px)]:py-2.5"
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
          次に覚えること。**見出しの下へ、左ぞろえ。**

          技の名前（「ターゲット指定」）ではなく、やることで書く
          （`NEXT_LEARNING`）。名前はこのアプリの中の呼び名で、初めて
          見る人には何をするのか分からない。
        */}
        <div className="mt-1.5 border-t border-brand-line/60 pt-1.5">
          <dt className="text-xs leading-5 text-ink-muted">次に覚えること</dt>
          <dd
            className="mt-0.5 text-[0.8125rem] font-bold leading-5 text-ink"
            data-testid="diagnosis-next-learning"
          >
            {NEXT_LEARNING[result.weakest]}
          </dd>
        </div>
      </dl>
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
  lead: string;
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
      <span
        className="mt-3 block border-t border-brand-line/70 pt-3 text-[0.8125rem]
                   leading-6 text-ink"
        data-testid="diagnosis-reason-line"
      >
        {lead}
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
      {waiting && (
        <p
          className="mb-1.5 text-xs font-bold leading-5 text-ink-muted"
          data-testid="diagnosis-open-label"
        >
          今受けられるおすすめ
        </p>
      )}

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

      {waiting && (
        /*
          本来のおすすめ。**押せない札として置く。**

          `button` にしない——押せる見た目のものが押せないのが
          いちばん悪い。ここは知らせであって、道ではない。
        */
        <div className="mt-3" data-testid="diagnosis-waiting">
          <p className="text-xs font-bold leading-5 text-ink-muted">
            あなたに合う次のLesson
          </p>
          <div
            className="mt-1.5 flex items-center gap-3 rounded-card border border-line
                       bg-surface px-3.5 py-2.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[0.6875rem] font-bold leading-4 text-ink-muted">
                Day {waiting.number}
              </span>
              <span className="block text-sm font-bold leading-5 text-ink">
                {waiting.title}
              </span>
            </span>
            <span
              className="shrink-0 rounded-badge bg-brand-soft px-2 py-0.5
                         text-[0.6875rem] font-bold leading-4 text-brand-dark"
              data-testid="diagnosis-waiting-badge"
            >
              準備中
            </span>
          </div>
        </div>
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
