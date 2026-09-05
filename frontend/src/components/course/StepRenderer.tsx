/**
 * いまのステップに合う見た目を選ぶ。
 *
 * ここは**選ぶだけ**で、進行の判断はしない。何を出すかは教材データ、
 * どう進むかは engine.ts が決める。この分け方を崩すと、教材を1つ足すたびに
 * 画面のコードを直すことになる。
 *
 * なぜ画面本体から切り出したか
 * ----------------------------
 * LessonRunner が670行あり、その半分がこの分岐だった。レッスンの
 * 進め方（送る・戻る・完了する）と、ステップごとの見た目が同じ関数に
 * 混ざっていて、片方を直すときにもう片方を読まされる。
 *
 * ステップごとの部品そのものは StepViews.tsx にある。ここはその
 * 組み合わせ方だけを持つ。
 */

import { IconCaution } from "../Icons";
import { SafetyNote } from "../SafetyNote";
import { AssembleStep } from "./steps/Assemble";
import { DiagnosisResult } from "./DiagnosisResult";
import { SkillGet } from "./SkillGet";
import { StepDone } from "./StepDone";
import {
  AskPreview,
  ChoiceStep,
  ChoiceTiles,
  CompletionView,
  ConceptCardView,
  GeneratingCard,
  ObservationList,
  ObservationReason,
  OutcomePreview,
  PromptPreview,
  QuizStep,
  ResultCompare,
  RunHistory,
  StartChoiceTiles,
  TextStep,
  ThreeWayCompare,
} from "./StepViews";
import { buildAiInput } from "../../course/engine";
import { nextLessons, startableLessons } from "../../course/availability";
import { lessonOverview, lessonOverviewFallback } from "../../course/lessonOverview";
import { teachingImage } from "../../course/teachingImages";
import { lessonPlan } from "../../course/lessonPlan";
import { TeachingImage } from "../lessons/TeachingImage";
import { promptCards, promptText } from "../../course/promptSummary";
import type { Course, Lesson, StepOption } from "../../course/types";
import type { useCourseLesson } from "../../course/useCourseLesson";

export interface StepRendererProps {
  lesson: Lesson;
  api: ReturnType<typeof useCourseLesson>;
  course: Course;
  completedIds: string[];
  /** 正解つきの選択肢で、答えを開いたか。 */
  revealed: boolean;
  setRevealed: (next: boolean) => void;
  /**
   * 導入の一枚を、このレッスンでもう出したか。
   *
   * 出すのはレッスンを開いた1回だけ。進んで戻ってきた人に、
   * もう一度かぶせない（覚えているのは `LessonRunner`）。
   */
  introSeen?: boolean;
  onIntroSeen?: () => void;
  onSelectLesson?: (lessonId: string) => void;
  /** コース完走の締めくくりから「次のコースを見る」を押したとき。 */
  onOpenCourseCatalog?: () => void;
  /** 「やり方をくわしく見る」を押したとき。 */
  onOpenRecipe?: (tipId: string) => void;
  /**
   * 診断の結果から、添えたレッスンを直接始めるとき。
   *
   * `onSelectLesson` をそのまま渡さない。診断を終えた記録
   * （端末のおすすめ・サーバーへの送信）は `LessonRunner` が持って
   * いて、そこを通らずに移ると**受けたことが残らない**。
   */
  onPickLesson?: (lessonId: string) => void;
}

/**
 * 送っている最中に、カードの中へ出す1行。
 *
 * 「AIが考えています…」とは書かない。**AIが何をしているか**ではなく、
 * **こちらの文章がどうなっている最中か**を言う。前者は待たされている
 * 感じだけが残り、しかも中で何が起きているかは本当のところ分からない。
 *
 * 何を頼んだかで言い方を変える。教材が増えたらここに1行足す——
 * 教材データに持たせないのは、これが**待ち時間の見せ方**であって
 * 教材の中身ではないから（`course/teachingImages.ts` と同じ置き方）。
 */
const WAITING: Record<string, string> = {
  rewrite: "読みやすく整えています…",
  improve: "言われたところを直しています…",
  summarize: "要点を取り出しています…",
};

function waitingLine(step: { aiAction?: { action: string } }): string {
  return (step.aiAction && WAITING[step.aiAction.action]) || "整えています…";
}

