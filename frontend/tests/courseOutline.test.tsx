/**
 * コースの道のり（STEP と Checkpoint）。
 *
 * この画面が答えるのは3つだけ。
 *
 *     いまどこ / 次はこれ / あとこれだけ
 *
 * 見張るのは、それが**壊れる形**のほう。
 *
 *   1. 現在地チェックを Day として数えないこと
 *      （数えると、受けなかった人の進み具合が最初から欠ける）
 *   2. 準備中を分母に入れないこと
 *      （入れると、どれだけ進めても 100% にならない）
 *   3. 次に進む1本が、ちょうど1本であること
 *   4. まだの節目に「終わりました」を先に出さないこと
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CourseOutline } from "../src/components/course/CourseOutline";
import { courseOutline, nextLesson } from "../src/course/outline";
import type { Course, Lesson } from "../src/course/types";

function lesson(
  id: string,
  number: number,
  stageKey: string,
  soon = false,
): Lesson {
  return {
    id,
    number,
    title: id,
    goal: `${id} のねらい`,
    stageKey,
    outcomes: [],
    tags: [],
    usesAi: true,
    availability: soon ? "coming_soon" : "available",
    steps: [],
  };
}

/** 現在地チェック1本＋STEP3つ（3本 / 3本 / 2本、最後は準備中）。 */
const COURSE: Course = {
  id: "start",
  title: "AIスタートコース",
  description: "短い説明",
  outcome: "文章から画像まで、AIの基本が身につきます。",
  stages: [
    { key: "orientation", title: "現在地チェック", lessonIds: ["diagnosis"] },
    { key: "ask", title: "AIに頼んでみる", lessonIds: ["d1", "d2", "d3"] },
    { key: "think", title: "AIと考える", lessonIds: ["d4", "d5", "d6"] },
    { key: "create", title: "AIで作る", lessonIds: ["d7", "d8"] },
  ],
  lessons: [
    lesson("diagnosis", 0, "orientation"),
    lesson("d1", 1, "ask"),
    lesson("d2", 2, "ask"),
    lesson("d3", 3, "ask"),
    lesson("d4", 4, "think"),
    lesson("d5", 5, "think"),
    lesson("d6", 6, "think"),
    lesson("d7", 7, "create", true),
    lesson("d8", 8, "create", true),
  ],
};

function show(completed: string[] = []) {
  const outline = courseOutline(COURSE);
  render(
    <CourseOutline
      outline={outline}
      completed={completed}
      currentId={nextLesson(outline, completed)?.id ?? null}
      bookmarked={() => false}
      onSelect={() => {}}
    />,
  );
  return outline;
}

describe("道のりの組み立て", () => {
  it("現在地チェックは STEP に数えない", () => {
    const outline = courseOutline(COURSE);

    expect(outline.orientation.map((one) => one.id)).toEqual(["diagnosis"]);
    expect(outline.steps.map((step) => step.number)).toEqual([1, 2, 3]);
    expect(outline.steps.map((step) => step.title)).toEqual([
      "AIに頼んでみる",
      "AIと考える",
      "AIで作る",
    ]);
  });

  it("Day の数には、現在地チェックが入らない", () => {
    const outline = courseOutline(COURSE);

    expect(outline.days).toHaveLength(8);
    expect(outline.days.some((one) => one.id === "diagnosis")).toBe(false);
  });

  it("分母に準備中を入れない", () => {
    /*
      始めようのないもので割ると、どれだけ進めても 100% にならない。
      何本あるかは別に伝える（黙って隠すのとは違う）。
    */
    const outline = courseOutline(COURSE);

    expect(outline.startableDays).toHaveLength(6);
    expect(outline.comingSoonDays).toBe(2);
  });

  it("束が来ていなくても、道のりは出る", () => {
    // 古い応答・これから増えるコース。束が無いことと壊れていることは違う
    const outline = courseOutline({ ...COURSE, stages: undefined });

    expect(outline.steps).toHaveLength(1);
    expect(outline.steps[0].lessons).toHaveLength(COURSE.lessons.length);
  });

  it("束が指しているのに手元に無い教材は、空の行にしない", () => {
    const outline = courseOutline({
      ...COURSE,
      lessons: COURSE.lessons.filter((one) => !one.id.startsWith("d7")),
      stages: [
        ...COURSE.stages!.slice(0, 3),
        { key: "create", title: "AIで作る", lessonIds: ["d7", "d8"] },
      ],
    });

    const create = outline.steps.find((step) => step.key === "create")!;
    expect(create.lessons.map((one) => one.id)).toEqual(["d8"]);
  });

  it("同じ名前の束が離れて出てきたら、別の束として扱う", () => {
    /*
      黙って1つにまとめると、あいだの教材を飛び越える束ができ、
      画面には「連続していないのに1つ」という読めない形で出る。
    */
    const outline = courseOutline({
      ...COURSE,
      stages: [
        { key: "ask", title: "AIに頼んでみる", lessonIds: ["d1"] },
        { key: "think", title: "AIと考える", lessonIds: ["d4"] },
        { key: "ask", title: "AIに頼んでみる", lessonIds: ["d2"] },
      ],
    });

    expect(outline.steps).toHaveLength(3);
    expect(outline.steps.map((step) => step.number)).toEqual([1, 2, 3]);
  });
});

