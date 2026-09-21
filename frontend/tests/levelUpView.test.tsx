/**
 * 段が上がった瞬間の一枚。
 *
 * 見張るのは4つ。
 *
 * - **番号だけで終わらない。** 何ができる段になったのかを言う
 * - 段の名前も説明も、画面に写しを持たない（サーバーが返したものを出す）
 * - 祝って終わりにしない。次の段と「あと何個」を続けて出す
 * - いちばん上まで来た人に「次は Lv.6」を作らない
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LevelUpView } from "../src/components/course/diagnosis/LevelUpView";
import type { ChallengeVerdict } from "../src/api/progression";

function verdictOf(over: Partial<ChallengeVerdict> = {}): ChallengeVerdict {
  return {
    passed: true,
    missing: [],
    missing_labels: [],
    level_up: true,
    current_level: 2,
    remaining_skills: 0,
    reached: {
      number: 2,
      name: "頼む",
      description: "目的を伝えて、基本的な仕事をAIに頼める",
    },
    next: { number: 3, name: "条件をつける", remaining: 4, has_challenge: true },
    ...over,
  };
}

function open(over: Partial<ChallengeVerdict> = {}) {
  return render(<LevelUpView verdict={verdictOf(over)} onClose={() => {}} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("段が上がった一枚", () => {
  it("番号と名前を、一続きで出す", () => {
    open();

    expect(screen.getByTestId("levelup-name")).toHaveTextContent(
      "Lv.2 頼む になりました",
    );
  });

  it("何ができる段になったのかを言う", () => {
    /*
      **番号だけで終わらせない。** 「Lv.2」は順番を言うだけで、
      増えたのが数字だけになる。
    */
    open();

    expect(screen.getByTestId("levelup-can")).toHaveTextContent(
      "目的を伝えて、基本的な仕事をAIに頼める",
    );
  });

  it("段の名前を、画面が決めていない", () => {
    /*
      サーバーが返した名前をそのまま出すこと。画面に写しを持つと、
      段を足した日に片方だけ古くなる。
    */
    open({
      reached: { number: 2, name: "まだ無い名前", description: "まだ無い説明" },
    });

    expect(screen.getByTestId("levelup-name")).toHaveTextContent("まだ無い名前");
    expect(screen.getByTestId("levelup-can")).toHaveTextContent("まだ無い説明");
  });

  it("次の段と、あと何個かを続けて出す", () => {
    open();

    const next = screen.getByTestId("levelup-next");
    expect(next).toHaveTextContent("Lv.3 条件をつける");
    expect(next).toHaveTextContent("あと4つ");
  });

  it("技がそろっている次の段では、そろったと言う", () => {
    open({
      next: { number: 3, name: "条件をつける", remaining: 0, has_challenge: true },
    });

    expect(screen.getByTestId("levelup-next")).toHaveTextContent(
      "必要な技はそろいました",
    );
  });

  it("いちばん上まで来た人に、次の段を作らない", () => {
    open({ current_level: 5, reached: {
      number: 5,
      name: "組み立てる",
      description: "AIを仕事の流れに組み込み、複数のステップを組み立てて使える",
    }, next: null });

    expect(screen.queryByTestId("levelup-next")).not.toBeInTheDocument();
    expect(screen.getByTestId("levelup-top")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain("Lv.6");
  });

  it("行き止まりにしない（学習マップへ出られる）", () => {
    open();

    expect(screen.getByTestId("challenge-done")).toHaveTextContent(
      "学習マップへ",
    );
  });

  it("点数も、競う言葉も出さない", () => {
    open();

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d+\s*点/);
    for (const phrase of ["ランキング", "順位", "平均", "全国"]) {
      expect(text).not.toContain(phrase);
    }
  });

  it("サーバーが段の中身を返さなくても、画面は出る", () => {
    /*
      古い応答や、途中で欠けた回。**祝いが消えるより、素っ気なくても
      出るほうがよい**——押す先（学習マップへ）は残る。
    */
    open({ reached: null, next: null });

    expect(screen.getByTestId("levelup-name")).toHaveTextContent(
      "Lv.2 になりました",
    );
    expect(screen.getByTestId("challenge-done")).toBeInTheDocument();
  });
});
