/**
 * AI活用診断の結果。
 *
 * 1画面を、4つに割った
 * --------------------
 * 前はここが1画面だった。図・できていること・次の一歩・おすすめが
 * 同時に並び、下のボタンは「ここから始める」。**読む前に次へ行く道が
 * 目に入る**ので、結果は読まれずに押される形になっていた。
 * 「あっさりしていて、診断してもらった感じが弱い」と言われたのがそこ。
 *
 *     現在地  … 5段階のどこか。Lesson の話はまだしない
 *     特徴    … 回答から見えた3行と、その元になった自分の答え
 *     4つの力 … ひし形と、強み／次に伸ばす力／次に覚えること
 *     おすすめ … 上の3つを受けた1本。ここで初めて Lesson が出る
 *
 * 順番と文言は `course/diagnosisFlow.ts` が持つ。見出しと下のボタンは
 * `LessonRunner` が出すので、**2つのファイルにまたがる**——片方だけ
 * 直すと画面の上と下で言うことがずれる。
 *
 * 「分析しています」は無い
 * ------------------------
 * 5問目のあとに4つの観点が順に点く画面があったが、消した。採点は
 * 同期で終わる（`course/diagnosisScore.ts` は計算だけ）ので待つものが
 * 無く、しかもあの画面は4つの観点を**白い角丸カードに丸い印**で縦に
 * 並べていた——直前まで答えていた選択肢と見分けが付かず、
 * **自分が押していない項目に勝手にチェックが付く**ように見えていた。
 *
 * 「いまの様子」の一枚をやめた
 * ----------------------------
 * 押すと開く一枚に、現在地・できていること・次にやること・4つの力の
 * 内訳が入っていた。いまはそれが**画面そのもの**になったので、同じ
 * ことを2か所で言っている。廃止した。
 *
 * 図の切り替え（道／ひし形）も同じ理由でやめた。道は現在地の画面、
 * ひし形は4つの力の画面と、**置き場所が役を持った**ので、選ばせる
 * 必要が無くなった。
 *
 * 「この結果になった理由」の一枚もやめた
 * ----------------------------------------
 * 中身（答えた内容と、そこからの判断）は**画面そのもの**にした
 * （`TraitsView`）。一枚のままだと、判断は画面・根拠は一枚と離れて
 * 置かれ、しかも3画面のどこからでも開けるので**同じものが何度も
 * 載る**。押さない人には、根拠が1つも見えないままだった。

 * 残っている一枚は「ほかの候補」だけ。あれは押した人にだけ要る
 * 行き先で、結果の説明ではない。
 *
 * 点数を出さない
 * --------------
 * 68点・82点のような細かい数字は見せない。刻みが細かいほど正確に
 * 見えるが、5問から出した数字にその精度は無い。段は5つまで。
 */

import { useState } from "react";

