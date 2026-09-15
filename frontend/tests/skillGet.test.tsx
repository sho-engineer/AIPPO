/**
 * AI技を受け取る場面。
 *
 * 3回から1回へ
 * ------------
 * 前は技を1つずつ、使った場所で受け取っていた。名前が付くのは使った
 * 直後がよい——それは変えていない。変えたのは**祝う回数**のほうで、
 * Day1 の中に受け取る画面が3回あり、そのたびに学習が止まっていた
 * （ポーが中央へ出て、紙が散って、押して戻る、を3回）。
 *
 * いまは、使った場所では名前を言うだけ（解説カード）。受け取るのは
 * 自分の文章を仕上げたあとの1回で、そこで3つそろって出る
 * （`components/course/day1/SkillRecap.tsx`）。
 *
 * 見張るのは4つ。
 *
 *   1. その日の技3つが、名前つきで受け取れること
 *   2. 名前が AI分野で普通に使う言葉であること（造語にしない）
 *   3. 受け取る画面が、**レッスンの中で1回だけ**であること
 *   4. 名前を言う画面は、名前を言うだけで止まること（祝わない）
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { SkillRecap } from "../src/components/course/day1/SkillRecap";
import { LessonRunner } from "../src/pages/LessonRunner";
import { getLesson } from "../src/course/catalog";
import type { Lesson } from "../src/course/types";

const DAY1 = getLesson("rewrite_text")!;

/** その日の技をまとめて渡す画面（`meta.recap` を持つ回）。 */
const recapStep = DAY1.steps.find(
  (step) => (step.meta as { recap?: unknown } | undefined)?.recap,
)!;

const recap = (recapStep.meta as { recap: { name: string; body: string }[] }).recap;

describe("まとめて受け取る画面", () => {
  it("数を先に出す。3つあることが、押す前に分かる", () => {
    /*
      1つずつ受け取っていたころは、最後まで来ても**何個取ったのかが
      画面のどこにも出ていなかった**。「3 / 3」は、その日に持って帰る
      ものの数そのもの。
    */
    render(<SkillRecap items={recap} />);

    expect(screen.getByTestId("skill-recap-count")).toHaveTextContent("3 / 3");
    expect(screen.getAllByTestId("skill-recap-item")).toHaveLength(3);
  });

  it("名前と、1行の説明を出す", () => {
    render(<SkillRecap items={recap} />);

    const card = screen.getByTestId("skill-recap");
    expect(card).toHaveTextContent("プロンプト");
    expect(card).toHaveTextContent("読者設定");
    expect(card).toHaveTextContent("トーン設定");
  });
});

describe("Day1 の3つの技", () => {
  it("その日おぼえる3つが、教材データと画面でそろっている", () => {
    /*
      コース一覧や完了画面が出す名前（`learnedSkills`）と、受け取る
      画面が出す名前が違うと、**同じものだと気づけない**。
    */
    expect(recap.map((one) => one.name)).toEqual(DAY1.learnedSkills);
  });

  it("名前は、AI分野で普通に使う言葉にする", () => {
    /*
      ここで覚えた言葉が、外の記事や同僚との会話で通じないと、
      **このアプリの中でしか使えない知識**になる。
      AIPPO だけの造語を使わない（憲章の Do Not Do）。
    */
    const known = [
      "プロンプト",
      "読者設定",
      "トーン設定",
      "ターゲット指定",
      "トーン指定",
      "ロール指定",
      "コンテキスト",
      "出力形式の指定",
      "追加質問",
      "比較",
    ];
    for (const one of recap) {
      expect(known, `「${one.name}」`).toContain(one.name);
    }
  });

  it("説明は1行に収める", () => {
    // 3つ並ぶので、1つが2行になると祝う画面が読み物になる
    for (const one of recap) {
      expect(one.body.length, `「${one.name}」の説明が長い`).toBeLessThanOrEqual(24);
    }
  });

  it("名前を言う画面は、使った場所にある", () => {
    /*
      受け取るのは最後だが、**名前が付くのは使った直後**。そこは
      変えていない。解説カードが `meta.silentSkill` で名前を持つ。

      並びも見る。プロンプトは1回目を送った直後、読者設定は読む人を
      足して結果を見た直後、トーン設定は伝え方で結果を見た直後。
    */
    const named = DAY1.steps
      .filter((step) => (step.meta as { silentSkill?: string } | undefined)?.silentSkill)
      .map((step) => (step.meta as { silentSkill: string }).silentSkill);

    expect(named).toEqual(["プロンプト", "読者設定", "トーン設定"]);
  });

  it("受け取る画面は、最後に1つだけ", () => {
    /*
      **ここが今回いちばん直したかったところ。** 増やすと、そのたびに
      学習が止まる画面が戻ってくる。
    */
    const recaps = DAY1.steps.filter(
      (step) => (step.meta as { recap?: unknown } | undefined)?.recap,
    );

    expect(recaps).toHaveLength(1);
    /*
      自分の文章を仕上げたあと、**完了画面より前**。何番目かは数で
      書かない——確認の1問のような短い回を後ろに足した日に、ここだけ
      古い数で止まる。
    */
    const order = DAY1.steps.map((step) => step.id);
    const at = order.indexOf(recaps[0].id);
    expect(at).toBeGreaterThan(order.indexOf("own_result"));
    expect(at).toBeLessThan(order.indexOf("completion"));
  });
});

describe("レッスンの中で、実際に出る", () => {
  /*
    部品が正しくても、画面が描いていなければ何も起きない。
    その回を開いて、そこに在ることを見る。
  */
  const openAt = (stepId: string) => {
    const index = DAY1.steps.findIndex((step) => step.id === stepId);
    const lesson: Lesson = { ...DAY1, steps: DAY1.steps.slice(index) };
    render(<LessonRunner lesson={lesson} onExit={() => {}} onOpenCourse={() => {}} />);
  };

  beforeEach(() => window.localStorage.clear());

  it("最後の画面で、3つまとめて受け取る", () => {
    openAt(recapStep.id);

    expect(screen.getByTestId("skill-recap-count")).toHaveTextContent("3 / 3");
  });

  it("名前を言う画面では、受け取る演出を出さない", () => {
    /*
      名前は言うが、祝わない。祝うのは最後の1回だけ——3回あると、
      そのたびに学習が止まる。
    */
    openAt("concept_prompt");

    expect(screen.queryByTestId("skill-recap")).not.toBeInTheDocument();
    // 名前そのものは、ちゃんと画面にある
    expect(screen.getByText("プロンプト")).toBeInTheDocument();
  });

  it("スタンプ台紙は、もう出てこない", () => {
    /*
      「覚えた」を押すと1枚挟まる台紙があった。技を1つずつ受け取る
      作りの部品なので、まとめて受け取る形にした時点で出番が無い。
      **部品ごと消してある**——教材のどこからも出なくなった画面を
      残すと、次に触る人が「どこから出るのか」を探すことになる。
    */
    openAt("concept_prompt");

    expect(screen.queryByTestId("skill-stamp-card")).not.toBeInTheDocument();
  });
});
