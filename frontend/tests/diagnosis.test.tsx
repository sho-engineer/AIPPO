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
import { DiagnosisResult } from "../src/components/course/DiagnosisResult";
import { COURSE, getLesson } from "../src/course/catalog";
import {
  AXES,
  NEXT_SKILL,
  STAGES,
  scoreDiagnosis,
} from "../src/course/diagnosisScore";
import { recommendLesson, recommendReason } from "../src/course/recommend";
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

describe("採点（4つの軸と現在地）", () => {
  /** 5問すべてに答えた形をつくる。 */
  const answers = (over: Partial<Record<string, string>> = {}) => ({
    ai_usage: "never",
    ask_style: "lost",
    build_prompt: "ideas|expert|technical",
    match_purpose: "compare|ideas|organize",
    want_to_do: "writing",
    ...over,
  });

  it("実際の回答のほうを重く見る", () => {
    /*
      自己申告だけだと、できると答えた人が本当にできるのかが
      分からない（それが3問だったころの弱点そのもの）。
      **自己申告3 : ミニ問題7。**

      自己申告は最高・ミニ問題は最低、という人と、その逆の人を
      比べる。ミニ問題ができているほうが上に来ること。
    */
    const talker = scoreDiagnosis(
      answers({ ai_usage: "daily", ask_style: "design" }),
    );
    const doer = scoreDiagnosis(
      answers({
        build_prompt: "explain|first_time|kind_polite",
        match_purpose: "organize|compare|ideas",
      }),
    );

    expect(doer.axes.purpose).toBeGreaterThan(talker.axes.purpose);
    expect(doer.axes.condition).toBeGreaterThan(talker.axes.condition);
  });

  it("模範解答を当てる遊びにしない", () => {
    /*
      Q3 の「誰向け？」は、初めて読む社員向けも新入社員向けも
      どちらも高く採る。1つだけの正解にすると、測っているのは
      「出題者の意図を読む力」になる。

      同点にはしない。**段階的に加点する**——満点の組み合わせが
      いちばん上で、文脈に合う別の答えもそのすぐ下、文脈から
      外れたものだけがはっきり下がる、という並びにする。
    */
    const best = scoreDiagnosis(answers({ build_prompt: "explain|first_time|kind_polite" }));
    const alt = scoreDiagnosis(answers({ build_prompt: "explain|newcomer|kind" }));
    const off = scoreDiagnosis(answers({ build_prompt: "explain|expert|technical" }));

    // 別の答えも「できている」側（3以上）に入る。落第にしない
    expect(alt.axes.condition).toBeGreaterThanOrEqual(3);
    expect(best.axes.condition).toBeGreaterThanOrEqual(alt.axes.condition);
    // 差は1段まで。外した答えとは、はっきり離れる
    expect(best.axes.condition - alt.axes.condition).toBeLessThanOrEqual(1);
    expect(off.axes.condition).toBeLessThan(alt.axes.condition);
  });

  it("現在地は積み上げで決める（順番が飛ばない）", () => {
    /*
      平均だと、頼めないのに仕事で組み立てられる、という順番の
      おかしい位置に出ることがある。
    */
    const beginner = scoreDiagnosis(answers());
    expect(beginner.stage.name).toBe("まず触ってみる段階");

    const expert = scoreDiagnosis(
      answers({
        ai_usage: "daily",
        ask_style: "design",
        build_prompt: "explain|first_time|kind_polite",
        match_purpose: "organize|compare|ideas",
      }),
    );
    expect(expert.stage.number).toBeGreaterThanOrEqual(4);
  });

  it("現在地の名前は、レベル番号ではなく「できること」で言う", () => {
    for (const stage of STAGES) {
      expect(stage.name).not.toMatch(/Level|レベル|[0-9]/);
      expect(stage.name).toMatch(/段階$/);
    }
  });

  it("できていることは2つまで", () => {
    // 並べるほど「できている感」は出るが、次にやることが埋もれる
    for (const usage of ["never", "tried", "sometimes", "work", "daily"]) {
      const result = scoreDiagnosis(answers({ ai_usage: usage }));
      expect(result.strengths.length).toBeGreaterThan(0);
      expect(result.strengths.length).toBeLessThanOrEqual(2);
    }
  });

  it("次に覚える技は、数字の低さではなく順番で決める", () => {
    /*
      AIを使ったことがないのにミニ問題ができた人は `workflow` が
      いちばん低くなる。素直に最小値を採ると、「まず触ってみる段階」の
      人に「出力形式の指定」を勧めることになる（実機でそうなった）。
    */
    const result = scoreDiagnosis(
      answers({
        ai_usage: "never",
        ask_style: "lost",
        build_prompt: "explain|first_time|kind_polite",
        match_purpose: "organize|compare|ideas",
      }),
    );

    expect(result.axes.ask).toBeLessThan(4);
    expect(NEXT_SKILL[result.weakest].name).toBe("プロンプト");
  });

  it("細かい点数は持たない（1〜5だけ）", () => {
    const result = scoreDiagnosis(answers());
    for (const axis of AXES) {
      expect(Number.isInteger(result.axes[axis])).toBe(true);
      expect(result.axes[axis]).toBeGreaterThanOrEqual(1);
      expect(result.axes[axis]).toBeLessThanOrEqual(5);
    }
  });
});

