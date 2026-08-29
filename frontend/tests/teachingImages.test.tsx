/**
 * 教材の絵（Day1）。
 *
 * 絵そのものが教材なので、見張るのは**出し方**と**出す順**。
 *
 *   1. 切り取らないこと（1枚で説明が完結している）
 *   2. 390px の画面からはみ出さないこと
 *   3. 比べる図を、試す前に出さないこと
 *   4. 解説の絵を続けて2枚出さないこと
 *   5. 絵があるとき、同じことを本文の図でもう一度出さないこと
 */

import { existsSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConceptCardView } from "../src/components/course/steps/ConceptCard";
import { TeachingImage } from "../src/components/lessons/TeachingImage";
import { getLesson } from "../src/course/catalog";
import { ALL_TEACHING_IMAGES, teachingImage } from "../src/course/teachingImages";

const DAY1 = "rewrite_text";
const DAY2 = "summarize_text";
const DAY3 = "explain_topic";

describe("出し方", () => {
  it("幅は親いっぱい、比は 3:2 のまま、切り取らない", () => {
    render(<TeachingImage src="/assets/teaching/day1_overview.webp" alt="ずかい" />);

    const image = screen.getByAltText("ずかい");
    expect(image).toHaveClass("w-full", "max-w-full", "h-auto", "object-contain", "block");
    // 3:2 を保つ。読み込み前の場所取りにも効く
    expect(image.className).toContain("aspect-[3/2]");
  });

  it("読み込む前から高さが決まっている", () => {
    // 決まっていないと、読み終わりに下の文とボタンが飛ぶ（CLS）
    render(<TeachingImage src="/x.webp" alt="ずかい" />);

    const image = screen.getByAltText("ずかい");
    expect(image).toHaveAttribute("width", "1536");
    expect(image).toHaveAttribute("height", "1024");
  });

  it("横へはみ出さないよう、外側で隠す", () => {
    render(<TeachingImage src="/x.webp" alt="ずかい" />);

    expect(screen.getByTestId("teaching-image")).toHaveClass(
      "overflow-hidden",
      "w-full",
      "max-w-full",
    );
  });

  it("何の図かを、読み上げにも渡す", () => {
    /*
      ここは飾りではなく中身。見えない人に「何の図か」が
      伝わらないと、そのぶんだけ教材が欠ける。
    */
    for (const [, entry] of Object.entries({ a: teachingImage(DAY1, "concept_1") })) {
      expect(entry?.alt.length ?? 0).toBeGreaterThan(10);
    }
  });
});

describe("Day1 のどこに出るか", () => {
  const lesson = getLesson(DAY1)!;
  const order = lesson.steps.map((step) => step.id);
  const at = (stepId: string) => order.indexOf(stepId);

  it("5枚が、それぞれの画面に割り当たっている", () => {
    const placed = order.filter((id) => teachingImage(DAY1, id) !== null);

    expect(placed).toEqual([
      "outcome_preview",
      "concept_1",
      "compare_results",
      "concept_tone",
      "concept_iteration",
    ]);
  });

  it("比べる図は、一度試して条件を足したあとに出る", () => {
    /*
      先に出すと、答えを見てから確かめる作業になる。
      **必ず** 試す → 条件を足す → 送る、のあとに来ること。
    */
    expect(at("compare_results")).toBeGreaterThan(at("quick_try"));
    expect(at("compare_results")).toBeGreaterThan(at("add_condition"));
    expect(at("compare_results")).toBeGreaterThan(at("generate_improved"));
  });

  it("解説の絵と比べる図を、続けて出さない", () => {
    // あいだに手を動かす画面が入っていること
    const between = order.slice(at("concept_1") + 1, at("compare_results"));
    expect(between).toContain("add_condition");
  });

  it("解説の絵を続けて2枚出さない", () => {
    const withImage = order
      .map((id, index) => ({ id, index }))
      .filter((entry) => teachingImage(DAY1, entry.id) !== null);

    for (let i = 0; i < withImage.length - 1; i += 1) {
      expect(
        withImage[i + 1].index - withImage[i].index,
        `${withImage[i].id} と ${withImage[i + 1].id} が隣り合っている`,
      ).toBeGreaterThan(1);
    }
  });

  it("トーン指定は、トーンを選ぶ直前に出る", () => {
    // 技は、使う直前に出す
    expect(at("real_tone") - at("concept_tone")).toBe(1);
  });

  it("反復は、自分の文章を送る直前に出る", () => {
    expect(at("prompt_preview") - at("concept_iteration")).toBe(1);
  });

  it("画像だけの画面を増やしていない", () => {
    // 絵は既にある画面に添える。5枚のために5画面を足さない
    for (const id of ["outcome_preview", "compare_results"]) {
      expect(order).toContain(id);
    }
    expect(order).toHaveLength(19);
  });
});

