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

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssembleStep } from "../src/components/course/steps/Assemble";
import {
  DiagnosisResult,
  type DiagnosisResultProps,
} from "../src/components/course/DiagnosisResult";
import { DiagnosisIntro } from "../src/components/course/diagnosis/DiagnosisIntro";
import { ANALYZING_MS } from "../src/components/course/diagnosis/Analyzing";
import { COURSE, getLesson } from "../src/course/catalog";
import {
  AXES,
  AXIS_LABELS,
  NEXT_LEARNING,
  NEXT_SKILL,
  STAGES,
  scoreDiagnosis,
} from "../src/course/diagnosisScore";
import {
  DIAGNOSIS_PHASES,
  PHASE_COPY,
  nextPhase,
  prevPhase,
  type DiagnosisPhase,
} from "../src/course/diagnosisFlow";
import {
  recommendLead,
  recommendLesson,
  recommendReason,
} from "../src/course/recommend";
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


describe("結果の4画面", () => {
  /*
    前は結果が1画面だった。図・できていること・次の一歩・おすすめが
    同時に並び、下のボタンは最初から「ここから始める」。**読む前に
    次へ行く道が目に入る**ので、結果は読まれずに押されていた。

    いまは4つに割ってある（`course/diagnosisFlow.ts`）。見張るのは、
    **それぞれの画面が、その画面のことだけを言っていること**。
    1つの画面に次の画面の話が混ざった時点で、割った意味が消える。
  */
  const values = {
    ai_usage: "sometimes",
    ask_style: "condition",
    build_prompt: "explain|first_time|kind",
    match_purpose: "organize|compare|ideas",
    want_to_do: "writing",
  };

  const show = (phase: DiagnosisPhase, extra: Partial<DiagnosisResultProps> = {}) =>
    render(
      <DiagnosisResult
        values={values}
        lessons={COURSE.lessons}
        phase={phase}
        onAnalyzed={() => {}}
        {...extra}
      />,
    );

  it("答え終わってすぐは、結果ではなく分析中", () => {
    /*
      押した／出た、の2コマしかないと、答えが読まれた実感が残らない
      ——「アンケートのよう」と言われたのがそこ。足しているのは待ち
      時間ではなく、**何を見て判断したか**。
    */
    show("analyzing");

    expect(screen.getByTestId("diagnosis-analyzing")).toBeInTheDocument();
    // 4つの観点。結果の「4つの力」と同じ4つであること
    expect(screen.getAllByTestId("analyzing-axis")).toHaveLength(AXES.length);
    // まだ結果は1つも出さない
    expect(screen.queryByTestId("growth-track")).toBeNull();
    expect(screen.queryByTestId("diagnosis-next-skill")).toBeNull();
  });

  it("分析が終わったら、待たずに次へ渡す", () => {
    vi.useFakeTimers();
    let done = 0;
    render(
      <DiagnosisResult
        values={values}
        lessons={COURSE.lessons}
        phase="analyzing"
        onAnalyzed={() => (done += 1)}
      />,
    );

    expect(done).toBe(0);
    act(() => void vi.advanceTimersByTime(ANALYZING_MS + 50));
    expect(done).toBe(1);
    vi.useRealTimers();
  });

  it("①現在地では、まだ Lesson の話をしない", () => {
    /*
      いちばん効いた並べ替え。前は現在地のすぐ下に「次の一歩 ＋
      おすすめ Day1」が並んでいて、現在地を読み終える前に目が
      そちらへ行っていた。次の話は2画面あと。
    */
    show("stage");

    expect(screen.getByTestId("growth-track")).toBeInTheDocument();
    expect(screen.getAllByTestId("growth-node")).toHaveLength(5);
    expect(screen.queryByTestId("diagnosis-next-skill")).toBeNull();
    expect(screen.queryByTestId("diagnosis-lesson")).toBeNull();
  });

  it("①現在地には、回答から見えた特徴を3つまで", () => {
    /*
      できていることだけを並べると、読んだ人は次に何をするのか
      分からない。**最後の1つは必ず「これから」**にしてある
      （`traitsOf`）。境目がこの並びの中にあることが、次の画面への橋。
    */
    show("stage");

    const items = screen.getByTestId("diagnosis-traits").querySelectorAll("li");
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(3);
    expect(items[items.length - 1].textContent).toContain("これから");
  });

  it("いまいる点が1つだけ光り、次の点が分かる", () => {
    // 光る点が2つあると、どちらが現在地なのか決められない
    show("stage");

    const nodes = screen.getAllByTestId("growth-node");
    expect(nodes.filter((one) => one.dataset.state === "here")).toHaveLength(1);
    expect(
      nodes.filter((one) => one.dataset.state === "next").length,
    ).toBeLessThanOrEqual(1);
  });

  it("②4つの力は、図だけで終わらせない", () => {
    /*
      ひし形は「どこが薄いか」を一目にするが、そこから何をすれば
      よいかは出てこない。強み／次に伸ばす力／次に覚えること の3行で
      次の画面へつなぐ。
    */
    show("axes");

    const rows = screen
      .getByTestId("diagnosis-axes-summary")
      .querySelectorAll("div");
    expect(rows).toHaveLength(3);
    const text = screen.getByTestId("diagnosis-axes-summary").textContent ?? "";
    expect(text).toContain("強み");
    expect(text).toContain("次に伸ばす力");
    expect(text).toContain("次に覚えること");
  });

  it("②の「次に覚えること」は、技の名前ではなくやることで書く", () => {
    /*
      「ターゲット指定」はこのアプリの中の呼び名で、初めて見る人には
      何をするのか分からない。ここはそのレッスンで**実際に手を動かす
      こと**を1行で言う。
    */
    const { weakest } = scoreDiagnosis(values);
    show("axes");

    expect(screen.getByTestId("diagnosis-axes-summary")).toHaveTextContent(
      NEXT_LEARNING[weakest],
    );
  });

  it("②の強みと次に伸ばす力が、採点と食い違わない", () => {
    const result = scoreDiagnosis(values);
    show("axes");

    const text = screen.getByTestId("diagnosis-axes-summary").textContent ?? "";
    expect(text).toContain(AXIS_LABELS[result.strongest]);
    expect(text).toContain(AXIS_LABELS[result.weakest]);
  });

  it("③おすすめは、診断の結果を引いて理由を言う", () => {
    /*
      「あなたにおすすめ」とだけ書いてあると、何を見て選んだのかが
      分からない——診断の結果とつながっていない推薦は、広告と
      区別が付かない。
    */
    show("lesson");

    expect(screen.getByTestId("diagnosis-lesson")).toBeInTheDocument();
    expect(screen.getByTestId("diagnosis-reason-line")).toHaveTextContent(
      recommendLead(values),
    );
  });

  it("③のおすすめは、押せば始められる", async () => {
    // 押せる形にしてあるのに押せないと、見えているだけで届かない道になる
    const user = userEvent.setup();
    const picked: string[] = [];
    show("lesson", { onPickLesson: (id: string) => picked.push(id) });

    await user.click(screen.getByTestId("diagnosis-next-skill"));
    expect(picked).toEqual([recommendLesson(values)]);
  });

  it("その1本が合わない人の行き先も、押せば出る", async () => {
    /*
      画面に3枚並べると「次に何をするか」をもう一度選ばせることに
      なる。かといって消すと、画像をやりたくて来た人に1本だけ出して
      終わる形になる。決めるのは上の1本、ここはその逃げ道。
    */
    const user = userEvent.setup();
    show("lesson");

    await user.click(screen.getByTestId("diagnosis-also-open"));
    expect(
      screen.getByTestId("diagnosis-also").querySelectorAll("li"),
    ).toHaveLength(2);
  });

  it("細かい点数を、どの画面にも出さない", () => {
    // 5問から出した数字に、68点・82点のような精度は無い
    for (const phase of ["stage", "axes", "lesson"] as const) {
      const view = show(phase);
      const shown =
        view.getByTestId("completion-view").textContent ?? "";
      expect(shown, phase).not.toMatch(/\d+点/);
      expect(shown, phase).not.toMatch(/\d\s*\/\s*5/);
      view.unmount();
    }
  });

  it("長い話は、どの画面からも同じ一枚の中へ", async () => {
    /*
      入口を画面ごとに変えない。読みたくなる場所は人によって違うが
      （現在地に納得できない／おすすめに納得できない）、見たいものは
      同じ「答えた内容と、そこからの判断」1つ。
    */
    const user = userEvent.setup();
    for (const phase of ["stage", "axes", "lesson"] as const) {
      const view = show(phase);

      const shown = view.getByTestId("completion-view").textContent ?? "";
      expect(shown, phase).not.toContain("答えた内容");

      await user.click(view.getByTestId("diagnosis-reason-open"));
      const sheet = view.getByTestId("diagnosis-detail-sheet");
      expect(sheet).toHaveTextContent("答えた内容");
      expect(sheet).toHaveTextContent("4つの力の内訳");
      view.unmount();
    }
  });

  it("「いまの様子」の一枚は、もう無い", () => {
    /*
      現在地・できていること・次にやること・4つの力の内訳が入って
      いた一枚。いまはそれが**画面そのもの**になったので、同じことを
      2か所で言っている状態だった。廃止したことをここで押さえる
      ——戻すと、また画面と一枚が同じことを言い始める。
    */
    show("stage");
    expect(screen.queryByTestId("diagnosis-reason-sheet")).toBeNull();
    // 図の切り替えも、置き場所が役を持ったので要らない
    expect(screen.queryByTestId("chart-switch")).toBeNull();
  });

  it("答えの直しは、その一枚の中から", async () => {
    /*
      結果を見てから「そこは違う」と気づく人がいる。気づいたのに
      直せないと、出た結果を信じるしかなくなる。
    */
    const user = userEvent.setup();
    const edited: string[] = [];
    show("stage", { onEditAnswer: (id: string) => edited.push(id) });

    await user.click(screen.getByTestId("diagnosis-reason-open"));
    const buttons = screen
      .getByTestId("diagnosis-detail-sheet")
      .querySelectorAll("button");
    const fix = [...buttons].find((one) => one.textContent?.includes("なおす"));
    expect(fix).toBeDefined();
    await user.click(fix as HTMLElement);
    expect(edited).toEqual(["ai_usage"]);
  });

  it("理由の中では、記号ではなく選んだ言葉で返す", async () => {
    const user = userEvent.setup();
    show("stage");
    await user.click(screen.getByTestId("diagnosis-reason-open"));

    const sheet = screen.getByTestId("diagnosis-detail-sheet");
    expect(sheet).toHaveTextContent("困ったときにAIを使う");
    expect(sheet).not.toHaveTextContent("sometimes");
    expect(sheet).not.toHaveTextContent("first_time");
  });
});

