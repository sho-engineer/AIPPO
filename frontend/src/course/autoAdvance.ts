/**
 * 選ぶだけの回を、選んだら自動で次へ送る。
 *
 * 「相手は誰ですか」に答えたあと、もう一度「次へ」を押させる意味は無い。
 * 押す先が1つしかないうえ、答えはもう画面に出ている。19歩あるレッスンで
 * この空押しが8回あると、学ぶ時間より押す時間のほうが増える。
 *
 * ただし、勝手に進めてよい回とそうでない回がある
 * ----------------------------------------------
 * 進めてよいのは、**取り消しがきく操作**だけ。選び直せばよいものは、
 * 先へ行っても戻ってやり直せる。
 *
 * 進めてはいけないのは次の3つ。
 *
 *   1. 自分で文章を書く回 … 書いている途中で画面が変わるのは事故
 *   2. AIの結果を見る回   … 読む時間は人によって違う。読み終わる前に
 *                            送られたら、何が起きたのか分からない
 *   3. **次がAIを呼ぶ回**  … 札を1つ触っただけでお金のかかる要求が飛ぶ。
 *                            送る意思表示は、必ず本人の「送る」に紐づける
 *
 * 3つ目がとくに大事で、「選んだら即送信」にすると、迷って別の札を
 * 押し直すたびに課金が起きる。選ぶことと送ることは分けたままにする。
 */

import { findStep, nextStepId } from "./engine";
import { assembleParts, type Lesson, type LessonStep, type StepValues } from "./types";

/** 選ぶだけで答えが決まる回。 */
const CHOICE_ONLY = new Set(["single_choice", "observation"]);

/** ここへ入る手前では、自動で進めない。 */
const COSTS_MONEY = "ai_generate";

/**
 * この回を、選んだら自動で送ってよいか。
 *
 * 判断に使うのは教材データだけ。画面の種類ごとに条件を書き足していくと、
 * 教材を1本足すたびにここを直すことになる。
 */
export function canAutoAdvance(lesson: Lesson, step: LessonStep): boolean {
  /*
    AI活用診断では**一度も自動で送らない。**

    ほかの回と性格が違う。レッスンの選択肢は「次に何をするか」を
    その場で決めるもので、選び直せば戻ってやり直せる。診断は
    **自分の答えを積み上げていく**場で、5問ぶんの答えがそのまま
    結果になる。選んだ札を見て「これでよい」と確かめる時間が要る。

    自動で送っていたころは、押した瞬間に次の問いへ移り、何を選んだのか
    確かめられなかった。戻ろうとしても、前の答えが残っているせいで
    また送られて**前へ戻れなかった**（下の `changedHere` も参照）。
  */

  if (lesson.id === "diagnosis") return false;

  if (!CHOICE_ONLY.has(step.type)) return false;

  // 「その他（自分で書く）」を持つ回は、書いている途中で送らない
  if (step.options?.some((option) => option.free)) return false;

  const nextId = nextStepId(lesson, step.id);

  /*
    行き先が無い（＝最後の回）なら送らない。

    `nextStepId` は先が無いとき**同じ id を返す**ので、素直に受け取ると
    「自分へ進む」ことになる。画面は動かないのに「つぎへ進みます」と
    出続ける、という妙な状態になっていた。
  */
  if (nextId === step.id) return false;

  const next = findStep(lesson, nextId);
  if (!next) return false;

  return next.type !== COSTS_MONEY;
}

/**
 * いま送ってよい状態か。
 *
 * 答えが入っていること。空のまま送ると、次の回で「戻って選び直す」
 * ことになり、速くするどころか遅くなる。
 */
export function isAnswered(step: LessonStep, values: StepValues): boolean {
  if (!step.key) return false;
  const value = (values[step.key] ?? "").trim();

  /*
    枠を埋める回（`assemble`）は、**全部埋まって初めて答えたこと**にする。

    1つでも空のまま送れると、採点する側は「選ばなかった」のか
    「まだ途中」なのかを区別できない。診断のミニ問題は、埋まって
    いない枠があると軸の点が出せない。
  */
  if (step.parts?.length) {
    const picked = assembleParts(value);
    return (
      picked.length === step.parts.length && picked.every((one) => one.trim().length > 0)
    );
  }

  return value.length > 0;
}

/**
 * 選んでから送るまでの間。
 *
 * 短すぎると、押した札が青くなるのを見る前に画面が変わる。
 * 長すぎると、止まっているのか進むのか分からず「次へ」を探し始める。
 *
 * 500ms にしてある。選んだ札に印が付き、それを目で確かめてから動く長さ。
 */
export const AUTO_ADVANCE_MS = 500;
