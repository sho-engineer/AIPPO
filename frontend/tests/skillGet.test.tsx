/**
 * AI技を受け取る場面。
 *
 * 並びは直してある（体験 → 変化 → 気づき → 名前）。ここで見るのは、
 * **名前を渡すところが画面にあるか**。解説カードは「〜とは」で
 * 始まるので、それだけだと読んだ人は「説明を読んだ」としか思わない。
 *
 * 見張るのは3つ。
 *
 *   1. 技の名前が、覚える回に出ること
 *   2. 名前が AI分野で普通に使う言葉であること（造語にしない）
 *   3. 説明を並べただけの回では出さないこと
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { SkillGet } from "../src/components/course/SkillGet";
import { LessonRunner } from "../src/pages/LessonRunner";
import { getLesson } from "../src/course/catalog";
import type { Lesson } from "../src/course/types";

const DAY1 = getLesson("rewrite_text")!;
const concepts = DAY1.steps.filter((step) => step.type === "concept_card");

describe("技を受け取る帯", () => {
  it("名前と、やさしい言い方を出す", () => {
    render(<SkillGet name="ターゲット指定" summary="誰向けかを伝える" />);

    expect(screen.getByTestId("skill-get-name")).toHaveTextContent("ターゲット指定");
    expect(screen.getByTestId("skill-get")).toHaveTextContent("誰向けかを伝える");
  });

  it("読み上げにも届く", () => {
    // 色と動きだけで伝えると、見えない人には何も起きていないのと同じ
    render(<SkillGet name="トーン指定" />);

    expect(screen.getByTestId("skill-get")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("skill-get")).toHaveTextContent("新しいAI技");
  });
});

describe("Day1 の3つの技", () => {
  it("解説の回すべてに、技の名前が付いている", () => {
    expect(concepts.map((step) => step.skill)).toEqual([
      "ターゲット指定",
      "トーン指定",
      "反復（Iteration）",
    ]);
  });

  it("名前は、AI分野で普通に使う言葉にする", () => {
    /*
      ここで覚えた言葉が、外の記事や同僚との会話で通じないと、
      **このアプリの中でしか使えない知識**になる。
      AIPPO だけの造語を使わない（憲章の Do Not Do）。
    */
    const known = [
      "ターゲット指定",
      "トーン指定",
      "ロール指定",
      "コンテキスト",
      "出力形式の指定",
      "例示（Few-shot）",
      "追加質問",
      "反復（Iteration）",
      "比較",
      "分解",
      "自己評価",
      "発散",
      "評価基準",
      "情報整理",
      "分類",
    ];
    for (const step of concepts) {
      expect(known, `${step.id} の「${step.skill}」`).toContain(step.skill);
    }
  });

  it("やさしい言い方は、名前とは別に持つ", () => {
    /*
      名前だけ見せても何のことか分からず、やさしい言い方だけでは
      他所で通じない。両方を持って、名前を先に出す。
    */
    const targeting = concepts.find((step) => step.skill === "ターゲット指定")!;
    expect(targeting.card?.title).toBe("誰向けかを伝える");
  });
});

describe("レッスンの中で、実際に出る", () => {
  /*
    部品が正しくても、画面が描いていなければ何も起きない。
    解説の回を開いて、帯がそこに在ることを見る。
  */
  const openAt = (stepId: string) => {
    const index = DAY1.steps.findIndex((step) => step.id === stepId);
    const lesson: Lesson = { ...DAY1, steps: DAY1.steps.slice(index) };
    render(<LessonRunner lesson={lesson} onFinish={() => {}} onExit={() => {}} />);
  };

  beforeEach(() => window.localStorage.clear());

  it("技を覚える回では、名前を渡す", () => {
    openAt("concept_1");

    expect(screen.getByTestId("skill-get-name")).toHaveTextContent("ターゲット指定");
    // やさしい言い方は、名前の下に添える
    expect(screen.getByTestId("skill-get")).toHaveTextContent("誰向けかを伝える");
  });

  it("技の名前が付いていない回では出さない", () => {
    // 説明を並べただけの回で「覚えました」と言うと、言葉が安くなる
    openAt("compare_results");

    expect(screen.queryByTestId("skill-get")).not.toBeInTheDocument();
  });
});