describe("画面の上と下で、言うことがずれない", () => {
  /*
    見出しと下のボタンは `LessonRunner`、中身は `DiagnosisResult` が
    出す。**2つのファイルにまたがる**ので、文言は1か所に持たせてある
    （`course/diagnosisFlow.ts`）。ここはその表そのものを見る。
  */
  it("4画面とも、見出しと主ボタンを持っている", () => {
    for (const phase of DIAGNOSIS_PHASES) {
      const copy = PHASE_COPY[phase];
      expect(copy.title, phase).toBeTruthy();
      expect(copy.po, phase).toBeTruthy();
      /* おすすめだけは Day の番号で作るので空 */
      if (phase !== "lesson") expect(copy.primary, phase).toBeTruthy();
    }
  });

  it("分析中には「診断結果」と書かない", () => {
    // まだ出ていないものを、出たことにしない
    expect(PHASE_COPY.analyzing.eyebrow).toBeUndefined();
    for (const phase of ["stage", "axes", "lesson"] as const) {
      expect(PHASE_COPY[phase].eyebrow, phase).toBe("診断結果");
    }
  });

  it("分析中へは戻さない", () => {
    /*
      戻ったところで同じ 1.8 秒をもう一度待つだけで、戻る先として
      意味を持たない。現在地から戻る人が行きたいのは最後の質問。
    */
    expect(prevPhase("stage")).toBeNull();
    expect(prevPhase("axes")).toBe("stage");
    expect(prevPhase("lesson")).toBe("axes");
  });

  it("進む順は、現在地 → 4つの力 → おすすめ", () => {
    expect(nextPhase("analyzing")).toBe("stage");
    expect(nextPhase("stage")).toBe("axes");
    expect(nextPhase("axes")).toBe("lesson");
    // 最後まで来たら、レッスンへ渡す（`LessonRunner`）
    expect(nextPhase("lesson")).toBeNull();
  });
});