describe("Day2 のどこに出るか", () => {
  const lesson = getLesson(DAY2)!;
  const order = lesson.steps.map((step) => step.id);
  const at = (stepId: string) => order.indexOf(stepId);

  it("5枚が、それぞれの画面に割り当たっている", () => {
    const placed = order.filter((id) => teachingImage(DAY2, id) !== null);

    expect(placed).toEqual([
      "outcome_preview",
      "concept_1",
      "compare_results",
      "concept_output_format",
      "concept_context",
    ]);
  });

  it("比べる図は、一度試して条件を足したあとに出る", () => {
    expect(at("compare_results")).toBeGreaterThan(at("quick_try"));
    expect(at("compare_results")).toBeGreaterThan(at("add_condition"));
    expect(at("compare_results")).toBeGreaterThan(at("generate_improved"));
  });

  it("解説の絵と比べる図を、続けて出さない", () => {
    const between = order.slice(at("concept_1") + 1, at("compare_results"));
    expect(between).toContain("add_condition");
  });

  it("解説の絵を続けて2枚出さない", () => {
    const withImage = order
      .map((id, index) => ({ id, index }))
      .filter((entry) => teachingImage(DAY2, entry.id) !== null);

    for (let i = 0; i < withImage.length - 1; i += 1) {
      expect(
        withImage[i + 1].index - withImage[i].index,
        `${withImage[i].id} と ${withImage[i + 1].id} が隣り合っている`,
      ).toBeGreaterThan(1);
    }
  });

  it("出力形式の指定は、形を選ぶ直前に出る", () => {
    expect(at("real_format") - at("concept_output_format")).toBe(1);
  });

  it("コンテキストは、目的を足す直前に出る", () => {
    expect(at("real_purpose") - at("concept_context")).toBe(1);
  });

  it("出力形式の指定を、コンテキストより先に出す", () => {
    // 直前の比較で見たのが「3つの箇条書きで」の効果なので、そこから続ける
    expect(at("concept_output_format")).toBeLessThan(at("concept_context"));
  });

  it("画像だけの画面を増やしていない", () => {
    for (const id of ["outcome_preview", "compare_results"]) {
      expect(order).toContain(id);
    }
    expect(order).toHaveLength(19);
  });
});

describe("表に載せた絵が、実際にあること", () => {
  it("指している道筋のファイルが public/ に置いてある", () => {
    /*
      **表に1行足しただけで、絵を置き忘れる**のがいちばん起きやすい。
      画面には壊れた絵の枠が出るが、検査はどれも通ってしまう。

      逆（置いたのに表へ足さない）は、絵が出ないだけで壊れて見えない
      ので、ここでは見ない。
    */
    const missing = ALL_TEACHING_IMAGES.filter(
      (entry) => !existsSync(`public${entry.src}`),
    ).map((entry) => `${entry.lessonId}/${entry.stepId} → ${entry.src}`);

    expect(missing, `置き忘れている絵:\n${missing.join("\n")}`).toEqual([]);
  });

  it("何の図かを、読み上げにも渡している", () => {
    // ここは飾りではなく中身。見えない人に伝わらないと、教材が欠ける
    for (const entry of ALL_TEACHING_IMAGES) {
      expect(
        entry.alt.length,
        `${entry.lessonId}/${entry.stepId} の説明が短い`,
      ).toBeGreaterThan(20);
    }
  });
});

