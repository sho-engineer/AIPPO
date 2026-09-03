/**
 * レッスンの中の区切り（ミッション）。
 *
 * なぜ要るか
 * ----------
 * 1本のレッスンは19歩ある。帯と「3 / 19」だけだと、**19歩ぶんの
 * 一本道**に見える。始めた人が最初に思うのは「あと16回も押すのか」で、
 * これは実際より長く感じる——中身は4つのまとまりに分かれていて、
 * どれも数歩で終わるのに、その形が画面に出ていなかった。
 *
 * 区切りは既にある
 * ----------------
 * `LESSON_PHASES`（試す → 変える → 深める → 自分で使う）が
 * それで、教材データの各ステップが `phase` を持っている。
 * `StepShell` は受け取っていたが描いていなかった。新しく作らず、
 * これをそのまま出す。増やすと、データと画面で区切りが2種類になる。
 *
 * 持っていない教材もある
 * ----------------------
 * 骨格から作っていない教材（診断・安全に使う・自分の困りごと）は
 * `phase` を持たない。**そこだけ区切りが消えると、画面の作りが
 * 教材ごとに変わる**ので、種類から補う（下の `FALLBACK`）。
 *
 * 後戻りさせない
 * --------------
 * 並びの途中で前の区切りへ戻る値が入っていても、進んだ側に寄せる。
 * 帯が戻るのは「進んでいない」と読まれるので、データの書き間違いが
 * そのまま**進み具合が減る画面**になるのを防ぐ。
 */

import { LESSON_PHASES, type Lesson, type LessonPhase, type StepType } from "./types";

/** 区切りの並び順。`LESSON_PHASES` の並びがそのまま順序。 */
const ORDER: LessonPhase[] = LESSON_PHASES.map((phase) => phase.key);

const LABEL = new Map<LessonPhase, string>(
  LESSON_PHASES.map((phase) => [phase.key, phase.label]),
);

/**
 * `phase` を持たないステップの補い方。
 *
 * 骨格から作っていない教材でも、同じ4区切りに収まるようにする。
 * ここに無い種類は、直前のステップと同じ区切りに入る。
 */
const FALLBACK: Partial<Record<StepType, LessonPhase>> = {
  intro: "try",
  outcome_preview: "try",
  quick_try: "try",
  single_choice: "try",
  multi_choice: "try",
  text_input: "try",
  template_builder: "try",
  prompt_preview: "try",
  ai_generate: "try",
  observation: "try",
  concept_card: "try",
  condition_choice: "compare",
  result_review: "compare",
  result_compare: "compare",
  improvement_choice: "compare",
  safety_check: "own",
  real_task: "own",
  reflection: "own",
  completion: "own",
};

export interface Mission {
  key: LessonPhase;
  label: string;
  /** このミッションに含まれるステップの数。 */
  steps: number;
}

export interface MissionState {
  missions: Mission[];
  /** いま何番目のミッションか。1始まり。 */
  current: number;
  /** そのミッションの中で何歩目か。1始まり。 */
  stepInMission: number;
}

/** 各ステップが属する区切り。並びの順に、後戻りしない形で返す。 */
function phasesOf(lesson: Lesson): LessonPhase[] {
  let furthest = 0;

  return lesson.steps.map((step) => {
    const declared = step.phase ?? FALLBACK[step.type];
    const position = declared ? ORDER.indexOf(declared) : -1;

    // 分からない種類は、直前と同じ区切りに入れる
    if (position >= 0) furthest = Math.max(furthest, position);
    return ORDER[furthest];
  });
}

/**
 * この教材の区切りと、いまどこにいるか。
 *
 * `current` は 1 始まり（`progressOf` と揃えてある）。
 * 教材にステップが1つも無いときは、区切りも空で返す——
 * 空の帯を出すより、その場所ごと出さないほうがよい。
 */
export function missionStateOf(lesson: Lesson, stepIndex: number): MissionState {
  const phases = phasesOf(lesson);
  if (phases.length === 0) {
    return { missions: [], current: 0, stepInMission: 0 };
  }

  /*
    章扉を持つ教材は、**その名前を帯に出す**。

    共通の区切りの名前（試す・変える・深める・自分で使う）は、
    どの教材にも当たるように付けてある。当たるが、**その日に何を
    しているのかは言っていない**——Day1 の2つ目は「変える」ではなく
    「相手を決める」で、3つ目は「深める」ではなく「言い方を変える」。

    章扉でその名前を見せた直後に、帯が別の言葉を出すと、
    見たばかりの段の名前が画面から消える。同じ言葉にする。
  */
  const sectionLabels = new Map<LessonPhase, string>();
  for (const [index, step] of lesson.steps.entries()) {
    const label = (step.meta as { sectionLabel?: string } | undefined)?.sectionLabel;
    if (step.type === "section_transition" && label) {
      sectionLabels.set(phases[index], label);
    }
  }

  const missions: Mission[] = [];
  for (const phase of phases) {
    const last = missions[missions.length - 1];
    if (last && last.key === phase) last.steps += 1;
    else {
      missions.push({
        key: phase,
        label: sectionLabels.get(phase) ?? LABEL.get(phase) ?? "",
        steps: 1,
      });
    }
  }

  const safe = Math.min(Math.max(0, stepIndex), phases.length - 1);

  let current = 0;
  let seen = 0;
  for (const [position, mission] of missions.entries()) {
    if (seen + mission.steps > safe) {
      current = position + 1;
      break;
    }
    seen += mission.steps;
  }
  // 万一どれにも入らなかったら、最後の区切りに寄せる（帯を空にしない）
  if (current === 0) {
    current = missions.length;
    seen = phases.length - missions[missions.length - 1].steps;
  }
  return { missions, current, stepInMission: safe - seen + 1 };
}
