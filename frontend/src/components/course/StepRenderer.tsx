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

import { Card, CardHeading } from "../AppShell";
import { IconCaution, IconSparkle } from "../Icons";
import { SafetyNote } from "../SafetyNote";
import { StepDone } from "./StepDone";
import {
  ChoiceStep,
  ChoiceTiles,
  CompletionView,
  ConceptCardView,
  GeneratingCard,
  ObservationList,
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
import { startableLessons } from "../../course/availability";
import { lessonThumbnail } from "../../course/lessonThumbnail";
import { promptCards, promptText } from "../../course/promptSummary";
import type { Course, Lesson } from "../../course/types";
import type { useCourseLesson } from "../../course/useCourseLesson";

export interface StepRendererProps {
  lesson: Lesson;
  api: ReturnType<typeof useCourseLesson>;
  course: Course;
  completedIds: string[];
  /** 正解つきの選択肢で、答えを開いたか。 */
  revealed: boolean;
  setRevealed: (next: boolean) => void;
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
  onSelectLesson,
  onOpenCourseCatalog,
  onOpenRecipe,
}: StepRendererProps) {
  const { step, values, runs } = api;
  const completedCount = completedIds.length;
  /*
    次に勧める教材。

    **始められるものだけ**にする。近日公開のものを勧めると、
    押した先で止まる。終わった直後の「次はこれ」で行き止まりに当たるのは、
    何も勧めないより悪い。
  */
  const startable = startableLessons(course.lessons);
  const nextLessons = startable
    .filter(
      (entry) =>
        entry.id !== lesson.id &&
        entry.usesAi &&
        !completedIds.includes(entry.id),
    )
    .slice(0, 2);

  const lastRun = runs[runs.length - 1];
  const meta = (step.meta ?? {}) as {
    reviewPoints?: string[];
    factCheck?: boolean;
    answer?: string[];
    threeWay?: boolean;
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
        <div className="rounded-card border border-brand-line bg-surface p-5">
          <p className="text-sm leading-7">{step.poMessage}</p>
        </div>
      );

    case "outcome_preview":
      return (
        <OutcomePreview
          minutes={lesson.estimatedMinutes}
          before={lesson.beforeExample}
          after={lesson.afterExample}
          skills={lesson.learnedSkills ?? lesson.outcomes}
          thumbnail={lessonThumbnail(lesson)}
        />
      );

    case "concept_card":
      /*
        見出しはステップ側で既に出ている。カードの中でもう一度書くと、
        1画面に同じ言葉が2回並ぶ（実際そうなっていた）。
      */
      return step.card ? (
        <ConceptCardView
          card={step.card}
          headingShown={step.card.title === step.title}
        />
      ) : null;

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
              <Card>
                <CardHeading icon={IconSparkle} tone="plain">
                  AIにはこう伝えます
                </CardHeading>
                <p className="mt-4 whitespace-pre-wrap rounded-card bg-canvas p-4 text-sm leading-7">
                  {sampleText}
                </p>
              </Card>
            </div>
          )}
        </div>
      );

    case "observation":
      return (
        <div>
          {lastRun && (
            <ResultCompare
              before={lastRun.inputText}
              after={lastRun.outputText}
              reviewPoints={meta.reviewPoints ?? []}
              factCheck={meta.factCheck}
            />
          )}
          <div className="mt-6">
            <ObservationList
              step={step}
              value={values[step.key ?? ""] ?? ""}
              onChange={(value) => api.setValue(step.key ?? "", value)}
            />
          </div>
        </div>
      );

    case "condition_choice":
      return (
        <div>
          {/*
            直前の結果を上に置く。
            条件だけを並べても「何に対して足すのか」が画面から消えていて、
            思い出しながら選ばせることになっていた。
          */}
          {lastRun && (
            <Card className="mb-5">
              <CardHeading icon={IconSparkle} tone="plain">
                いまのAIの結果
              </CardHeading>
              <p className="mt-4 whitespace-pre-wrap break-words rounded-card bg-canvas p-4 text-sm leading-7">
                {lastRun.outputText}
              </p>
            </Card>
          )}
          <ChoiceTiles
            step={step}
            value={values[step.key ?? ""] ?? ""}
            onChange={(value) => api.setValue(step.key ?? "", value)}
          />
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
        <>
        <TextStep
          step={step}
          value={values[step.key ?? ""] ?? ""}
          onChange={(value) => api.setValue(step.key ?? "", value)}
          sampleText={step.type === "real_task" ? undefined : sampleText}
          onHint={api.showHint}
          hintsLeft={(step.hints?.length ?? 0) - api.hintIndex}
        />
        {/* 入れてはいけないものを、書き始める前に伝える（§15） */}
        <SafetyNote placement="input" />
        </>
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
          <div>
            <StepDone label="AIが書き直しました" trigger={runs.length} />
            <ThreeWayCompare
              original={runs[0].inputText}
              first={runs[0].outputText}
              improved={runs[runs.length - 1].outputText}
              condition={values.condition ?? ""}
            />
            <SafetyNote placement="output" />
            <RunHistory runs={runs} />
          </div>
        );
      }
      return (
        <div>
          {lastRun && (
            <StepDone label="AIが書き直しました" trigger={runs.length} />
          )}
          {lastRun && (
            <ResultCompare
              before={lastRun.inputText}
              after={lastRun.outputText}
              reviewPoints={meta.reviewPoints ?? ["元の意味が変わっていないか"]}
              factCheck={meta.factCheck}
            />
          )}
          {step.type === "improvement_choice" && (
            <div className="mt-6">
              <ChoiceStep
                step={step}
                value={values.improvement ?? ""}
                onChange={(value) => api.setValue("improvement", value)}
              />
            </div>
          )}
          {/* AIの回答をそのまま信じないことを、結果のそばで伝える（§15） */}
          <SafetyNote placement="output" />
          <RunHistory runs={runs} />
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
          next={nextLessons}
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
