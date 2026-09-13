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
import {
  DiagnosisResult,
  type DiagnosisResultProps,
} from "../src/components/course/DiagnosisResult";
import { DiagnosisIntro } from "../src/components/course/diagnosis/DiagnosisIntro";
import { COURSE, getLesson } from "../src/course/catalog";
import {
  AXES,
  AXIS_LABELS,
  NEXT_LEARNING,
  NEXT_SKILL,
  STAGES,
  scoreDiagnosis,
  traitsOf,
} from "../src/course/diagnosisScore";
import {
  DIAGNOSIS_PHASES,
  PHASE_COPY,
  nextPhase,
  prevPhase,
  type DiagnosisPhase,
} from "../src/course/diagnosisFlow";
import {
  recommendLead, recommendPlan,
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
    expect(beginner.stage.name).toBe("AIを試し始めている段階");

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
        {...extra}
      />,
    );

  it("答え終わったら、待たずに現在地を出す", () => {
    /*
      **「分析しています」の画面は無い。**

      前は4つの観点が順に点く画面を 1.8 秒挟んでいた。消した理由は
      2つある。

      1つ目。採点は同期で終わる（`course/diagnosisScore.ts` は計算
      だけで、AIもサーバーも呼ばない）。待つものが無いのに待たせて
      いた。

      2つ目のほうが重い。あの画面は4つの観点を**白い角丸カードに
      丸い印**を付けて縦に並べ、順に青くしていた。直前まで答えて
      いた選択肢と見分けが付かないので、**自分が押していない項目に
      勝手にチェックが付いていく**ように見えていた。診断を信じて
      もらうための画面が、逆のことをしていた。

      ここで見張るのは「無いこと」。足し戻すと、この検査が止める。
    */
    const first = DIAGNOSIS_PHASES[0];
    expect(first, "結果は現在地から始まる").toBe("stage");

    show(first);

    expect(screen.getByTestId("growth-track")).toBeInTheDocument();
    // 分析中のかけらも残っていないこと
    expect(screen.queryByTestId("diagnosis-analyzing")).toBeNull();
    expect(screen.queryByTestId("analyzing-axis")).toBeNull();
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

  it("特徴が、現在地と食い違わない", () => {
    /*
      実機で出た食い違い——

          あなたの現在地  AIを試し始めている段階
          ✓ 条件を加えて結果を調整できる
          ✓ 目的に応じて使い方を選べる

      AIを使ったことがない人がミニ問題をうまく答えると、こうなった。
      読んだ人には同じ画面が2つのことを言っているようにしか見えず、
      しかも**下の3行のほうが具体的**なので、上の判定が間違っている
      と読まれる。

      総当たりで見る。5問の答えの組み合わせを機械に作らせて、
      「まだ触っていない段階の人に、できていることが出ていない」
      ことを全部の組で確かめる——**1つの例で直したつもりになると、
      別の組み合わせで同じことが起きる**（前がまさにそれ）。
    */
    const usage = ["never", "tried", "sometimes", "work", "daily"];
    const style = ["lost", "short", "condition", "adapt", "design"];
    const built = ["explain|first_time|kind", "summarize|expert|casual"];
    const matched = ["organize|compare|ideas", "organize|organize|organize"];

    for (const ai_usage of usage) {
      for (const ask_style of style) {
        for (const build_prompt of built) {
          for (const match_purpose of matched) {
            const values = {
              ai_usage,
              ask_style,
              build_prompt,
              match_purpose,
              want_to_do: "writing",
            };
            const result = scoreDiagnosis(values);
            const traits = traitsOf(result);
            const where = JSON.stringify(values);

            /*
              できている行の数は、**現在地が越えた段の数を超えない**。
              現在地1（AIを試し始めている）なら、できている行は0。
            */
            const doneLines = traits.filter(
              (line) => !line.endsWith("これから"),
            ).length;
            expect(
              doneLines,
              `現在地は「${result.stage.name}」なのに、できている行が ${doneLines}本 ${where}`,
            ).toBeLessThanOrEqual(result.stage.number - 1);

            /*
              最後の行は「これから」。ただし**4つとも届いている人だけは
              別**——まだのところが無いので、そう言う。前はその人にも
              「仕事の流れへの組み込みはこれから」と出ていた（現在地が
              「仕事の流れに組み込めている段階」なのに、である）。
            */
            const done = AXES.every((axis) => result.axes[axis] >= 4);
            expect(traits.at(-1), where).toMatch(done ? /使えている$/ : /これから$/);
            expect(traits.length, where).toBeLessThanOrEqual(3);

            /*
              **現在地の名前が、まだのところを「できる」と言わない。**

              これが実機で見つかった食い違いそのもの。境目が2つ
              （段は3、身に付いたは4）あったころは、総当たりで5通り
              出ていた——「条件を加えられる段階」と「条件を加えるのは
              これから」が同じ画面に並ぶ、という形で。

              いまは現在地の名前を `weakest` から作っている
              （`course/diagnosisScore.ts`）ので、構造として起きない。
              ここは**そこへ戻っていないこと**を見る。

              見方：その軸が「これから」なら、現在地の名前はその軸を
              言い切らない（「〜できる」「〜られる」「〜ている」で
              終わらない）こと。「〜し始めている」は途中なので可。
            */
            const CLAIMS: Record<string, RegExp> = {
              ask: /AIに頼める/,
              condition: /条件を加えられる/,
              purpose: /使い分けられる/,
              workflow: /組み込めている/,
            };
            const nextLine = traits.at(-1) ?? "";
            if (nextLine.endsWith("これから")) {
              expect(
                result.stage.name,
                `現在地「${result.stage.name}」が、まだの力を「できる」と言っている` +
                  `（次に伸ばす力: ${result.weakest}）${where}`,
              ).not.toMatch(CLAIMS[result.weakest]);
            }
          }
        }
      }
    }
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

  it("ほかの候補は、**開いているものだけ**", () => {
    /*
      「上の1本が合わなかった人の逃げ道」として、ほかの候補を
      押すと出せるようにしてある。そこに準備中の教材を混ぜない
      ——押した先で止まる道は、道ではない。

      第1リリースでは開いているのが Day1 だけなので、逃げ道は
      1本も無い。**入口ごと出さない**（押しても空の一枚が開くだけ
      になるため）。教材を公開すれば自然に出てくる。
    */
    show("lesson");

    expect(recommendPlan(values).rest).toEqual([]);
    expect(screen.queryByTestId("diagnosis-also-open")).toBeNull();
  });

  it("公開したかどうかは、**届いた一覧**で決める", () => {
    /*
      公開状態を持っているのはサーバーから届く一覧のほう
      （`src/course/live.ts`）。同梱データだけを見ていると、教材を
      1本開いた日に、画面の一覧は増えているのに診断のおすすめだけが
      古い範囲のまま残る——「Day2 が並んでいるのに、診断はすすめて
      くれない」状態になる。

      `recommendPlan` は渡された一覧で決めること。
    */
    const opened = COURSE.lessons.map((lesson) => ({
      ...lesson,
      availability: "available" as const,
    }));

    const closed = recommendPlan(values);
    const open = recommendPlan(values, opened);

    // 同梱データのままなら、逃げ道は無い（上の回と同じ）
    expect(closed.rest).toEqual([]);
    // 全部開けば、逃げ道が出てくる
    expect(open.rest.length).toBeGreaterThan(0);
    // 本来のおすすめも「準備中」ではなくなる
    expect(open.waiting).toBeUndefined();
  });

  it("本来のおすすめが準備中なら、そう添える", () => {
    /*
      黙って Day1 へ差し替えない。答えから出た行き先が画面に出て
      いないと、「自分に合わせて選ばれた」のか「1本しか無いから
      そうなった」のかが分からない——診断が効いていないように見える。

      ただし**開始ボタンは付けない**。押せる形にしてあるのに
      押せないのは、見えているだけで届かない道になる。
    */
    const plan = recommendPlan({ ...values, want_to_do: "summarizing" });
    if (!plan.waiting) return; // 全部公開したら、この画面は出なくなる

    render(
      <DiagnosisResult
        values={{ ...values, want_to_do: "summarizing" }}
        lessons={COURSE.lessons}
        phase="lesson"
        onPickLesson={() => {}}
      />,
    );

    expect(screen.getByTestId("diagnosis-open-label")).toHaveTextContent(
      "今受けられるおすすめ",
    );
    const waiting = screen.getByTestId("diagnosis-waiting");
    expect(waiting).toHaveTextContent("あなたに合う次のLesson");
    expect(waiting).toHaveTextContent("準備中");
    // 押せるものは、この中に1つも無い
    expect(waiting.querySelectorAll("button")).toHaveLength(0);
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
  it("3画面とも、見出しと主ボタンを持っている", () => {
    for (const phase of DIAGNOSIS_PHASES) {
      const copy = PHASE_COPY[phase];
      expect(copy.title, phase).toBeTruthy();
      expect(copy.po, phase).toBeTruthy();
      /* おすすめだけは Day の番号で作るので空 */
      if (phase !== "lesson") expect(copy.primary, phase).toBeTruthy();
    }
  });

  it("3画面とも「診断結果」と名乗る", () => {
    /*
      前はここに「分析中には『診断結果』と書かない」があった。
      まだ出ていないものを出たことにしない、という話だったが、
      その画面自体を消したので、**残る3つは全部が結果**になった。
    */
    for (const phase of DIAGNOSIS_PHASES) {
      expect(PHASE_COPY[phase].eyebrow, phase).toBe("診断結果");
    }
  });

  it("先頭から戻ると、教材のほうへ渡す", () => {
    /*
      現在地から「戻る」を押した人が行きたいのは最後の質問
      （＝答えを直せる場所）。`null` を受けた呼び出し側が、
      教材のステップを1歩戻す（`LessonRunner`）。
    */
    expect(prevPhase("stage")).toBeNull();
    expect(prevPhase("axes")).toBe("stage");
    expect(prevPhase("lesson")).toBe("axes");
  });

  it("進む順は、現在地 → 4つの力 → おすすめ", () => {
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
