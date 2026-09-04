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
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { SkillGet } from "../src/components/course/SkillGet";
import { SkillStampCard } from "../src/components/course/SkillStampCard";
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
    expect(screen.getByTestId("skill-get")).toHaveTextContent("AI技 GET");
  });
});

describe("Day1 の3つの技", () => {
  it("解説の回すべてに、技の名前が付いている", () => {
    /*
      Day1 で渡すのはこの3つ。順に足していけば1本の筋になる
      （何をしてほしい → 誰向け → どんな言い方）。

      「反復（Iteration）」はここから外した。あれは「返ってきたものを
      見て、また足す」という**進め方**の話で筋が違ううえ、3つを
      覚える前に4つ目が並ぶと持ち帰るものが増えすぎる。
      技そのものは Day3・Day7・Day8 で出る。
    */
    expect(concepts.map((step) => step.skill)).toEqual([
      "プロンプト",
      "ターゲット指定",
      "トーン指定",
    ]);
  });

  it("名前は、AI分野で普通に使う言葉にする", () => {
    /*
      ここで覚えた言葉が、外の記事や同僚との会話で通じないと、
      **このアプリの中でしか使えない知識**になる。
      AIPPO だけの造語を使わない（憲章の Do Not Do）。
    */
    const known = [
      "プロンプト",
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
    render(<LessonRunner lesson={lesson} onExit={() => {}} onOpenCourse={() => {}} />);
  };

  beforeEach(() => window.localStorage.clear());

  it("技を覚える回では、名前を渡す", () => {
    // Day1 の解説は3枚。ターゲット指定は2枚目（1枚目はプロンプト）
    openAt("concept_2");

    expect(screen.getByTestId("skill-get-name")).toHaveTextContent("ターゲット指定");
    // やさしい言い方は、名前の下に添える
    expect(screen.getByTestId("skill-get")).toHaveTextContent("誰向けかを伝える");
  });

  it("技の名前が付いていない回では出さない", () => {
    // 説明を並べただけの回で「覚えました」と言うと、言葉が安くなる
    openAt("compare_results");

    expect(screen.queryByTestId("skill-get")).not.toBeInTheDocument();
  });

  it("ポーは中央に立って、まわりに紙が散る", () => {
    /*
      前は右端に寄っていた。技の名前も説明も中央にあるのに、祝って
      いる当人だけが端に立っている形で、**左に大きな空白**ができて
      画面の重心が右へずれていた。

      置き場所を決めるのは `course/poPresence.ts`。画面ごとに条件を
      書き始めると、また画面の都合でポーが動く。
    */
    openAt("concept_2");

    expect(screen.getByTestId("po-hero")).toHaveAttribute("data-po-align", "center");
    expect(screen.getByTestId("po-burst")).toBeInTheDocument();
  });

  it("ふだんの画面では、ポーは端のまま", () => {
    // 中央に立つのは祝う画面だけ。ふだんは日本語の読む向きに合わせる
    openAt("add_condition");

    expect(screen.getByTestId("po-hero")).toHaveAttribute("data-po-align", "start");
    expect(screen.queryByTestId("po-burst")).not.toBeInTheDocument();
  });
});

describe("スタンプ台紙", () => {
  const openAt = (stepId: string) => {
    const index = DAY1.steps.findIndex((step) => step.id === stepId);
    const lesson: Lesson = { ...DAY1, steps: DAY1.steps.slice(index) };
    render(<LessonRunner lesson={lesson} onExit={() => {}} onOpenCourse={() => {}} />);
  };

  beforeEach(() => window.localStorage.clear());

  it("「覚えた」を押すと、その日の何個目かが出る", async () => {
    /*
      技を受け取る画面は**1つぶんの出来事**しか言わない。「覚えた」で
      すぐ次へ行くと、その日の何個目なのか、あと何個で揃うのかが
      どこにも出ない。閉じれば進むが、そのあいだだけ台紙を見せる。
    */
    const user = userEvent.setup();
    openAt("concept_1");

    await user.click(screen.getByTestId("primary-action"));

    const card = await screen.findByTestId("skill-stamp-card");
    // プロンプトは Day1 の1つ目。技は3つ
    expect(screen.getByTestId("skill-stamp-count")).toHaveTextContent("1 / 3 GET");
    expect(screen.getByTestId("skill-stamp-note")).toHaveTextContent(
      "あと2つで Day 1 コンプリート",
    );

    /*
      枠は3つとも出す。**まだ取っていないものも名前ごと出す**
      ——この日に何を覚えるのかが見えているほうが、集まっていく形が
      分かる。押されたのはいま取った1つだけ。
    */
    const slots = screen.getAllByTestId("skill-stamp-slot");
    expect(slots).toHaveLength(3);
    expect(slots.map((slot) => slot.getAttribute("data-state"))).toEqual([
      "new",
      "empty",
      "empty",
    ]);
    expect(card).toHaveTextContent("ターゲット指定");
    expect(card).toHaveTextContent("トーン指定");
  });

  it("閉じると、次の画面へ進む", async () => {
    // 台紙は寄り道。**行き止まりにしない**
    const user = userEvent.setup();
    openAt("concept_1");

    await user.click(screen.getByTestId("primary-action"));
    await user.click(await screen.findByTestId("skill-stamp-continue"));

    expect(screen.queryByTestId("skill-stamp-card")).not.toBeInTheDocument();
    // プロンプトの次は章扉②「相手を決めよう」
    expect(await screen.findByTestId("section-transition")).toBeInTheDocument();
  });

  /*
    最後の1つは、部品のほうで見る。

    ここの `openAt` は教材を途中で切って渡すので、切った先には技が
    1つしか残らない（`skillOrder` は渡された教材から数える）。
    3つ目まで通すには、レッスンを頭から歩かせることになる——
    出したいのは「揃ったときの言い方」だけなので、部品へ直接渡す。
  */
  it("最後の1つを取ったら、揃ったことを言う", () => {
    // 「あと0つ」とは言わない。揃った日はねぎらいに変える
    render(
      <SkillStampCard
        skills={["プロンプト", "ターゲット指定", "トーン指定"]}
        earnedIndex={2}
        lessonNumber={1}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId("skill-stamp-count")).toHaveTextContent("3 / 3 GET");
    expect(screen.getByTestId("skill-stamp-note")).toHaveTextContent(
      "Day 1 のAI技が全部そろいました",
    );
    expect(screen.getByTestId("skill-stamp-note")).not.toHaveTextContent("あと");
    // 3つとも押されている
    expect(
      screen.getAllByTestId("skill-stamp-slot").map((s) => s.getAttribute("data-state")),
    ).toEqual(["done", "done", "new"]);
  });

  it("解説を飛ばした人には出さない", async () => {
    /*
      台紙は「覚えた」を押した人への返事。飛ばした人に出すと、
      読まずに進んだのに祝われることになる。
    */
    const user = userEvent.setup();
    openAt("concept_1");

    await user.click(screen.getByRole("button", { name: "解説を飛ばす" }));

    expect(screen.queryByTestId("skill-stamp-card")).not.toBeInTheDocument();
  });
});