describe("開始画面", () => {
  it("大きな説明画像を置かない", () => {
    /*
      ここには全体図が1枚あった。外した理由は2つで、**どちらも絵を
      差し替えても直らない**——絵の中の「AI活用診断」が上の帯と
      二重になっていたことと、詰め込まれた1枚が広告のバナーに
      見えたこと。
    */
    render(<DiagnosisIntro />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("答える前の不安に、3つだけ答える", () => {
    // 長さが分からない・間違えたら嫌だ、が始めない理由の大半
    render(<DiagnosisIntro />);

    const meta = screen.getByTestId("diagnosis-meta").textContent ?? "";
    expect(meta).toContain("全5問");
    expect(meta).toContain("約1分");
    expect(meta).toContain("正解・不正解なし");
  });

  it("5段階は見せるが、現在地はまだ出さない", () => {
    /*
      これは**診断する範囲**の下見で、結果ではない。1つを光らせると、
      答える前に「あなたはここ」と言うことになる。
    */
    render(<DiagnosisIntro />);

    const nodes = screen.getAllByTestId("growth-node");
    expect(nodes).toHaveLength(5);
    expect(nodes.filter((one) => one.dataset.state === "here")).toHaveLength(0);
    expect(screen.queryByTestId("growth-stage-name")).toBeNull();
  });

  it("「全5問」と、教材の問いの数が食い違わない", () => {
    // 増やしたときに、開始画面だけが古い数を言い続けないように
    expect(questions).toHaveLength(5);
  });
});