import { IconCheck, IconChevronRight } from "../Icons";
import { MoreSheet } from "./MoreSheet";
import { GrowthTrack } from "./diagnosis/GrowthTrack";
import { RadarChart } from "./diagnosis/RadarChart";
import {
  AXIS_LABELS,
  NEXT_LEARNING,
  scoreDiagnosis,
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
      {phase === "stage" && <StageView result={result} />}
      {phase === "traits" && (
        <TraitsView result={result} values={values} onEditAnswer={onEditAnswer} />
      )}
      {phase === "axes" && <AxesView result={result} />}
      {phase === "lesson" && (
        <LessonView
          lesson={first}
          lead={recommendLead(values)}
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
 * いまどこにいるか。**ここでは Lesson の話をしない。**
 *
 * 前は同じ画面に「次の一歩 ＋ おすすめ Day1」が並んでいて、現在地を
 * 読み終える前に目がそちらへ行っていた。次の話は3画面あと。
 *
 * 特徴の3行もここから外した。**判断と根拠を1つの画面に置く**ため、
 * 次の画面（`TraitsView`）へ、元になった回答ごと移してある。
 */
function StageView({ result }: { result: ReturnType<typeof scoreDiagnosis> }) {
  return (
    <div className="shrink-0">
      <div className="rounded-card border border-line bg-surface px-4 pb-4 pt-3.5">
        <GrowthTrack stage={result.stage.number} summary />
      </div>
    </div>
  );
}

// ------------------------------------------------- ②回答から見えた特徴

/**
 * 回答から見えた特徴と、**その元になった自分の答え**。
 *
 * 3行だけ出す（できていること2つ・これから1つ）。行の下に、
 * その行の元になった回答を小さく並べる（`traitLines`）。
 *
 * 根拠が無いときは、無いと言う
 * ----------------------------
 * 「これから」の行は、たいてい**その力を動かした答えが1つも無い**から
 * そうなっている。そこで理由を作文すると、5問から分からないことまで
 * 言い切ることになる。出てこなかったことを、そのまま書く。
 *
 * 「なおす」はここにある
 * ----------------------
 * 結果を見てから「そこは違う」と気づく人がいる。気づいたのに直せないと、
 * 出た結果を信じるしかなくなる。答えが並んでいるこの画面が、直す場所
 * としてもいちばん近い。
 */
function TraitsView({
  result,
  values,
  onEditAnswer,
}: {
  result: ReturnType<typeof scoreDiagnosis>;
  values: Record<string, string>;
  onEditAnswer?: (stepId: string) => void;
}) {
  const lines = traitLines(result, values);

  return (
    <div className="shrink-0">
      <ul className="space-y-3" role="list" data-testid="diagnosis-traits">
        {lines.map((line) => (
          <li key={line.text} data-done={line.done ? "yes" : "no"}>
            <p className="flex items-start gap-2 text-sm font-bold leading-6">
              <span
                aria-hidden="true"
                className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center
                            rounded-full text-white ${
                              line.done ? "bg-brand" : "bg-ink-muted"
                            }`}
              >
                <IconCheck className="h-2.5 w-2.5" />
              </span>
              <span className="min-w-0">{line.text}</span>
            </p>

            {/*
              元になった回答。**選んだ札に書いてあった言葉のまま。**

              「なおす」はその答えの行に付ける。どの答えを直すのかが
              押す前に分かる。
            */}
            <ul
              className="mt-1.5 space-y-1 pl-6"
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

        3行はどれも「あなたはこうだ」の形をしている。5問の自己申告と
        ミニ問題から出したものなので、そこまでを言う。
      */}
      <p className="mt-4 text-[0.6875rem] leading-4 text-ink-muted">
        ※ 5つの回答から見た範囲です。
      </p>
    </div>
  );
}

// --------------------------------------------------------- ②4つの力

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
  const rows = [
    { label: "強み", value: `${AXIS_LABELS[result.strongest]}力`, strong: false },
    { label: "次に伸ばす力", value: `${AXIS_LABELS[result.weakest]}力`, strong: true },
    { label: "次に覚えること", value: NEXT_LEARNING[result.weakest], strong: false },
  ];

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
        短い1行。図の前に、何を見ればよいかを言う。

        いちばん低い持ち方（375×667）では出さない。そこで渡せる高さは
        331px しかなく、24px を図から引くと**図が読めない大きさ**に
        なる。この1行は図の読み方の念押しで、無くても図と下の3行で
        通じる——削る順としては先に来る。
      */}
      <p className="hidden shrink-0 text-sm leading-6 text-ink-muted [@media(min-height:700px)]:block">
        4つのうち、どこが薄いかを見ます。
      </p>

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
      <div className="mt-3 flex min-h-[8.5rem] flex-1 justify-center px-8">
        <RadarChart axes={result.axes} focus={result.weakest} />
      </div>

      {/*
        3行は、**名前の欄を折り返させない。**

        前に同じ形の表を作ったとき、名前の欄を 96px にしていて
        「次にやると良いこと」が2行に折れた。折れた行の頭と値の頭が
        段違いになり、3行が表に見えなくなる（実機で撮って分かった）。
      */}
      <dl
        className="mt-4 rounded-card bg-brand-soft/60 px-3.5"
        data-testid="diagnosis-axes-summary"
      >
        {rows.map((row, at) => (
          <div
            key={row.label}
            /*
              低い端末では行を詰める。3行で 144px 取っていたのを
              108px まで下げる——そのぶんが図へ渡る。
            */
            className={`flex items-baseline gap-3 py-1.5 [@media(min-height:700px)]:py-2.5 ${
              at === 0 ? "" : "border-t border-brand-line/60"
            }`}
          >
            <dt className="shrink-0 whitespace-nowrap text-xs leading-5 text-ink-muted">
              {row.label}
            </dt>
            <dd
              className={`min-w-0 flex-1 text-right text-sm leading-5 ${
                row.strong ? "font-bold text-brand-dark" : "font-bold text-ink"
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ------------------------------------------------------- ③おすすめ

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

/**
 * どの回答から判断したかを、人の言葉で並べる。
 *
 * 記号（`tried` `first_time`）のままでは、読んでも自分の答えだと
 * 分からない。**選んだ札に書いてあった言葉**で返す。
 *
 * どの問いの答えかも一緒に返す。「なおす」でその問いへ戻すのに要る。
 */
export function answerLines(
  values: Record<string, string>,
): { stepId: string; text: string }[] {
  const usage: Record<string, string> = {
    never: "AIはまだ使ったことがない",
    tried: "AIを試したことはある",
    sometimes: "困ったときにAIを使う",
    work: "仕事でAIをよく使う",
    daily: "ほぼ毎日、いろいろな用途でAIを使う",
  };
  const style: Record<string, string> = {
    lost: "何を書けばいいか迷う、と答えた",
    short: "とりあえず短くお願いする、と答えた",
    condition: "条件を足して頼むことがある、と答えた",
    adapt: "相手や目的に合わせて頼み方を変える、と答えた",
    design: "仕事の流れに合わせて頼み方を組み立てる、と答えた",
  };

  const lines: { stepId: string; text: string }[] = [];
  if (usage[values.ai_usage ?? ""]) {
    lines.push({ stepId: "ai_usage", text: usage[values.ai_usage] });
  }
  if (style[values.ask_style ?? ""]) {
    lines.push({ stepId: "ask_style", text: style[values.ask_style] });
  }

  const built = (values.build_prompt ?? "").split("|").filter(Boolean);
  if (built.length === 3) {
    lines.push({
      stepId: "build_prompt",
      text: "お願いを、3つの枠で組み立てた（何をしてほしい・誰向け・言い方）",
    });
  }

  const matched = (values.match_purpose ?? "").split("|");
  const answer = ["organize", "compare", "ideas"];
  const hits = answer.filter((one, index) => matched[index] === one).length;
  if (matched.filter(Boolean).length === 3) {
    lines.push({
      stepId: "match_purpose",
      text: `3つの場面のうち、${hits}つで場面に合う使い方を選んだ`,
    });
  }

  return lines;
}
