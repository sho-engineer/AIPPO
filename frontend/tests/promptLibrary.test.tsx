/**
 * 自分のプロンプト帳。
 *
 * このアプリの報酬は点数ではなく「自分の仕事に使えるものを持ち帰れること」。
 * それをコピーボタン1回に賭けない、というのがこの機能。
 *
 * 守るのは3つ。
 *
 *   1. 押し忘れても残る（送る意思表示のところで自動でしまう）
 *   2. **本文は入れない**（指示は次も使えるが、そのときの文章は一度きり）
 *   3. 消せる。自動で溜まるので、消せないと「消せない履歴」になる
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { PromptLibrary } from "../src/components/course/PromptLibrary";
import {
  loadPrompts,
  removePrompt,
  savePrompt,
} from "../src/course/promptLibrary";
import { promptEntryFor, promptText } from "../src/course/promptSummary";
import { COURSE } from "../src/course/catalog";

const lesson = COURSE.lessons.find((entry) => entry.id === "rewrite_text")!;

const input = {
  original_text: "お疲れ様です。先日ご依頼いただいた資料の件でご連絡しました。",
  audience: "上司",
  tone: "分かりやすく",
  length: "短め",
};

beforeEach(() => window.localStorage.clear());

describe("組み立て", () => {
  it("見出しは専門用語にしない", () => {
    const entry = promptEntryFor(lesson, input);

    expect(entry.cards.map((card) => card.label)).toContain("読む相手");
    expect(entry.cards.map((card) => card.label)).not.toContain("audience");
  });

  it("しまう側には、本文を入れない", () => {
    /*
      ここが要。指示は次も使えるが、そのときの文章は一度きり。
      混ぜると使い回せる形にならないし、仕事の文章の置き場が1つ増える。
    */
    const entry = promptEntryFor(lesson, input);

    expect(entry.text).toContain("上司");
    expect(entry.text).not.toContain(input.original_text);
    expect(entry.cards.every((card) => card.value !== input.original_text)).toBe(true);
  });

  it("送る前の確認には、本文まで出す", () => {
    // あちらは「何を対象に何を頼むのか」を全部見せる場所
    const shown = promptText(lesson.title, input, { withSource: true });

    expect(shown).toContain(input.original_text);
  });
});

describe("しまう", () => {
  it("1件しまうと読み出せる", () => {
    savePrompt(promptEntryFor(lesson, input));

    const saved = loadPrompts();
    expect(saved).toHaveLength(1);
    expect(saved[0].lessonTitle).toBe(lesson.title);
  });

  it("新しいものが先に来る", () => {
    savePrompt(promptEntryFor(lesson, { ...input, audience: "同僚" }));
    savePrompt(promptEntryFor(lesson, { ...input, audience: "お客様" }));

    expect(loadPrompts()[0].text).toContain("お客様");
  });

  it("同じ指示は増やさない", () => {
    // 一字一句同じものが並ぶと、どれが最新か分からなくなる
    savePrompt(promptEntryFor(lesson, input));
    savePrompt(promptEntryFor(lesson, input));

    expect(loadPrompts()).toHaveLength(1);
  });

  it("溜め続けない", () => {
    for (let i = 0; i < 40; i += 1) {
      savePrompt(promptEntryFor(lesson, { ...input, tone: `言い方${i}` }));
    }

    expect(loadPrompts().length).toBeLessThanOrEqual(30);
  });

  it("消せる", () => {
    const saved = savePrompt(promptEntryFor(lesson, input));
    removePrompt(saved.id);

    expect(loadPrompts()).toHaveLength(0);
  });

  it("壊れた控えでも落ちない", () => {
    window.localStorage.setItem("aippo:prompts", "{壊れている");

    expect(loadPrompts()).toEqual([]);
  });

  it("学習データの削除で消える鍵にする", () => {
    // 設定の「学習データを削除する」は aippo: で始まる鍵をまとめて消す
    savePrompt(promptEntryFor(lesson, input));

    expect(Object.keys(window.localStorage)).toContain("aippo:prompts");
  });
});

describe("画面", () => {
  it("1件も無ければ、節ごと出さない", () => {
    render(<PromptLibrary />);

    expect(screen.queryByTestId("prompt-library")).not.toBeInTheDocument();
  });

  it("しまったものが並ぶ", () => {
    savePrompt(promptEntryFor(lesson, input));

    render(<PromptLibrary />);

    const list = screen.getByTestId("prompt-library");
    expect(list).toHaveTextContent(lesson.title);
    expect(list).toHaveTextContent("読む相手：上司");
  });

  it("本文は出さない", () => {
    savePrompt(promptEntryFor(lesson, input));

    render(<PromptLibrary />);

    expect(screen.getByTestId("prompt-library")).not.toHaveTextContent(
      input.original_text,
    );
  });

  it("1件ずつ消せる", async () => {
    const user = userEvent.setup();
    const saved = savePrompt(promptEntryFor(lesson, input));

    render(<PromptLibrary />);
    await user.click(screen.getByTestId(`prompt-remove-${saved.id}`));

    expect(loadPrompts()).toHaveLength(0);
    expect(screen.queryByTestId("prompt-library")).not.toBeInTheDocument();
  });
});