export function StepRenderer({
  lesson,
  api,
  course,
  completedIds,
  revealed,
  setRevealed,
  introSeen,
  onIntroSeen,
  onSelectLesson,
  onOpenCourseCatalog,
  onOpenRecipe,
  onPickLesson,
}: StepRendererProps) {
  const { step, values, runs } = api;
  const completedCount = completedIds.length;
  /*
    この画面に添える教材の絵。

    どのレッスンのどの画面に出すかは1か所の表が持つ
    （course/teachingImages.ts）。無い組み合わせでは null で、
    そのときは絵の場所ごと出さない。
  */
  const picture = teachingImage(lesson.id, step.id);
  const startable = startableLessons(course.lessons);
  /* 「次におすすめ」。絞り方は Day 完了の画面と共通（availability.ts） */
  const upcoming = nextLessons(course.lessons, lesson.id, completedIds);

  const lastRun = runs[runs.length - 1];
  const meta = (step.meta ?? {}) as {
    reviewPoints?: string[];
    factCheck?: boolean;
    answer?: string[];
    threeWay?: boolean;
    /** 「まだ微妙」を選んだ人にだけ聞く、任意の理由（course/shared.ts）。 */
    reasons?: StepOption[];
  };

  /*
    いま頼んでいること。送っている最中の画面に小さく出す。

    値そのもの（`instruction`）を使う。教材データが持っている札の言葉が
    そのまま出るので、画面と教材がずれない。
  */
  const askedFor = values.instruction ?? "";

  /** 最初の1回で使う例文。空欄から始めさせないために事前に入れておく。 */
  const sampleText = (() => {
    const quick = lesson.steps.find((entry) => entry.type === "quick_try");
    return (quick?.meta as { sampleText?: string } | undefined)?.sampleText;
  })();

  switch (step.type) {
    case "safety_check":
      if (step.options) {
        return (
          <div>
            <div className="flex items-start gap-2 rounded-card bg-caution-soft px-4 py-3 text-sm leading-7 text-caution">
              <IconCaution className="mt-1.5 h-4 w-4 shrink-0" />
              <span>{step.poMessage}</span>
            </div>
            <div className="mt-5">
              <StartChoiceTiles
                onPick={(value) => {
                  api.setValue(step.key ?? "", value);
                  api.goNext();
                }}
                onSkip={api.skipRealTask}
              />
            </div>
          </div>
        );
      }
      return (
        <div className="rounded-card border border-brand-line bg-surface p-5">
          <p className="text-sm leading-7">{step.poMessage}</p>
          <ul className="mt-4 space-y-2 text-sm leading-7" role="list">
            <li>・会社の秘密や個人情報は入力しない</li>
            <li>・数字・日付・固有名詞は、あとで自分で確かめる</li>
            <li>・医療・法律・お金の大事な判断は、専門家にも確認する</li>
          </ul>
        </div>
      );

    case "intro":
      return (
        /*
          絵は**残りの高さに収める。**

          幅いっぱい・高さは比なり、で置いていたころ、いちばん低い
          持ち方（402×660）では絵だけで 241px あり、入れ物（195px）から
          46px はみ出していた。ページは伸びないので外からは分からず、
          入れ物の中で静かに送れる状態——実機の Safari で「開始画面が
          スクロールする」と見えていたのがこれ。

          絵の全部を大きく見せることより、**送らずに始められること**を
          優先する（`fit`）。
        */
        <div className="flex min-h-0 flex-1 flex-col">
          {/*
            絵があるときは、絵を先に置く。

            この画面は「これから何が起きるか」を伝えるためだけにある。
            1枚で伝わるなら、読む前に見せたほうが早い。
            絵は説明の飾りではなく、説明そのもの。
          */}
          {picture && (
            <TeachingImage
              src={picture.src}
              alt={picture.alt}
              width={picture.width}
              height={picture.height}
              fit
            />
          )}
          {/*
            絵の下に、同じことをもう一度書かない。

            前はここに `poMessage` を白いカードで置いていた。ところが
            その文は**すでにポーの吹き出しに出ている**（`PoHero` が
            同じ値を読む）。つまり1画面に同じ1文が2回あり、しかも
            2つ目のせいで画面が縦に伸びて、下の「はじめる」が
            送らないと押せなくなっていた（診断の開始画面で実際にそうなった）。

            絵が中身を説明しているので、その説明を HTML でもう一度
            書き起こす必要も無い。
          */}
        </div>
      );

    case "outcome_preview":
      return (
        /*
          詳しい話は、この画面が持つ（コースの一覧から移した）。
          流れは教材データが持っている区切りをそのまま出す——
          ここで別の言葉を作ると、進行中の帯と食い違う。
        */
        <OutcomePreview
          /*
            導入の一枚に出す言葉。上の帯（StepShell）と同じものを渡す
            ——同じ画面で違うことを言わないため（LessonRunner の
            `outcome_preview` の分岐と揃える）。
          */
          description={lesson.outcomeDescription ?? step.instruction}
          plan={lessonPlan(lesson.id)}
          poMessage={step.poMessage}
          onStart={api.goNext}
          introSeen={introSeen}
          onIntroSeen={onIntroSeen}
          minutes={lesson.estimatedMinutes}
          goal={lesson.goal}
          before={lesson.beforeExample}
          after={lesson.afterExample}
          skills={lesson.learnedSkills ?? []}
          outcomes={lesson.outcomes}
          overview={lessonOverview(lesson)}
          thumbnail={lessonOverviewFallback(lesson)}
        />
      );

    case "concept_card":
      if (!step.card) return null;

      /*
        技の名前を受け取る回は、**その1つだけの画面**にする。

        前はここで細い帯（`SkillGet`）を解説カードの上に積んでいた。
        取った瞬間が説明の前置きになっていて、名前を受け取った感じが
        残らない。解説の本文はもともと1行なので、取った瞬間の下へ
        そのまま添えれば足りる（絵は畳んだままにする）。

        骨格が最初に出す解説（concept_1〜3）は同じ場面を言い換えた
        ものなので、名前を渡すのは**技として名前が付いている回**だけ。
        見分けは教材データの `skill` が持っている。
      */
      if (step.skill) {
        return (
          <SkillGet
            name={step.skill}
            /*
              やさしい言い方は、カードの見出しが持っている
              （「ターゲット指定」＋「誰向けかを伝える」）。
              技の名前と同じ文字のときは繰り返さない。
            */
            summary={step.card.title === step.skill ? undefined : step.card.title}
            detail={step.card.body}
          />
        );
      }

      /*
        見出しはステップ側で既に出ている。カードの中でもう一度書くと、
        1画面に同じ言葉が2回並ぶ（実際そうなっていた）。
      */
      return (
        <ConceptCardView
          card={step.card}
          headingShown={step.card.title === step.title}
          image={picture}
        />
      );

    case "quick_try":
      return (
        <div>
          <ChoiceStep
            step={step}
            value={values[step.key ?? ""] ?? ""}
            onChange={(value) => api.setValue(step.key ?? "", value)}
          />
          {/*
            送る前に、**送る文面そのもの**を見せる（要件 §12）。

            前はここに元の文章（`sampleText`）を置いて、名札だけが
            「AIにはこう伝えます」だった。名札と中身が食い違っていて、
            「この専門文をそのまま送るのか？」と読める。

            いま出すのは、選んだ札から組み立てた1文。**選ぶたびに
            変わる**ので、札を押すことがそのまま「お願いを書くこと」
            だと分かる——Day1 で最初に受け取る技（プロンプト）は
            これのこと（`catalog.ts` の `concept_1`）。

            元の文章は「今日やること」の一枚が持っている。確認のためだけの
            画面をここに挟まない——最初の結果までが遠くなると、そこで離れる。
          */}
          {step.key && (
            <div className="mt-3 [@media(min-height:700px)]:mt-5">
              <AskPreview
                instruction={values[step.key] ?? ""}
                placeholder="上から1つ選ぶと、ここに出ます。"
              />
            </div>
          )}
        </div>
      );
    case "observation":
      return (
        /*
          見比べる面に「残りの高さ」を渡し、下の問いは自分の高さのまま
          置く。AIの結果が長い日でも、問いと下のボタンは動かない。
        */
        <div className="flex min-h-0 flex-1 flex-col">
          {lastRun && (
            <ResultCompare
              before={lastRun.inputText}
              after={lastRun.outputText}
              /*
                見どころは画面に出さず、「変わったところ」の一枚へ回す。
                **答える前に読み物が増える**と、肝心のAIの結果を読む
                場所がそのぶん狭くなる。
              */
              reviewPoints={meta.reviewPoints ?? []}
              showPoints={false}
              /*
                言いかえの対応。全文を突き合わせなくても「簡単に
                なった」が分かるのは、こちらのほう。
              */
              swaps={lessonPlan(lesson.id)?.swaps}
              /*
                タブを置かない。切り替えても答えは変わらないうえ、
                44px はそのまま「AIの結果を読む場所」から引かれる。
                元の文章は「変わったところ」の一枚の中にある。
              */
              onlyResult
              /*
                押した札を、結果の真上に並べる。Section 1 では
                「専門用語を減らす」1枚だけで、条件を足すたびに増える。
              */
              conditions={promptCards(values).map((card) => card.value)}
              factCheck={meta.factCheck}
              /*
                広げない。広げると縮んだ枠が抜粋を切り、「全文を見る」も
                答えの札も下の帯に隠れる（実測でそうなった）。
              */
              fill={false}
            />
          )}
          <div className="mt-3 shrink-0">
            <ObservationList
              step={step}
              value={values[step.key ?? ""] ?? ""}
              onChange={(value) => api.setValue(step.key ?? "", value)}
            />
            {/*
              うまくいかなかった人にだけ、その場で理由を聞く。

              結果の直後の問いを2択に減らすと画面は軽くなるが、
              **何に気づいたかが測れなくなる**。全員に聞き直すと元の
              重さに戻るので、困っている人にだけ出す。答えなくても進める。
            */}
            {(values[step.key ?? ""] ?? "").includes("まだ") && (
              <ObservationReason
                reasons={meta.reasons ?? []}
                value={values.observation_reason ?? ""}
                onChange={(value: string) => api.setValue("observation_reason", value)}
              />
            )}
          </div>
        </div>
      );

    case "condition_choice":
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          {/*
            直前の結果を上に置く。
            条件だけを並べても「何に対して足すのか」が画面から消えていて、
            思い出しながら選ばせることになっていた。
          */}
          {lastRun && (
            <div className="mb-3 flex min-h-0 flex-1 flex-col">
              {/*
                カードの中にカードを入れない。

                前は「いまのAIの結果」という見出し付きのカードの中に、
                もう1枚、薄い地の面を敷いて本文を置いていた。面が二重に
                なると、外側の枠が何を囲っているのかが分からなくなる。
                いるのは**小さな名札と、本文の面**の2つだけ。

                名札の言葉も変えた。「いまのAIの結果」は、こちらが
                手順を説明する言い方になっている。読む人から見れば、
                これは「さっき出てきた文」でしかない。
              */}
              <p className="shrink-0 text-xs font-bold text-ink-muted">
                さっき出てきた文
              </p>
              {/*
                残りの高さに収める。長い回答が来た日でも、下の条件の札と
                「次へ」が画面から出ていかない。
              */}
              <p
                className="mt-1.5 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap
                           break-words rounded-card border border-line bg-surface p-2.5
                           text-sm leading-6"
              >
                {lastRun.outputText}
              </p>
            </div>
          )}
          <div className="shrink-0">
            <ChoiceTiles
              step={step}
              value={values[step.key ?? ""] ?? ""}
              onChange={(value) => api.setValue(step.key ?? "", value)}
            />
          </div>
        </div>
      );

    case "assemble":
      /*
        枠を埋める回。押しても「正解！」は出さない——採点されている感が
        出た瞬間、診断はテストになる（`steps/Assemble.tsx`）。
      */
      return (
        <AssembleStep
          step={step}
          value={values[step.key ?? ""] ?? ""}
          onChange={(next) => api.setValue(step.key ?? "", next)}
        />
      );

    case "single_choice":
    case "multi_choice":
      return meta.answer ? (
        <QuizStep
          step={step}
          value={values[step.key ?? ""] ?? ""}
          onChange={(value) => {
            api.setValue(step.key ?? "", value);
            setRevealed(true);
          }}
          revealed={revealed}
        />
      ) : (
        <ChoiceStep
          step={step}
          value={values[step.key ?? ""] ?? ""}
          onChange={(value) => api.setValue(step.key ?? "", value)}
          multiple={step.type === "multi_choice"}
        />
      );

    case "text_input":
    case "template_builder":
    case "real_task":
      return (
        /*
          入力欄に「残りの高さ」を渡す。注意書きは自分の高さのまま
          下に残るので、書く場所と「次へ」がいつも同時に見える。
        */
        <div className="flex min-h-0 flex-1 flex-col">
        <TextStep
          step={step}
          value={values[step.key ?? ""] ?? ""}
          onChange={(value) => api.setValue(step.key ?? "", value)}
          sampleText={step.type === "real_task" ? undefined : sampleText}
          onHint={api.showHint}
          hintsLeft={(step.hints?.length ?? 0) - api.hintIndex}
        />
        {/* 入れてはいけないものを、書き始める前に伝える（§15） */}
        <div className="shrink-0">
          <SafetyNote placement="input" />
        </div>
        </div>
      );

    case "prompt_preview": {
      const input = buildAiInput(step, values);
      /*
        自分で選んだ条件に印を付ける。

        値が `values` に入っていれば、この人が選んだもの。教材が
        最初から持っている値と、自分で足した値を見分けるのはここだけ。
        印が無いと、AIへ渡す一覧を眺めるだけになり、**さっきの操作が
        効いている**という繋がりが切れる。
      */
      const chosen = new Set(
        Object.values(values).filter((value) => typeof value === "string" && value),
      );
      const cards = promptCards(input).map((card) => ({
        ...card,
        added: chosen.has(card.value),
      }));
      return (
        <PromptPreview
          cards={[
            { label: "やること", value: lesson.title },
            ...cards,
          ]}
          detail={promptText(lesson.title, input, { withSource: true })}
        />
      );
    }

    case "ai_generate":
      /*
        失敗の文はここに書かない。

        前は同じ文が3か所へ同時に出ていた——この生成カード、ポーの
        吹き出し、そして下のボタンのそば。同じことを3回言われると、
        3つ別のことが起きたのかと読んでしまう。

        失敗は下のボタンのそばに1度だけ出す（StepShell の error）。
        押し直す場所のいちばん近くに置くのが、いちばん短い動線になる。
        ここは「いま何をしている最中か」だけを持つ。
      */
      return (
        <GeneratingCard
          busy={api.isSubmitting}
          failed={Boolean(api.error)}
          message={
            api.isSubmitting
              ? waitingLine(step)
              : api.error
                ? "止まっています"
                : "送っています。"
          }
          /*
            いま頼んでいる中身。**自分が選んだ言葉をそのまま返す。**

            待っている数秒のあいだに見えるのはここだけで、押した札を
            思い出せないと、返ってきたものが何のせいで変わったのかが
            分からなくなる。
          */
          note={
            api.isSubmitting && askedFor
              ? `${askedFor}ように、伝わりやすくしています。`
              : undefined
          }
        />
      );

    case "result_review":
    case "result_compare":
    case "improvement_choice":
      /*
        AIから結果が返ったところは、このレッスンで一番手応えのある瞬間。
        ここで一度だけ短く返す。最後の完了画面まで何も返さないと、
        途中の18歩が手応えの無いまま過ぎる。
      */
      if (meta.threeWay && runs.length >= 2) {
        return (
          <div className="flex min-h-0 flex-1 flex-col">
            {/*
              届いた合図。**見出しとポーが同じことを言っている**ので、
              ここでは音と読み上げだけにする（`subtle`）。理由は
              `StepDone.tsx` の `subtle` に書いた。
            */}
            <StepDone label="AIが書き直しました" trigger={runs.length} subtle />
            <ThreeWayCompare
              original={runs[0].inputText}
              first={runs[0].outputText}
              improved={runs[runs.length - 1].outputText}
              condition={values.condition ?? ""}
              picture={picture}
            />
            {/*
              条件を足す前と後を、自分の結果で見比べた**あと**に、
              同じことを図で1枚置く。

              前はこの絵が上にあった。コメントには「先には出さない」と
              書いてあったのに、読む順では絵が先に来ていた——答えを見て
              から自分の結果を確かめる作業になる。自分の結果が主で、
              図はその裏取り。
            */}
            {/*
              図はここに置かない。

              自分の結果で見比べたあとの裏取りとして要るものだが、
              Pixel 5 で 235px あり、**この画面がはみ出す一番の原因**
              だった。1画面＝1アクションに収めるため、「変わったところを
              見る」の一枚（`MoreSheet`）の中へ移した。無くしてはいない。
            */}
            {/*
              これまでの結果は「変わったところを見る」の一枚が持つ
              （そこの「ここまでの道のり」が同じものを並べている）。
            */}
            <div className="shrink-0">
              <SafetyNote placement="output" />
            </div>
          </div>
        );
      }
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 届いた合図。音と読み上げだけ（理由は `StepDone` の `subtle`） */}
          {lastRun && (
            <StepDone label="AIが書き直しました" trigger={runs.length} subtle />
          )}
          {lastRun && (
            <ResultCompare
              before={lastRun.inputText}
              after={lastRun.outputText}
              reviewPoints={meta.reviewPoints ?? ["元の意味が変わっていないか"]}
              factCheck={meta.factCheck}
              /* これまでの結果は、画面ではなく一枚の中へ */
              more={<RunHistory runs={runs} flat />}
            />
          )}
          {step.type === "improvement_choice" && (
            <div className="mt-5 shrink-0">
              <ChoiceStep
                step={step}
                value={values.improvement ?? ""}
                onChange={(value) => api.setValue("improvement", value)}
              />
            </div>
          )}
          {/* AIの回答をそのまま信じないことを、結果のそばで伝える（§15） */}
          <div className="shrink-0">
            <SafetyNote placement="output" />
          </div>
        </div>
      );

    case "reflection":
      return (
        <div className="rounded-card border border-brand-line bg-surface p-5">
          <p className="text-sm leading-7">{step.poMessage}</p>
          <ul className="mt-4 space-y-2 text-sm leading-7" role="list">
            {lesson.outcomes.map((outcome) => (
              <li key={outcome}>・{outcome}</li>
            ))}
          </ul>
          {api.realTaskSkipped && (
            <p className="mt-4 text-xs text-ink-muted">
              自分の文章での練習は、あとからでも試せます。
            </p>
          )}
        </div>
      );

    case "completion":
      if (lesson.id === "diagnosis") {
        /*
          上から **図・図・次にやること**（`DiagnosisResult.tsx`）。
          読まなくても現在地が分かる形にしてある。長い話と、答えの
          直しは「くわしく見る」の一枚の中。
        */
        return (
          <DiagnosisResult
            values={values}
            lessons={course.lessons}
            onEditAnswer={api.goTo}
            onPickLesson={onPickLesson}
          />
        );
      }
      return (
        <CompletionView
          course={course}
          skills={lesson.learnedSkills ?? lesson.outcomes}
          /*
            できるようになったこと。完了画面のいちばん上に出す。

            `learnedSkills` を技として出しているとき**だけ**渡す。
            両方が同じ配列だと、同じ文が2枚のカードに並ぶ。
          */
          outcomes={lesson.learnedSkills ? lesson.outcomes : undefined}
          outcomeText={lastRun?.outputText}
          outcomeLabel={
            api.realTaskSkipped ? "AIが書いた文章（練習）" : "AIが書いた文章"
          }
          lessonId={lesson.id}
          lessonNumber={lesson.number}
          /*
            このレッスンぶんを足して数える。
            画面を出している時点ではまだ「完了」を記録していないので、
            足さないと「最後の1本を終えたのに 8/9」のままになる。
          */
          done={completedCount + (completedIds.includes(lesson.id) ? 0 : 1)}
          /*
            分母は始められる教材の数。ホームの進み具合と揃える。
            片方だけ近日公開を数えると、同じコースなのに
            画面によって「n/9」と「n/12」が出る。
          */
          total={startable.length}
          next={upcoming}
          completedIds={completedIds}
          onSelectLesson={onSelectLesson}
          onOpenCourseCatalog={onOpenCourseCatalog}
          onOpenRecipe={onOpenRecipe}
          award={api.award}
        />
      );

    default:
      return null;
  }
}

// 依頼内容の組み立ては course/promptSummary.ts へ移した。
// 送る前の確認と、あとで取っておく帳面で、同じ組み立てを使うため。