describe("Day3 のどこに出るか", () => {
  const lesson = getLesson(DAY3)!;
  const order = lesson.steps.map((step) => step.id);
  const at = (stepId: string) => order.indexOf(stepId);

  it.todo("5枚が、それぞれの画面に割り当たっている（絵の到着待ち）");

  it("いま置いてある絵は、決めた画面にだけ付く", () => {
    const placed = order.filter((id) => teachingImage(DAY3, id) !== null);
    const allowed = [
      "outcome_preview",
      "concept_1",
      "compare_results",
      "concept_role",
      "concept_followup",
    ];

    expect(placed.every((id) => allowed.includes(id))).toBe(true);
    // 並びは決めた順のまま（足しても順が入れ替わらない）
    expect(placed).toEqual(allowed.filter((id) => placed.includes(id)));
  });

  it("ターゲット指定は、Day1 と同じ1枚を使う", () => {
    /*
      同じ技に別の絵を用意すると、**同じものだと気づけない**
      ——2つ目の技として数えられてしまう。
    */
    expect(teachingImage(DAY3, "concept_1")?.src).toBe(
      teachingImage(DAY1, "concept_1")?.src,
    );
  });

  it("比べる図は、一度試して条件を足したあとに出る", () => {
    expect(at("compare_results")).toBeGreaterThan(at("quick_try"));
    expect(at("compare_results")).toBeGreaterThan(at("add_condition"));
    expect(at("compare_results")).toBeGreaterThan(at("generate_improved"));
  });

  it("解説と比べる画面のあいだに、手を動かす画面が入る", () => {
    const between = order.slice(at("concept_1") + 1, at("compare_results"));
    expect(between).toContain("add_condition");
  });

  it("解説を続けて2枚出さない", () => {
    const cards = order
      .map((id, index) => ({ id, index }))
      .filter((entry) => lesson.steps[entry.index].type === "concept_card");

    for (let i = 0; i < cards.length - 1; i += 1) {
      expect(
        cards[i + 1].index - cards[i].index,
        `${cards[i].id} と ${cards[i + 1].id} が隣り合っている`,
      ).toBeGreaterThan(1);
    }
  });

  it("ロール指定は、立場を選ぶ直前に出る", () => {
    expect(at("real_style") - at("concept_role")).toBe(1);
  });

  it("追加質問は、聞き返しを足す直前に出る", () => {
    expect(at("real_followup") - at("concept_followup")).toBe(1);
  });

  it("技を出したら、必ずそれを使う画面が来る", () => {
    /*
      「これがロール指定」と言っておきながら使う場面が無い、という
      看板倒れにしない。立場も聞き返しも、実際にAIへ届く。
    */
    const style = lesson.steps.find((step) => step.id === "real_style")!;
    const followup = lesson.steps.find((step) => step.id === "real_followup")!;
    expect(style.options?.map((one) => one.label)).toContain("先生として");
    expect(followup.key).toBe("followup");

    const sends = lesson.steps.find((step) => step.id === "generate_real")!;
    expect(Object.keys(sends.aiAction?.inputs ?? {})).toContain("followup");
  });

  it("聞き返しは、答えなくても進める", () => {
    // 聞きたいことが無い人を、ここで止めない
    const followup = lesson.steps.find((step) => step.id === "real_followup")!;
    expect(followup.required ?? false).toBe(false);
    expect(followup.options?.some((one) => one.value === "")).toBe(true);
  });

  it("画像だけの画面を増やしていない", () => {
    for (const id of ["outcome_preview", "compare_results"]) {
      expect(order).toContain(id);
    }
    expect(order).toHaveLength(20);
  });
});

describe("本文と重ねない", () => {
  const card = getLesson(DAY1)!.steps.find((step) => step.id === "concept_tone")!.card!;
  const day2Card = getLesson(DAY2)!.steps.find(
    (step) => step.id === "concept_context",
  )!.card!;

  it("Day2 も同じで、絵があるときは図を出さない", () => {
    render(
      <ConceptCardView
        card={day2Card}
        image={teachingImage(DAY2, "concept_context")}
        headingShown
      />,
    );

    expect(screen.getByTestId("teaching-image")).toBeInTheDocument();
    // 絵の中に「目的・相手・場面」が入っている
    expect(screen.queryByText("場面")).not.toBeInTheDocument();
  });

  it("絵があるときは、同じことを図でもう一度出さない", () => {
    render(
      <ConceptCardView
        card={card}
        image={teachingImage(DAY1, "concept_tone")}
        headingShown
      />,
    );

    // 絵の中に「丁寧・やわらかい・カジュアル」が入っている
    expect(screen.getByTestId("teaching-image")).toBeInTheDocument();
    expect(screen.queryByText("やわらかい")).not.toBeInTheDocument();
  });

  it("絵が無い回は、これまでどおり図を出す", () => {
    render(<ConceptCardView card={card} headingShown />);

    expect(screen.queryByTestId("teaching-image")).not.toBeInTheDocument();
    expect(screen.getByText("やわらかい")).toBeInTheDocument();
  });

  it("本文の1行だけは、絵があっても残す", () => {
    // 読み上げと、絵が読み込めなかったときのために
    render(
      <ConceptCardView
        card={card}
        image={teachingImage(DAY1, "concept_tone")}
        headingShown
      />,
    );

    expect(screen.getByText(card.body)).toBeInTheDocument();
  });
});
