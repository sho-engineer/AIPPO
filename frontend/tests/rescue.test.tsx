/**
 * 詰まったときに、次にできること。
 *
 * 見張るのは3つ。
 *
 *   1. **行き止まりにしないこと**（道が必ず1つ以上ある）
 *   2. **押せない道を出さないこと**（押しても何も起きないボタンを作らない）
 *   3. **学習者を評価しないこと**（「不正解」「失敗」と言わない）
 *
 * 3つ目が要るのは、評価されたと感じた人が次から自由入力を避けて
 * 例文だけを押すようになるため——「自分の仕事で使えるようになる」
 * という目的から、いちばん遠いところへ行く。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FailureRescue } from "../src/components/course/FailureRescue";
import { RESCUE_LEAD, rescuePaths, rescueTitle } from "../src/course/rescue";
import { getLesson } from "../src/course/catalog";
import type { Lesson, LessonStep } from "../src/course/types";

vi.mock("../src/api/lesson", async () => {
  const actual = await vi.importActual<typeof import("../src/api/lesson")>(
    "../src/api/lesson",
  );
  return { ...actual, sendLearningEvent: vi.fn(async () => {}) };
});

const lesson = getLesson("rewrite_text") as Lesson;
const step = lesson.steps.find((entry) => entry.type === "ai_generate") as LessonStep;

const po = { message: "もう一度やってみましょう", emotion: "hint", action: "retry" } as const;

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("次にできることの決め方", () => {
  it("必ず1つは道がある（行き止まりにしない）", () => {
    // 何も持っていない回でも、押せるものが残ること
    const paths = rescuePaths({
      kind: "failed",
      step,
      sampleText: undefined,
      hintsLeft: 0,
      editable: false,
    });

    expect(paths.length).toBeGreaterThan(0);
  });

  it("例文を持たない回に「例文で試す」を出さない", () => {
    /*
      出すと、押しても何も起きない。行き止まりを1つ増やすだけになる。
    */
    const paths = rescuePaths({
      kind: "failed",
      step,
      sampleText: undefined,
      hintsLeft: 2,
      editable: true,
    });

    expect(paths.map((path) => path.id)).not.toContain("sample");
  });

  it("ヒントを持たない回に「ヒントを見る」を出さない", () => {
    const paths = rescuePaths({
      kind: "failed",
      step,
      sampleText: "例文",
      hintsLeft: 0,
      editable: true,
    });

    expect(paths.map((path) => path.id)).not.toContain("hint");
  });

  it("書き直せる欄が無いなら「書き方を変える」を出さない", () => {
    const paths = rescuePaths({
      kind: "failed",
      step,
      sampleText: "例文",
      hintsLeft: 1,
      editable: false,
    });

    expect(paths.map((path) => path.id)).not.toContain("adjust");
  });

  it("届かなかっただけなら、押し直しを出す", () => {
    const paths = rescuePaths({
      kind: "failed",
      step,
      sampleText: "例文",
      hintsLeft: 1,
      editable: true,
    });

    expect(paths[0].id).toBe("retry");
  });

  it("**使えるものにならなかったときは、押し直しを出さない**", () => {
    /*
      同じ頼み方ではまた同じになる。押し直しを勧めると、3回押して
      同じ画面を見た人がそこでやめる。サーバーは既に作り直しを
      1回試したうえで、それでも駄目なときにこれを返している。
    */
    const paths = rescuePaths({
      kind: "unusable",
      step,
      sampleText: "例文",
      hintsLeft: 1,
      editable: true,
    });

    expect(paths.map((path) => path.id)).not.toContain("retry");
    expect(paths.length).toBeGreaterThan(0);
  });
});

describe("出す言葉", () => {
  it("学習者を評価しない", () => {
    /*
      起きたのは AI の出力のばらつきで、書いた人のせいではない。
    */
    const words = [
      "不正解",
      "失敗",
      "間違",
      "正しくありません",
      "適切ではありません",
      "無効",
    ];
    const copy = [
      RESCUE_LEAD,
      rescueTitle("failed"),
      rescueTitle("unusable"),
      ...rescuePaths({
        kind: "unusable",
        step,
        sampleText: "例文",
        hintsLeft: 1,
        editable: true,
      }).map((path) => path.label),
    ].join("\n");

    for (const word of words) expect(copy).not.toContain(word);
  });

  it("届かなかったのと、変わらなかったのを言い分ける", () => {
    expect(rescueTitle("failed")).not.toBe(rescueTitle("unusable"));
  });
});

describe("詰まったときの画面", () => {
  const paths = rescuePaths({
    kind: "unusable",
    step,
    sampleText: "例文",
    hintsLeft: 2,
    editable: true,
  });

  it("道が全部押せる形で出ている", () => {
    render(
      <FailureRescue kind="unusable" paths={paths} onChoose={() => {}} po={po} />,
    );

    for (const path of paths) {
      expect(screen.getByTestId(`rescue-${path.id}`)).toBeEnabled();
    }
  });

  it("押すと、その道が選ばれる", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();

    render(
      <FailureRescue kind="unusable" paths={paths} onChoose={onChoose} po={po} />,
    );
    await user.click(screen.getByTestId("rescue-sample"));

    expect(onChoose).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sample" }),
    );
  });

  it("道を畳んで隠さない", () => {
    /*
      隠すと、その人にとっての正解が見えないまま終わる。
      主ボタンは1つだが、残りも同じ画面に出しておく。
    */
    render(
      <FailureRescue kind="unusable" paths={paths} onChoose={() => {}} po={po} />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(paths.length);
  });
});
