/**
 * 章扉。
 *
 * Day1 は4つの段に分かれている（試す → 相手を決める → 言い方を変える
 * → 自分で使う）。段が変わったことは、これまで進み具合の細い帯にしか
 * 出ていなかった。帯は1本の線なので、**変わったことには気づけても、
 * 何に変わったのかは言っていない**——押した次の瞬間に別の話が始まる
 * ので、「気づいたら次の学習画面にいる」状態だった。
 *
 * 見張るのは4つ。
 *
 *   1. 4つの段の頭に、それぞれ1枚あること
 *   2. 絵が画面そのものであること（上に教材カードを重ねない）
 *   3. 押せば進むこと——ボタンでも、画面のどこを押しても
 *   4. 進み具合の帯が、章扉で見せた名前と同じ言葉を出すこと
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SectionTransition } from "../src/components/course/SectionTransition";
import { getLesson } from "../src/course/catalog";
import { missionStateOf } from "../src/course/missions";
import { teachingImage } from "../src/course/teachingImages";

const DAY1 = getLesson("rewrite_text")!;
const covers = DAY1.steps.filter((step) => step.type === "section_transition");

const IMAGE = {
  src: "/assets/teaching/day1_section_01.webp",
  alt: "章扉の絵の説明",
  visualType: "section" as const,
  width: 941,
  height: 1672,
};

describe("Day1 の段の分かれ方", () => {
  it("4つの段の頭に、それぞれ章扉が1枚ある", () => {
    expect(covers.map((step) => step.title)).toEqual([
      "まずは試してみよう",
      "相手を決めよう",
      "トーンを変えよう",
      "自分で仕上げよう",
    ]);
  });

  it("章扉のすぐあとに、その段の中身が始まる", () => {
    /*
      並びが依頼どおりであること。**章扉が飾りにならない**ように、
      次に来る画面まで含めて見る。

        ① 試す        → 完成イメージ
        ② 相手を決める → 条件をひとつ足す
        ③ 言い方       → 誰が読みますか
        ④ 自分で使う   → 自分の文章でも試す？
    */
    const order = DAY1.steps.map((step) => step.id);
    const after = (id: string) => order[order.indexOf(id) + 1];

    expect(after("section_1")).toBe("outcome_preview");
    expect(after("section_2")).toBe("add_condition");
    expect(after("section_3")).toBe("real_audience");
    expect(after("section_4")).toBe("real_task_intro");
  });

  it("進み具合の帯が、章扉で見せた名前と同じ言葉を出す", () => {
    /*
      共通の区切りの名前（試す・変える・深める・自分で使う）は、どの
      教材にも当たるように付けてある。当たるが、**その日に何をして
      いるのかは言っていない**。章扉で名前を見せた直後に帯が別の言葉を
      出すと、見たばかりの段の名前が画面から消える。
    */
    const missions = missionStateOf(DAY1, 0).missions;

    expect(missions).toHaveLength(4);
    expect(missions.map((mission) => mission.label)).toEqual([
      "試す",
      "相手",
      "言い方",
      "自分で",
    ]);
  });

  it("章扉には絵がある（4枚とも）", () => {
    for (const step of covers) {
      const image = teachingImage(DAY1.id, step.id);
      expect(image, `${step.id} に絵が無い`).not.toBeNull();
      expect(image!.visualType).toBe("section");
      // 縦長。画面いっぱいに出すので、実寸を書いておかないと箱が飛ぶ
      expect(image!.height!).toBeGreaterThan(image!.width!);
    }
  });

  it("章扉は、押すだけで進める（答えを持たない）", () => {
    // 教材の中身は載せない。読むものではなく、息継ぎとして置いている
    for (const step of covers) {
      expect(step.key, `${step.id} が答えを持っている`).toBeUndefined();
      expect(step.options, `${step.id} が選択肢を持っている`).toBeUndefined();
      expect(step.card, `${step.id} が解説カードを持っている`).toBeUndefined();
    }
  });
});

describe("章扉の画面", () => {
  it("絵が画面そのもの。上に教材カードを重ねない", () => {
    render(
      <SectionTransition title="まずは試してみよう" image={IMAGE} onContinue={() => {}} />,
    );

    const cover = screen.getByTestId("section-transition");

    expect(screen.getByRole("img")).toHaveAttribute("src", IMAGE.src);

    /*
      画面にあるのは、絵と「つづける」だけ。

      進み具合の帯・答えた内容の畳み・ポーの吹き出しは、どれも
      `StepShell` が持っている。ここをその枠に入れると、絵の中に
      焼き込まれた題が外へもう一度出て、同じ言葉が1画面に2回並ぶ
      （しかも絵に使える高さがその分だけ減る）。
    */
    expect(cover.querySelector("[data-testid='step-shell']")).toBeNull();
    expect(screen.queryByTestId("lesson-progress")).toBeNull();
    expect(screen.queryByTestId("po-avatar")).toBeNull();
    expect(screen.queryByTestId("concept-card")).toBeNull();
    // 押せるのは2つだけ——画面そのものと、「つづける」
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("送る先が無い（スクロールしない）", () => {
    /*
      1枚を見て次へ行くだけの画面。`overflow-hidden` で、画面の外へは
      出さない。ここが伸びると、下の「つづける」が画面から出ていく。
    */
    render(
      <SectionTransition title="まずは試してみよう" image={IMAGE} onContinue={() => {}} />,
    );

    expect(screen.getByTestId("section-transition").className).toContain(
      "overflow-hidden",
    );
  });

  it("「つづける」で進む", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <SectionTransition title="まずは試してみよう" image={IMAGE} onContinue={onContinue} />,
    );

    await user.click(screen.getByTestId("primary-action"));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("画面のどこを押しても進む", async () => {
    /*
      親指はふつう画面の下半分にあり、そこには絵しかない。下のボタンまで
      運ばせずに済む——ボタンは「押せる場所がどこか」を示す役目で残す。
    */
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <SectionTransition title="まずは試してみよう" image={IMAGE} onContinue={onContinue} />,
    );

    await user.click(screen.getByTestId("section-transition-tap"));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("絵が届かなくても、章の名前は読める", () => {
    // 通信が細い日に、白い画面と「つづける」だけにしない
    render(
      <SectionTransition title="まずは試してみよう" image={null} onContinue={() => {}} />,
    );

    expect(
      screen.getByRole("heading", { name: "まずは試してみよう" }),
    ).toBeVisible();
  });
});
