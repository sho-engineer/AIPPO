/**
 * 飛ばした解説の見返し。
 *
 * いちばん大事なのは「**別の例で**出ること」。
 * 同じ文をもう一度出すなら、見返す意味が無い（さっき飛ばしたものと同じ）。
 *
 * もう1つは、AIを呼ばないこと。見返すたびに費用がかかる作りにしない。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewCards, withReviewExample } from "../src/components/course/ReviewCards";
import { COURSE } from "../src/course/catalog";
import { loadReviewItems, rememberForReview } from "../src/course/review";
import { findStep } from "../src/course/engine";
import type { ConceptCard } from "../src/course/types";

/** Lesson 1 の解説カードのうち、別の例を持っているもの。 */
function firstConceptStep() {
  const lesson = COURSE.lessons.find((entry) => entry.id === "rewrite_text")!;
  const step = lesson.steps.find((entry) => entry.card?.reviewExample)!;
  return { lesson, step };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("別の例に差し替える", () => {
  it("別の例があれば、そちらを使う", () => {
    const card: ConceptCard = {
      title: "誰向けかを伝える",
      body: "もとの説明",
      visual: "before_after",
      before: "もとのBefore",
      after: "もとのAfter",
      reviewExample: {
        body: "別の説明",
        before: "別のBefore",
        after: "別のAfter",
      },
    };

    expect(withReviewExample(card)).toMatchObject({
      body: "別の説明",
      before: "別のBefore",
      after: "別のAfter",
    });
  });

  it("別の例が無ければ、元のまま出す", () => {
    // 無理に差し替えない。持っていない教材でも壊れないこと
    const card: ConceptCard = {
      title: "題",
      body: "もとの説明",
      visual: "text",
    };

    expect(withReviewExample(card).body).toBe("もとの説明");
  });

  it("一部だけ持っていても、残りは元を使う", () => {
    const card: ConceptCard = {
      title: "題",
      body: "もとの説明",
      visual: "three_points",
      points: ["あ", "い"],
      reviewExample: { points: ["う", "え"] },
    };

    const shown = withReviewExample(card);
    expect(shown.body).toBe("もとの説明");
    expect(shown.points).toEqual(["う", "え"]);
  });
});

describe("画面", () => {
  it("飛ばしたものが無ければ、節ごと出さない", () => {
    // 空の見出しを残さない
    render(<ReviewCards course={COURSE} />);

    expect(screen.queryByTestId("review-cards")).not.toBeInTheDocument();
  });

  it("飛ばした解説が並ぶ", () => {
    const { lesson, step } = firstConceptStep();
    rememberForReview({
      lessonId: lesson.id,
      stepId: step.id,
      reason: "concept_skipped",
    });

    render(<ReviewCards course={COURSE} />);

    expect(screen.getByTestId("review-cards")).toBeInTheDocument();
    expect(screen.getByTestId(`review-${step.id}`)).toHaveTextContent(step.card!.title);
  });

  it("開くと、元の文ではなく別の例が出る", async () => {
    /*
      ここが要。同じ文を出すなら見返す意味が無い。
    */
    const user = userEvent.setup();
    const { lesson, step } = firstConceptStep();
    const card = step.card!;
    rememberForReview({
      lessonId: lesson.id,
      stepId: step.id,
      reason: "concept_skipped",
    });

    render(<ReviewCards course={COURSE} />);
    await user.click(screen.getByTestId(`review-${step.id}`));

    const shown = screen.getByTestId("concept-card");
    expect(shown).toHaveTextContent(card.reviewExample!.body!);
    expect(shown).not.toHaveTextContent(card.body);
  });

  it("「分かった」で控えから外れる", async () => {
    // 外さないと、一度見返したものが残り続ける
    const user = userEvent.setup();
    const { lesson, step } = firstConceptStep();
    rememberForReview({
      lessonId: lesson.id,
      stepId: step.id,
      reason: "concept_skipped",
    });

    render(<ReviewCards course={COURSE} />);
    await user.click(screen.getByTestId(`review-${step.id}`));
    await user.click(screen.getByTestId(`review-done-${step.id}`));

    expect(loadReviewItems()).toHaveLength(0);
    expect(screen.queryByTestId("review-cards")).not.toBeInTheDocument();
  });

  it("AIを呼ばない", async () => {
    /*
      見返すたびに費用がかかる作りにしない。
      その場で例を作らせると、出来がその時々で変わって
      教材として確かめられなくなる。
    */
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    const { lesson, step } = firstConceptStep();
    rememberForReview({
      lessonId: lesson.id,
      stepId: step.id,
      reason: "concept_skipped",
    });

    render(<ReviewCards course={COURSE} />);
    await user.click(screen.getByTestId(`review-${step.id}`));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("教材から消えた回は、黙って落とす", () => {
    // 管理画面で差し替えたときなど。引けないものを出さない
    rememberForReview({
      lessonId: "rewrite_text",
      stepId: "もう無いステップ",
      reason: "concept_skipped",
    });

    render(<ReviewCards course={COURSE} />);

    expect(screen.queryByTestId("review-cards")).not.toBeInTheDocument();
  });

  it("自分の課題を飛ばした分は、ここに出さない", () => {
    /*
      ここは解説の見返し。自分の課題は「もう一度やる」ものなので、
      同じ場所に混ぜると、押した先で別のことが起きる。
    */
    const { lesson } = firstConceptStep();
    rememberForReview({
      lessonId: lesson.id,
      stepId: findStep(lesson, "real_task")?.id ?? "real_task",
      reason: "real_task_skipped",
    });

    render(<ReviewCards course={COURSE} />);

    expect(screen.queryByTestId("review-cards")).not.toBeInTheDocument();
  });
});
