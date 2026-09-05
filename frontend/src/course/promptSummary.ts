/**
 * AIへ渡す内容を、人が読める形に組み立てる。
 *
 * ここに集めるのは、**同じ組み立てを2か所で使う**ため。
 * 送る前の確認（AIにはこう伝えます）と、あとで取っておく帳面
 * （promptLibrary）が、別々に組み立てていると必ず食い違う。
 * 画面で見たものと、保存されたものが違うのがいちばんよくない。
 *
 * 専門用語は使わない。`audience` ではなく「読む相手」と書く。
 */

import type { Lesson } from "./types";

/** 依頼内容に出す見出し。 */
const LABELS: Record<string, string> = {
  audience: "読む相手",
  tone: "表現",
  // Day1 の1回目に選ぶ「何て頼むか」。無いと画面に `instruction` と英字が出る
  instruction: "頼みかた",
  length: "長さ",
  purpose: "まとめる目的",
  format: "出力の形",
  style: "説明のしかた",
  example: "具体例",
  criteria: "比べる基準",
  priority: "いちばん大事にしたいこと",
  as_table: "表にするか",
  deadline: "期限",
  available_time: "使える時間",
  avoid: "避けたいこと",
  improvement: "直したい方向",
  topic: "知りたいこと",
  goal: "達成したいこと",
  options_text: "比べたいもの",
};

/** 見出しを引く。知らない鍵はそのまま出す（隠すより見えるほうがよい）。 */
export function labelFor(key: string): string {
  return LABELS[key] ?? key;
}

/**
 * 本文が入っている鍵。**条件として並べない。**
 *
 * 2つあるのは、渡す前と渡したあとで名前が変わるため。
 *
 *     source_text    … 画面が持っている値（`values`）
 *     original_text  … AI へ渡す形に組み替えたあと（`engine.ts` の
 *                      `buildAiInput` が `aiAction.inputs` で読み替える）
 *
 * 前は後ろだけを外していた。画面の値をそのまま渡すと
 * `source_text` が残り、**202字の専門文が条件の札として並んだ**
 * （結果の画面で 221px を占めて、答える札が画面の外へ出た）。
 */
const SOURCE_KEYS = new Set(["original_text", "source_text"]);

/**
 * 条件の一覧。本文は入れない。
 *
 * 本文は「対象」であって条件ではない。混ぜると、条件を見比べたいときに
 * 長い文章が1枚挟まって読めなくなる。
 */
export function promptCards(input: Record<string, string>): {
  label: string;
  value: string;
}[] {
  return Object.entries(input)
    .filter(([key, value]) => value && !SOURCE_KEYS.has(key))
    .map(([key, value]) => ({ label: labelFor(key), value }));
}

/**
 * そのまま貼って使える形の指示。
 *
 * `withSource` で本文を付けるかを選ぶ。
 *
 *   送る前の確認 … 付ける。何を対象に何を頼むのか、全部見せる
 *   帳面へしまう … **付けない**。指示は次も使えるが、そのときの文章は
 *                   一度きり。混ぜると使い回せる形にならない
 */
export function promptText(
  title: string,
  input: Record<string, string>,
  { withSource }: { withSource: boolean },
): string {
  const lines = [`やること: ${title}`, ""];
  for (const card of promptCards(input)) {
    lines.push(`- ${card.label}: ${card.value}`);
  }
  if (withSource && input.original_text) {
    lines.push("", "--- 対象 ---", input.original_text);
  }
  return lines.join("\n");
}

/** 帳面へしまう1件ぶん。 */
export function promptEntryFor(
  lesson: Lesson,
  input: Record<string, string>,
): { lessonId: string; lessonTitle: string; cards: { label: string; value: string }[]; text: string } {
  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    cards: promptCards(input),
    text: promptText(lesson.title, input, { withSource: false }),
  };
}