describe("おすすめは1本だけ", () => {
  const base = {
    ai_usage: "never",
    ask_style: "lost",
    build_prompt: "ideas|expert|technical",
    match_purpose: "compare|ideas|organize",
  };

  it("土台ができていない人には、やりたいことより先に土台を渡す", () => {
    /*
      画像をやりたい人にいきなり Day7 を出しても、AIへの基本的な
      頼み方ができていなければそこで詰まる。
    */
    expect(recommendLesson({ ...base, want_to_do: "images" })).toBe("rewrite_text");
  });

  it("土台ができている人には、行きたい方向を渡す", () => {
    // できていることをもう一度やらせるのは、いちばん早く飽きさせる
    const able = {
      ai_usage: "daily",
      ask_style: "design",
      build_prompt: "explain|first_time|kind_polite",
      match_purpose: "organize|compare|ideas",
      want_to_do: "comparing",
    };
    expect(recommendLesson(able)).toBe("compare_options");
  });

  it("理由は1行で返す", () => {
    const line = recommendReason({ ...base, want_to_do: "writing" });
    expect(line.length).toBeGreaterThan(0);
    expect(line.length).toBeLessThanOrEqual(60);
    expect(line).not.toContain("\n");
  });
});

describe("結果画面", () => {
  const values = {
    ai_usage: "sometimes",
    ask_style: "condition",
    build_prompt: "explain|first_time|kind",
    match_purpose: "organize|compare|ideas",
    want_to_do: "writing",
  };

  it("現在地・できていること2・次のAI技1・おすすめ1だけを出す", () => {
    /*
      前はここにおすすめが3本並んでいた。選べるように見えて、
      「次に何をするか」をもう一度選ばせているだけだった。
    */
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);

    expect(screen.getByTestId("diagnosis-stage")).toBeInTheDocument();
    expect(
      screen.getByTestId("diagnosis-strengths").querySelectorAll("li"),
    ).toHaveLength(2);
    expect(screen.getByTestId("diagnosis-next-skill")).toBeInTheDocument();
    // おすすめは1つ。2つ目・3つ目の節は無い
    expect(screen.getAllByTestId("diagnosis-lesson")).toHaveLength(1);
    expect(screen.queryByText(/おすすめ ?2/)).toBeNull();
    expect(screen.queryByText(/おすすめ ?3/)).toBeNull();
  });

  it("細かい点数を、通常の画面に出さない", () => {
    // 5問から出した数字に、68点・82点のような精度は無い
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);

    const shown = screen.getByTestId("completion-view").textContent ?? "";
    expect(shown).not.toMatch(/\d+点/);
    expect(shown).not.toMatch(/\d\s*\/\s*5/);
  });

  it("長い話は「理由を見る」の中へ逃がす", async () => {
    const user = userEvent.setup();
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);

    // 通常の画面には、軸の名前も回答の一覧も出ていない
    const shown = screen.getByTestId("completion-view").textContent ?? "";
    expect(shown).not.toContain("いまの4つの力");
    expect(shown).not.toContain("どの回答から判断したか");

    await user.click(screen.getByTestId("diagnosis-reason-open"));

    const sheet = screen.getByTestId("diagnosis-reason-sheet");
    expect(sheet).toHaveTextContent("いまの4つの力");
    expect(sheet).toHaveTextContent("どの回答から判断したか");
    expect(sheet).toHaveTextContent("次に伸ばすとよいところ");
    // 中央に浮かべる一枚（送れるのはこの中だけ）
    expect(sheet).toHaveAttribute("data-placement", "center");
  });

  it("理由の中では、記号ではなく選んだ言葉で返す", async () => {
    const user = userEvent.setup();
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);
    await user.click(screen.getByTestId("diagnosis-reason-open"));

    const sheet = screen.getByTestId("diagnosis-reason-sheet");
    expect(sheet).toHaveTextContent("困ったときにAIを使う");
    expect(sheet).not.toHaveTextContent("sometimes");
    expect(sheet).not.toHaveTextContent("first_time");
  });
});
