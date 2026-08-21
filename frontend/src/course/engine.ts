/**
 * レッスンの進み方。
 *
 * **進行を決めるのはここであって、AI ではない。**
 * AI の返事は表示を変えるだけで、ステップを動かさない。
 *
 * 不正な遷移は起こさない。
 * 「次へ」は教材データが宣言した行き先か、並び順の次にしか進まない。
 * 知らない id を渡されたときは、いまの場所に留まる。
 */

import type { Lesson, LessonStep, StepValues } from "./types";

export function stepIndex(lesson: Lesson, stepId: string): number {
  return lesson.steps.findIndex((step) => step.id === stepId);
}

export function findStep(lesson: Lesson, stepId: string): LessonStep | null {
  return lesson.steps.find((step) => step.id === stepId) ?? null;
}

export function firstStepId(lesson: Lesson): string {
  return lesson.steps[0]?.id ?? "";
}

/**
 * 次のステップ id。
 *
 * 行き先が見つからないときは現在地を返す。
 * 教材データの書き間違いで、画面が真っ白になったり
 * 存在しない場所へ飛んだりしないようにする。
 */
export function nextStepId(lesson: Lesson, currentId: string): string {
  const index = stepIndex(lesson, currentId);
  if (index < 0) return currentId;

  const declared = lesson.steps[index].next;
  if (declared) {
    return stepIndex(lesson, declared) >= 0 ? declared : currentId;
  }

  const following = lesson.steps[index + 1];
  return following ? following.id : currentId;
}

/** ひとつ前。入力は消さないので、戻っても失われない（要件 §6.6）。 */
export function previousStepId(lesson: Lesson, currentId: string): string {
  const index = stepIndex(lesson, currentId);
  if (index <= 0) return currentId;
  return lesson.steps[index - 1].id;
}

export function canGoBack(lesson: Lesson, currentId: string): boolean {
  return stepIndex(lesson, currentId) > 0;
}

/** いま何番目か。1始まりで返す。進捗バーに使う。 */
export function progressOf(lesson: Lesson, currentId: string) {
  const index = stepIndex(lesson, currentId);
  return {
    current: Math.max(1, index + 1),
    total: lesson.steps.length,
  };
}

/**
 * その値が「その他（自由入力）」かどうか。
 *
 * 選択肢に無い値が入っていれば自由入力とみなす。
 * 別のフラグを持たせると、復元したときに食い違う。
 */
export function isFreeValue(step: LessonStep, value: string): boolean {
  if (!value) return false;
  const options = step.options ?? [];
  if (options.length === 0) return false;
  return !options.some((option) => option.value === value);
}

/** 「その他」の選択肢を持っているか。 */
export function hasFreeOption(step: LessonStep): boolean {
  return (step.options ?? []).some((option) => option.free);
}

export interface StepIssue {
  /** ボタンの近くに出す理由（要件 §6.6）。禁止ではなく案内。 */
  reason: string;
  /** 送信そのものを止めるか。短すぎるだけなら止めない。 */
  blocking: boolean;
}

/**
 * このステップを終えられるか。
 *
 * 「短すぎる」はエラーにしない。提案として出し、送信は通す。
 * 初心者の手が止まる原因のほとんどは、書けないことではなく
 * 「これでいいのか分からない」なので、止めると余計に進めなくなる。
 */
export function checkStep(step: LessonStep, values: StepValues): StepIssue | null {
  const rules = step.validationRules ?? {};
  const key = step.key;
  if (!key) return null;

  const value = (values[key] ?? "").trim();
  const required = step.required ?? rules.required ?? false;

  if (required && !value) {
    /*
      見出しを文に混ぜない。

      見出しは「条件を一つ足してみましょう」のように、それ自体が文に
      なっていることがある。混ぜると「条件を一つ足してみましょうを
      えらんでみましょう。」になる（実際に出た）。
      何をすればよいかは、書く欄か選ぶ札かで決まる。そこだけを言う。
    */
    return {
      reason: step.options?.length ? "ひとつ選んでください。" : "入力してください。",
      blocking: true,
    };
  }

  if (rules.maxLength && value.length > rules.maxLength) {
    return {
      reason: `${rules.maxLength}文字までにしてみましょう。`,
      blocking: true,
    };
  }

  if (value && rules.suggestLength && value.length < rules.suggestLength) {
    return {
      reason: `もう少し書き足すと、AIの答えが変わります（${rules.suggestLength}文字くらいが目安）。`,
      blocking: false,
    };
  }

  return null;
}

/** AI へ渡す引数を組み立てる。教材データの対応表どおりに詰め替えるだけ。 */
export function buildAiInput(step: LessonStep, values: StepValues): StepValues {
  const spec = step.aiAction;
  if (!spec) return {};

  const input: StepValues = { ...(spec.fixed ?? {}) };
  for (const [valueKey, argName] of Object.entries(spec.inputs)) {
    input[argName] = values[valueKey] ?? "";
  }
  return input;
}

/**
 * 入力済みの内容を、上部のサマリーカードへ出す形にする（要件 §6.4）。
 *
 * 現在地より前のステップだけを見る。
 * まだ答えていない先の欄まで出すと、何を聞かれているのか分からなくなる。
 *
 * 出すのは、選んだ言葉のほう
 * --------------------------
 * 教材の中では答えを `writing` `tried` のような短い記号で持っている。
 * ここへそのまま出すと、日本語の画面に英語の記号が並ぶ。
 * しかも記号は教材の中でしか意味を持たないので、
 * 別の質問で同じ `writing` が出て、2つの答えが同じに見えることまであった。
 *
 * 選択肢を持つ回では、その人が実際に押した札の言葉を出す。
 * 自分で書いた回（選択肢が無い）は、書いた文字がそのまま答えなので、
 * そちらはそのまま出す。
 */
export function summaryOf(
  lesson: Lesson,
  currentId: string,
  values: StepValues,
): { stepId: string; label: string; value: string }[] {
  const index = stepIndex(lesson, currentId);
  if (index < 0) return [];

  return lesson.steps
    .slice(0, index)
    .filter((step) => step.key && (values[step.key] ?? "").trim())
    .map((step) => {
      const answer = values[step.key as string];
      /*
        「その他（自分で書く）」で入れた言葉は、選択肢のどれにも一致しない。
        見つからなければ、書いた言葉をそのまま出す。
      */
      const chosen = step.options?.find((option) => option.value === answer);
      return {
        stepId: step.id,
        label: step.title,
        value: chosen?.label ?? answer,
      };
    });
}
