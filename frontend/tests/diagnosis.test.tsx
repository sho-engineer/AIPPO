/**
 * AI活用診断。
 *
 * 何が足りなかったか
 * ------------------
 * 前は3問とも自己申告だった（仕事の種類・使ったことがあるか・面倒な
 * こと）。**自分でどう思っているか**しか集まらないので、できると
 * 答えた人が本当にできるのかも、できないと答えた人が何でつまずくのかも
 * 分からない。おすすめも「面倒なこと」の言葉合わせで決まっていた。
 *
 * いまは5問で、**うしろの2問は手を動かす**。
 *
 * 見張るのは4つ。
 *
 *   1. 5問あり、その内訳が 自己申告2 / ミニ問題2 / 希望1 であること
 *   2. ミニ問題は、全部の枠が埋まるまで進めないこと
 *   3. 押しても正解・不正解を出さないこと
 *   4. 職種・業界・使っているAIサービスを聞かないこと
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssembleStep } from "../src/components/course/steps/Assemble";
import { getLesson } from "../src/course/catalog";
import { isAnswered } from "../src/course/autoAdvance";
import { poAppearance } from "../src/course/poPresence";

const DIAGNOSIS = getLesson("diagnosis")!;
const questions = DIAGNOSIS.steps.filter((step) => Boolean(step.key));

describe("5問の作り", () => {
  it("自己申告2つ、ミニ問題2つ、やりたいこと1つ", () => {
    /*
      自己申告だけでは、**実際にできるか**が測れない。かといって
      増やすと1〜2分で終わらなくなるので、5問のまま内訳を変える。
    */
    expect(questions.map((step) => [step.id, step.type])).toEqual([
      ["ai_usage", "single_choice"],
      ["ask_style", "single_choice"],
      ["build_prompt", "assemble"],
      ["match_purpose", "assemble"],
      ["want_to_do", "multi_choice"],
    ]);
  });

  it("職種・業界・使っているAIサービスは聞かない", () => {
    /*
      答えても次の一歩が変わらないのに、答える手間だけが増える。
      初回で聞くものは、**次に何をするかが変わるものだけ**にする。
    */
    const asked = questions.map((step) => step.title).join(" ");
    for (const banned of ["お仕事", "職種", "業界", "会社", "サービス"]) {
      expect(asked, `「${banned}」を聞いている`).not.toContain(banned);
    }
  });

  it("Q1は回数ではなく、どれくらい入り込んでいるかを聞く", () => {
    // 「週に何回」だと、同じ回数でも次の一歩が変わらない
    const q1 = questions[0];
    expect(q1.options?.map((option) => option.label)).toEqual([
      "まだ使ったことがない",
      "試したことはある",
      "困ったときに使う",
      "仕事でよく使う",
      "ほぼ毎日、いろいろな用途で使う",
    ]);
  });

  it("Q2は主観ではなく、頼み方そのものを聞く", () => {
    /*
      「自信がありますか」だと、同じ力の人でも性格で答えが割れる。
      どうやって頼んでいるかという**行動**を聞く。
    */
    const q2 = questions[1];
    expect(q2.title).not.toMatch(/自信|得意|できます/);
    expect(q2.options?.[0].label).toBe("何を書けばいいか迷う");
    expect(q2.options?.[4].label).toBe("仕事の流れに合わせて、頼み方を組み立てる");
  });

  it("ミニ問題の枠は3つまで", () => {
    /*
      4つ並べると、スマホでは送らないと最後の枠が見えない。
      1画面1アクションを守るための上限。
    */
    for (const step of questions.filter((one) => one.type === "assemble")) {
      expect(step.parts?.length, `${step.id} の枠`).toBeLessThanOrEqual(3);
      expect(step.parts?.length, `${step.id} の枠`).toBeGreaterThan(1);
    }
  });

  it("Q3は Day1 の3つ（何をしてほしい / 誰向け / どんな言い方）を見る", () => {
    const q3 = questions[2];
    expect(q3.parts?.map((part) => part.label)).toEqual([
      "何をしてほしい？",
      "誰向け？",
      "どんな言い方？",
    ]);
  });

  it("Q5は複数選べる", () => {
    expect(questions[4].type).toBe("multi_choice");
    expect(questions[4].options?.map((option) => option.label)).toEqual([
      "文章",
      "要約",
      "調べもの",
      "アイデア",
      "比較",
      "整理",
      "画像",
    ]);
  });
});

describe("ミニ問題の答え方", () => {
  const q3 = questions[2];

  it("全部の枠が埋まるまで、進めない", () => {
    /*
      1つでも空のまま送れると、採点する側は「選ばなかった」のか
      「まだ途中」なのかを区別できない。
    */
    expect(isAnswered(q3, { build_prompt: "" })).toBe(false);
    expect(isAnswered(q3, { build_prompt: "explain||" })).toBe(false);
    expect(isAnswered(q3, { build_prompt: "explain|first_time|" })).toBe(false);
    expect(isAnswered(q3, { build_prompt: "explain|first_time|kind" })).toBe(true);
  });

  it("枠ごとに選べて、押し直せる", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <AssembleStep step={q3} value="" onChange={onChange} />,
    );

    await user.click(screen.getByRole("button", { name: "要約して" }));
    expect(onChange).toHaveBeenCalledWith("summarize||");

    // 2つ目の枠を選んでも、1つ目は消えない
    rerender(<AssembleStep step={q3} value="summarize||" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "新入社員向け" }));
    expect(onChange).toHaveBeenLastCalledWith("summarize|newcomer|");

    // 同じ札をもう一度押すと取り消せる（押し間違いをその場で直せる）
    rerender(
      <AssembleStep step={q3} value="summarize|newcomer|" onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: "新入社員向け" }));
    expect(onChange).toHaveBeenLastCalledWith("summarize||");
  });

  it("押しても、正解・不正解を出さない", async () => {
    /*
      その場で採点すると、診断はテストになる。「間違えた」で終わる人が
      出るし、次の問題の答え方も変わってしまう。
    */
    const user = userEvent.setup();
    render(<AssembleStep step={q3} value="" onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "専門家向け" }));

    const shown = screen.getByTestId("assemble").textContent ?? "";
    for (const banned of ["正解", "不正解", "せいかい", "おしい", "残念", "×", "✗"]) {
      expect(shown, `「${banned}」が出ている`).not.toContain(banned);
    }
  });

  it("選んだ札は、色だけで示さない", () => {
    // 色が見分けられない人にも伝わるように（要件 §6.12）
    render(
      <AssembleStep step={q3} value="explain||" onChange={() => {}} />,
    );

    const on = screen.getByRole("button", { name: "分かりやすく説明して" });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(on.className).toContain("font-bold");
    expect(on.className).toContain("border-brand");
  });
});

describe("ポー", () => {
  it("考えている最中は、横から話しかけない", () => {
    /*
      答えたあとに「なるほど！」と受け取るのがポーの役目。考えている
      最中に出ると、見られながら解いている感じになる。
    */
    expect(poAppearance({ stepType: "assemble" })).toBeNull();
  });
});
