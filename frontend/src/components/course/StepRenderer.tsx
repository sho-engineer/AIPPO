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
import { FullText } from "./MoreSheet";
import { SkillGet } from "./SkillGet";
import { StepDone } from "./StepDone";
import {
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
import { lookupLesson } from "../../course/live";
import { recommendLessons } from "../../course/recommend";
import { nextLessons, startableLessons } from "../../course/availability";
import { lessonOverview, lessonOverviewFallback } from "../../course/lessonOverview";
import { teachingImage } from "../../course/teachingImages";
import { lessonPlan } from "../../course/lessonPlan";
import { TeachingImage } from "../lessons/TeachingImage";
import { missionStateOf } from "../../course/missions";
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
        <div className="space-y-4">
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
            />
          )}
          <div className="rounded-card border border-brand-line bg-surface p-5">
            <p className="text-sm leading-7">{step.poMessage}</p>
          </div>
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
          flow={missionStateOf(lesson, 0).missions.map((mission) => mission.label)}
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
            何を送るのかは、この画面でも見えるようにしておく（要件 §12）。
            ただし確認のためだけの1画面は挟まない。
            最初の結果までが遠くなると、そこで離れる。
          */}
          {sampleText && (
            <div className="mt-5">
              {/* 名札と本文の面だけ。囲いを二重にしない（条件の画面と同じ） */}
              <p className="text-xs font-bold text-ink-muted">AIにはこう伝えます</p>
              {/*
                3行で切って、押せば全文。

                例文の長さは教材ごとに違う。Day1 の題材を専門的な解説文へ
                変えたとき、ここが丸ごと出ていたせいで**この画面だけ
                100px はみ出した**（e2e/stepFits.spec.ts が捕まえた）。
                例文を短く書き直すのは本末転倒——読めない文章から始めるのが
                この回のねらいなので、**出し方のほう**を畳む。
              */}
              <div className="mt-2">
                <FullText
                  lines={2}
                  label="AIに送る文章"
                  text={sampleText}
                  testId="quick-sample"
                />
              </div>
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
              reviewPoints={meta.reviewPoints ?? []}
              factCheck={meta.factCheck}
              more={<RunHistory runs={runs} flat />}
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
              ? (step.instruction ?? "AIが考えています…")
              : api.error
                ? "止まっています"
                : "送っています。"
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
        const ids = recommendLessons(values);
        return (
          <div data-testid="completion-view">
            <p className="text-sm leading-7 text-ink-muted">
              答えに近いものを3つ選びました。上から順に試すのがおすすめです。
            </p>
            <ol className="mt-4 space-y-3" role="list">
              {ids.map((id, index) => {
                const target = lookupLesson(id);
                if (!target) return null;
                return (
                  <li
                    key={id}
                    data-testid={`recommended-${id}`}
                    className="rounded-card border border-brand-line bg-surface p-4"
                  >
                    <p className="text-xs text-brand-dark">おすすめ {index + 1}</p>
                    <h3 className="mt-1 text-base font-bold">{target.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-ink-muted">
                      {target.goal}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
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
