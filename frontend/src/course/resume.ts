/**
 * 途中まで進めた教材を、もう一度ひらいたとき。
 *
 * なぜ選ばせるか
 * --------------
 * これまでは**黙って続きから**だった。読み込み直しても続きが残るのは
 * よいことだが、選べないと困る場面が2つある。
 *
 *   ・もう一度、頭からやり直したい（前の答えを引きずりたくない）
 *   ・いま開くつもりは無かった（押し間違い）
 *
 * どちらも、続きの画面に着いてからでは戻すのが面倒になる。ひらいた
 * ところで一度だけ聞く。
 *
 * 判断はここ1か所
 * ---------------
 * ホーム・コース・診断の導線・直接ひらいた・読み込み直し——入口は
 * いくつもあるが、教材をひらく道は `LessonRunner` を必ず通る。だから
 * 出すかどうかの判断も、**その1か所に渡す材料**としてここで作る。
 * 画面ごとに数え方を書き足さない。
 *
 * 数を書き写さない
 * ----------------
 * 「全5問」も「Day2」も、教材データから数える。書き写すと、問いを
 * 1つ足した日に**画面だけが古い数を言う**。
 *
 * 出せないときは、出せると言わない
 * --------------------------------
 * 教材の並びが変わった控えは、`stepId` が生きていても続きの意味が
 * 変わっている。そこで「つづきから」を押せる形にすると、**押した先が
 * 前と違う場所**になる。押せなくして、理由を短く言う。
 */

import { firstStepId, stepIndex } from "./engine";
import type { Draft } from "../lib/draft";
import type { Lesson, LessonStep, StepValues } from "./types";

// ------------------------------------------------------------ 版と持ち主

/**
 * 短いハッシュ（FNV-1a）。
 *
 * 秘密を守るためのものではない。**同じかどうかだけ**を、短い文字列で
 * 言えればよい場面に使う（教材の版・控えの持ち主）。
 */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * 教材の版。**並びが変わったら変わる。**
 *
 * 見るのは回の id の並びだけ。文言を直しただけで版が変わると、
 * 誤字を1つ直した日に全員の続きが消える——直したいのは
 * 「続きの場所がずれる」ことで、言い回しはずれても意味が変わらない。
 */
export function lessonRevision(lesson: Lesson): string {
  return fingerprint(lesson.steps.map((step) => step.id).join("|"));
}

/**
 * 控えの持ち主。ログインしている人だけ付く。
 *
 * メールそのものは端末に置かない（読み戻せない短い印にする）。
 * ゲストは空——**ゲスト同士を見分ける手立ては無い**ので、同じブラウザで
 * あることが保証の範囲になる。
 */
export function ownerTag(user: { email?: string } | null): string {
  return user?.email ? fingerprint(user.email) : "";
}

// ------------------------------------------------------------ 何と言うか

export interface ResumeOffer {
  /** 1行目。何の続きか。 */
  headline: string;
  /** 2行目以降。どこまで進んでいるか。 */
  lines: string[];
  /**
   * 「つづきから」を押せるか。
   *
   * false のときは `blocked` に理由が入る。押せないまま並べると、
   * 押した先が前と違う場所になる。
   */
  canResume: boolean;
  /** 押せない理由。短く。 */
  blocked?: string;
}

/** 答えを持つ回（診断の問い、レッスンの選択）。 */
function isQuestion(step: LessonStep): boolean {
  return typeof step.key === "string" && step.key.length > 0;
}

/** 診断の問いだけを、教材データから数える。 */
function questions(lesson: Lesson): LessonStep[] {
  return lesson.steps.filter(isQuestion);
}

/** 何問ぶん答えが入っているか。 */
function answered(lesson: Lesson, values: StepValues): number {
  return questions(lesson).filter((step) => {
    const value = values[step.key as string];
    return typeof value === "string" && value.trim().length > 0;
  }).length;
}

/**
 * いま居る回が属する章の名前。
 *
 * 章扉（`section_transition`）を後ろ向きに探す。持っていない教材
 * （診断）では空が返る。
 */
