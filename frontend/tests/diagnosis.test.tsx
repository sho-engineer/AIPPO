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

describe("次の一歩と、おすすめの1本", () => {
  /*
    **この2つが食い違わないこと。**

    実機で「次の一歩 プロンプト ／ Day 5・選択肢を比較する」と出た。
    Day5 はプロンプトを渡す回ではない。原因は物差しのずれで、

        次に伸ばすところ … 4 未満の軸を探す（`scoreDiagnosis`）
        土台はできている … `ask >= 3 && condition >= 3`（`recommendLesson`）

    と 1 ずれていた。「AIに頼む」が**ちょうど 3**の人は、技として
    「プロンプト」を出しながら、行き先は行きたい方向のほうへ渡って
    いた。1件だけでなく、答えの組み合わせ 1125 通りを総当たりで見る。
  */
  const USAGE = ["never", "tried", "sometimes", "work", "daily"];
  const STYLE = ["lost", "short", "condition", "adapt", "design"];
  const WHAT = ["explain", "summarize", "ideas"];
  const WHO = ["first_time", "newcomer", "expert"];
  const HOW = ["kind", "polite", "kind_polite", "technical", "casual"];

  /** 総当たり。5問ぶんの答えを作って回す。 */
  function everyAnswer(): Record<string, string>[] {
    const all: Record<string, string>[] = [];
    for (const ai_usage of USAGE)
      for (const ask_style of STYLE)
        for (const what of WHAT)
          for (const who of WHO)
            for (const how of HOW)
              all.push({
                ai_usage,
                ask_style,
                build_prompt: `${what}|${who}|${how}`,
                match_purpose: "organize|compare|ideas",
                // 行きたい方向は、土台とわざとぶつける
                want_to_do: "comparing,images",
              });
    return all;
  }

  it("土台が弱いうちは、行きたい方向より土台の1本を渡す", () => {
    /*
      「頼む」「条件」が次に伸ばすところなら、渡すのは Day1。
      ここで行きたい方向（比較・画像）へ渡すと、技の名前と
      行き先が食い違う。
    */
    const wrong: string[] = [];
    for (const answers of everyAnswer()) {
      const { weakest } = scoreDiagnosis(answers);
      if (weakest !== "ask" && weakest !== "condition") continue;
      const lesson = recommendLesson(answers);
      if (lesson !== "rewrite_text") {
        wrong.push(`${JSON.stringify(answers)} → ${lesson}`);
      }
    }
    expect(wrong.slice(0, 3).join("\n")).toBe("");
  });

  it("1行の理由も、同じ軸から出す", () => {
    // 技は「プロンプト」なのに「頼み方は身についています」と言わない
    const LINE: Record<string, string> = {
      ask: "まずは、AIへの頼み方から始めましょう。",
      condition: "お願いはできています。次は「誰向けか」を。",
      purpose: "頼み方は身についています。次は場面に合う使い方を。",
      workflow: "土台はそろっています。次は仕事の流れの中へ。",
    };
    for (const answers of everyAnswer()) {
      const { weakest } = scoreDiagnosis(answers);
      expect(recommendReason(answers)).toBe(LINE[weakest]);
    }
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

  it("読まなくても分かる形——まず図が出る", () => {
    /*
      前はここが文字だけだった。「いまの現在地」「できていること」
      「次の一歩」と見出しが縦に並び、下に短い文がぶら下がる。読めば
      分かるが、**読むまで何も分からない**。
    */
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);

    // 開いた直後は道。5つの点でどこまで来たかを出す
    expect(screen.getByTestId("growth-track")).toBeInTheDocument();
    expect(screen.getAllByTestId("growth-node")).toHaveLength(5);
  });

  it("図は2通りから選べる", async () => {
    /*
      同じ4つの答えでも知りたいことは人によって違う。両方を同時に
      出すと縦に伸びるうえ、どちらを読めばよいのか決められない。
    */
    const user = userEvent.setup();
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);

    expect(screen.queryByTestId("radar-chart")).toBeNull();

    await user.click(screen.getByTestId("chart-tab-balance"));
    expect(screen.getByTestId("radar-chart")).toBeInTheDocument();
    // 片方ずつ。2つ同時には出さない
    expect(screen.queryByTestId("growth-track")).toBeNull();

    await user.click(screen.getByTestId("chart-tab-stage"));
    expect(screen.getByTestId("growth-track")).toBeInTheDocument();
    expect(screen.queryByTestId("radar-chart")).toBeNull();
  });

  it("図を切り替えても、できていることは消えない", async () => {
    // 切り替えるのは図の見せ方であって、できていることではない
    const user = userEvent.setup();
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);

    await user.click(screen.getByTestId("chart-tab-balance"));
    expect(
      screen.getByTestId("diagnosis-strengths").querySelectorAll("li"),
    ).toHaveLength(2);
  });

  it("軸ごとの内訳は、通常の画面に出さない", async () => {
    /*
      内訳は「なぜそう出たか」を知りたい人のもので、次の1本を
      決めるのに要るものではない。横棒4本で 85px 取ると、その分
      おすすめと「くわしく見る」が下のボタンに隠れる。
    */
    const user = userEvent.setup();
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);

    expect(screen.queryAllByTestId("axis-bar")).toHaveLength(0);

    await user.click(screen.getByTestId("diagnosis-reason-open"));
    expect(screen.getAllByTestId("axis-bar")).toHaveLength(4);
  });

  it("添えたレッスンは、押せば始められる", async () => {
    // 押せる形にしてあるのに押せないと、見えているだけで届かない道になる
    const user = userEvent.setup();
    const picked: string[] = [];
    render(
      <DiagnosisResult
        values={values}
        lessons={COURSE.lessons}
        onPickLesson={(id) => picked.push(id)}
      />,
    );

    await user.click(screen.getAllByTestId("diagnosis-also-open")[0]);
    expect(picked).toHaveLength(1);
  });

  it("いまいる点が1つだけ光り、次の点が分かる", () => {
    // 光る点が2つあると、どちらが現在地なのか決められない
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);

    const nodes = screen.getAllByTestId("growth-node");
    const here = nodes.filter((one) => one.dataset.state === "here");
    const next = nodes.filter((one) => one.dataset.state === "next");
    expect(here).toHaveLength(1);
    expect(next.length).toBeLessThanOrEqual(1);
  });

  it("おすすめは、1本目を大きく・残り2本を小さく", () => {
    /*
      1本だけにしていた時期がある。3本並ぶと「次に何をするか」を
      もう一度選ばせることになる、という理由だった。ただし1本だけだと
      **その1本が刺さらなかった人の行き先が無くなる**ので、
      大きさを変えて3本出す。
    */
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);

    expect(screen.getByTestId("diagnosis-next-skill")).toBeInTheDocument();
    // 大きく出すのは1本だけ
    expect(screen.getAllByTestId("diagnosis-lesson")).toHaveLength(1);
    // 添えるのは2本まで
    expect(
      screen.getByTestId("diagnosis-also").querySelectorAll("li"),
    ).toHaveLength(2);
  });

  it("できていることは、2つまで", () => {
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);
    expect(
      screen.getByTestId("diagnosis-strengths").querySelectorAll("li"),
    ).toHaveLength(2);
  });

  it("細かい点数を、通常の画面に出さない", () => {
    // 5問から出した数字に、68点・82点のような精度は無い
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);

    const shown = screen.getByTestId("completion-view").textContent ?? "";
    expect(shown).not.toMatch(/\d+点/);
    expect(shown).not.toMatch(/\d\s*\/\s*5/);
  });

  it("長い話は「くわしく見る」の中へ逃がす", async () => {
    const user = userEvent.setup();
    render(<DiagnosisResult values={values} lessons={COURSE.lessons} />);

    // 通常の画面には、答えの一覧も段階の説明も出ていない
    const shown = screen.getByTestId("completion-view").textContent ?? "";
    expect(shown).not.toContain("答えた内容");
    expect(shown).not.toContain("次に伸ばすとよいところ");
    expect(shown).not.toContain("4つの力の内訳");

    await user.click(screen.getByTestId("diagnosis-reason-open"));

    const sheet = screen.getByTestId("diagnosis-reason-sheet");
    expect(sheet).toHaveTextContent("答えた内容");
    expect(sheet).toHaveTextContent("次に伸ばすとよいところ");
    expect(sheet).toHaveTextContent("いまの段階");
    expect(sheet).toHaveTextContent("4つの力の内訳");
    // 中央に浮かべる一枚（送れるのはこの中だけ）
    expect(sheet).toHaveAttribute("data-placement", "center");
  });

  it("答えの直しは、その一枚の中から", async () => {
    /*
      結果を見てから「そこは違う」と気づく人がいる。気づいたのに
      直せないと、出た結果を信じるしかなくなる。
    */
    const user = userEvent.setup();
    const edited: string[] = [];
    render(
      <DiagnosisResult
        values={values}
        lessons={COURSE.lessons}
        onEditAnswer={(id) => edited.push(id)}
      />,
    );

    await user.click(screen.getByTestId("diagnosis-reason-open"));
    const buttons = screen
      .getByTestId("diagnosis-reason-sheet")
      .querySelectorAll("button");
    const fix = [...buttons].find((one) => one.textContent?.includes("なおす"));
    expect(fix).toBeDefined();
    await user.click(fix as HTMLElement);
    expect(edited).toEqual(["ai_usage"]);
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