describe("次に進む1本", () => {
  it("何もしていない人には、現在地チェック", () => {
    const outline = courseOutline(COURSE);

    expect(nextLesson(outline, [])?.id).toBe("diagnosis");
  });

  it("チェックを終えたら Day1", () => {
    const outline = courseOutline(COURSE);

    expect(nextLesson(outline, ["diagnosis"])?.id).toBe("d1");
  });

  it("準備中は「次」にしない", () => {
    // 押せないものを次として示すと、そこで行き止まりになる
    const outline = courseOutline(COURSE);
    const done = ["diagnosis", "d1", "d2", "d3", "d4", "d5", "d6"];

    expect(nextLesson(outline, done)).toBeNull();
  });
});

describe("画面に出るもの", () => {
  it("STEP の番号と名前を出す", () => {
    show();

    const step = screen.getByTestId("outline-step-ask");
    expect(step).toHaveTextContent("STEP 1");
    expect(step).toHaveTextContent("AIに頼んでみる");
  });

  it("現在地チェックには Day 番号を出さない", () => {
    show();

    const row = screen.getByTestId("lesson-diagnosis");
    expect(row).toHaveTextContent("はじめに");
    expect(row).not.toHaveTextContent("Day");
  });

  it("節目は STEP のあいだにだけ置く（最後は修了）", () => {
    show();

    // STEP が3つなら、あいだの節目は2つ
    expect(screen.getAllByTestId("outline-checkpoint")).toHaveLength(2);
    expect(screen.getByTestId("outline-complete")).toBeInTheDocument();
  });

  it("まだの節目に「終わりました」を先に出さない", () => {
    show(["diagnosis", "d1"]);

    const first = screen.getAllByTestId("outline-checkpoint")[0];
    expect(first).toHaveAttribute("data-reached", "false");
    expect(first).toHaveTextContent("あと2本");
  });

  it("通り過ぎた節目は、通り過ぎたと言う", () => {
    show(["diagnosis", "d1", "d2", "d3"]);

    const first = screen.getAllByTestId("outline-checkpoint")[0];
    expect(first).toHaveAttribute("data-reached", "true");
    expect(first).toHaveTextContent("ここまで終わりました");
  });

  it("準備中だけが残っている STEP は、終わった扱いにしない", () => {
    /*
      押せないものを「終わった」に数えると、やっていないことを
      やったことにしてしまう。修了も同じ。
    */
    show(["diagnosis", "d1", "d2", "d3", "d4", "d5", "d6"]);

    const create = screen.getByTestId("outline-step-create");
    expect(within(create).getByTestId("lesson-d7")).toHaveAttribute(
      "data-availability",
      "coming_soon",
    );
  });

  it("いまの1本は、ちょうど1つ", () => {
    show(["diagnosis"]);

    const current = screen
      .getAllByTestId(/^lesson-/)
      .filter((row) => row.getAttribute("data-status") === "current");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("data-testid", "lesson-d1");
  });
});