function sectionTitle(lesson: Lesson, stepId: string): string {
  const at = stepIndex(lesson, stepId);
  if (at < 0) return "";
  for (let back = at; back >= 0; back -= 1) {
    const step = lesson.steps[back];
    if (step.type === "section_transition") return step.title ?? "";
  }
  return "";
}

/** 教材の呼び名。Day のある本編だけ番号を付ける。 */
function headlineOf(lesson: Lesson): string {
  return lesson.number > 0 ? `Day${lesson.number} ${lesson.title}` : lesson.title;
}

/**
 * 進み具合を、その教材の言葉で書く。
 *
 * 問いを並べた教材（診断）は問いの数で、章に分かれた教材（Day1・Day2）は
 * 章の名前で言う。**どちらも教材データから作る。**
 */
function describe(lesson: Lesson, draft: Draft): string[] {
  const all = questions(lesson);
  const done = answered(lesson, draft.values);

  /*
    問いがそろっている教材は、問いの数で言う。「あと何問か」は、
    続けるかどうかを決めるのにいちばん効く材料。
  */
  if (all.length >= 3 && lesson.number === 0) {
    if (done >= all.length) {
      return [`全${all.length}問に回答済み`, "結果の表示から再開できます"];
    }
    return [
      `全${all.length}問中、${done}問回答済み`,
      `質問${done + 1}から再開できます`,
    ];
  }

  const section = sectionTitle(lesson, draft.stepId);
  if (section) return [`「${section}」の途中です`];

  /* 章を持たない教材。いま居る回の見出しで言う */
  const step = lesson.steps[stepIndex(lesson, draft.stepId)];
  return step?.title ? [`「${step.title}」の途中です`] : ["途中から再開できます"];
}

// ------------------------------------------------------------ 出すかどうか

export interface ResumeInput {
  lesson: Lesson;
  /** 端末に残っている控え。無ければ `null`。 */
  draft: Draft | null;
  /** いまの持ち主（`ownerTag`）。 */
  owner: string;
  /** 終えた教材の id。完了済みには出さない。 */
  completed: string[];
}

/**
 * 続きの選択を出すか。出すなら、何と言うか。
 *
 * `null` は「出さない」。**出さないほうを既定にする**——ひらいて
 * すぐ学べる人の前に、押す必要のない問いを置かない。
 */
export function resumeOffer({
  lesson,
  draft,
  owner,
  completed,
}: ResumeInput): ResumeOffer | null {
  // 控えが無い＝まだ始めていない。いつもどおり最初から
  if (!draft) return null;

  /*
    別のアカウントの控え。**出さないし、復元もしない。**

    ログアウトのときに端末の控えは落としているが（`AuthContext`）、
    落とせなかった端末や、落とす前の版から上がってきた人が残る。
    ここでもう一度見る。

    ゲストの控え（`owner` が空）は、ログインした人にも見せる——
    登録の直前まで進めた続きは、その人自身のもの。
  */
  if (draft.owner && draft.owner !== owner) return null;

  // 終えている。結果と復習の導線はそのまま（`completion` が持つ）
  if (completed.includes(lesson.id)) return null;

  // 最初の回に居るだけ＝まだ何もしていない
  if (draft.stepId === firstStepId(lesson)) return null;

  const headline = headlineOf(lesson);

  /*
    教材の並びが変わった。**押せる形にしない。**

    控えの `stepId` は生きていても、続きの意味が変わっている。
    版を持っていない古い控え（版2以前）は「分からない」であって
    「違う」ではないので、ここでは止めない。
  */
  if (draft.revision && draft.revision !== lessonRevision(lesson)) {
    return {
      headline,
      lines: ["レッスンが更新されました"],
      canResume: false,
      blocked: "前回の続きは開けません。最初から始めてください。",
    };
  }

  // 控えの回が、いまの教材に無い
  if (stepIndex(lesson, draft.stepId) < 0) {
    return {
      headline,
      lines: ["レッスンが更新されました"],
      canResume: false,
      blocked: "前回の続きは開けません。最初から始めてください。",
    };
  }

  return { headline, lines: describe(lesson, draft), canResume: true };
}
