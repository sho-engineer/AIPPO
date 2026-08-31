/**
 * コースの画面の役割。
 *
 * ここが答えるのは「いまどこ / 次はこれ / あとこれだけ」の3つだけ。
 * 説明する場所ではない。
 *
 * 見張るのは2種類。
 *
 *   A. 出るべきものが出ていること（道のり・進み具合・1文の成果）
 *   B. **出さないと決めたものが戻ってきていないこと**
 *      詳細は消したのではなく、持ち主の画面へ移した。うっかり
 *      戻すと、また読み下さないと次の1本に辿り着けなくなる。
 */

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../src/auth/AuthContext";
import { CourseDetailPage } from "../src/pages/CourseDetailPage";
import { resetCatalog } from "../src/course/live";
import type { Course, Lesson } from "../src/course/types";

function lesson(id: string, number: number, stageKey: string, soon = false): Lesson {
  return {
    id,
    number,
    title: `${id}のだい`,
    goal: `${id} のねらい`,
    stageKey,
    outcomes: [`${id} でできること`],
    tags: [],
    usesAi: true,
    availability: soon ? "coming_soon" : "available",
    steps: [],
  };
}

const COURSE: Course = {
  id: "start",
  title: "AIスタートコース",
  description: "AIを仕事や日常で使う基本を、1日ひとつずつ身につけます。",
  outcome: "文章・要約・整理・比較・画像まで、AIの基本が身につきます。",
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

function reply(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

/** 進み具合だけを返す。ほかは届かない場所と同じにする。 */
function serve(completed: string[] = [], skills = 0) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(typeof input === "string" ? input : (input as Request).url);
    if (url.includes("/progress/")) {
      return reply({
        lessons: completed.map((id) => ({ lesson_id: id, completed: true })),
        completed_count: completed.length,
        in_progress_count: 0,
        skills: Array.from({ length: skills }, (_, index) => `skill-${index}`),
        xp: { total: 0, level: 1, level_name: "AI Starter", next_at: 100 },
        signed_in: true,
      });
    }
    throw new Error("offline");
  });
}

function show(onSelectLesson = () => {}) {
  render(
    <AuthProvider>
      <CourseDetailPage
        course={COURSE}
        onSelectLesson={onSelectLesson}
        onBack={() => {}}
      />
    </AuthProvider>,
  );
}

beforeEach(() => {
  resetCatalog();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  act(() => resetCatalog());
});

describe("出るもの", () => {
  it("道のりが主役として出る", async () => {
    serve();
    show();

    expect(await screen.findByTestId("course-outline")).toBeInTheDocument();
    expect(screen.getByTestId("outline-step-ask")).toHaveTextContent("STEP 1");
  });

  it("進み具合は、開けている本数で数える", async () => {
    // 準備中を分母に入れると、全部終えても 100% にならない
    serve(["d1", "d2"]);
    show();

    expect(await screen.findByTestId("course-progress-count")).toHaveTextContent("2 / 6");
  });

  it("準備中が何本あるかは、黙って隠さない", async () => {
    serve();
    show();

    expect(await screen.findByTestId("course-progress-line")).toHaveTextContent(
      "このあと2本",
    );
  });

  it("覚えたAI技の数を、進み具合の隣に出す", async () => {
    serve(["d1"], 5);
    show();

    expect(await screen.findByTestId("course-progress-skills")).toHaveTextContent(
      "AI技 5個習得",
    );
  });

  it("できるようになることは1文", async () => {
    serve();
    show();

    const outcome = await screen.findByTestId("course-outcome-line");
    expect(outcome).toHaveTextContent("AIの基本が身につきます");
  });
});

describe("出さないと決めたもの", () => {
  it("レッスンごとの詳しい説明を並べない", async () => {
    /*
      ねらい・完成イメージ・覚えるAI技・終えたらできること——
      持ち主はレッスンを開いた最初の画面。ここに並べると、
      始める前に8本ぶんを読み下すことになる。
    */
    serve();
    show();
    await screen.findByTestId("course-outline");

    expect(screen.queryByText("d1 でできること")).not.toBeInTheDocument();
    expect(screen.queryByText("完成イメージ")).not.toBeInTheDocument();
    expect(screen.queryByText("今日覚えるAI技")).not.toBeInTheDocument();
  });

  it("覚えた技の一覧を並べない（AI技図鑑が持つ）", async () => {
    serve(["d1", "d2"]);
    show();
    await screen.findByTestId("course-outline");

    expect(screen.queryByText("できるようになったこと")).not.toBeInTheDocument();
  });

  it("スタンプは道のりより下に置く", async () => {
    /*
      集める楽しさは残すが、コースの主役にはしない。上に置くと、
      学ぶことより集めることが目的に見えてくる。
    */
    serve();
    show();

    const outline = await screen.findByTestId("course-outline");
    const stamps = screen.getByTestId("path-progress");
    expect(outline.compareDocumentPosition(stamps)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("探す口も、道のりより下に置く", async () => {
    serve();
    show();

    const outline = await screen.findByTestId("course-outline");
    const search = screen.getByTestId("lesson-search");
    expect(outline.compareDocumentPosition(search)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

describe("探しているとき", () => {
  it("道のりと結果を、同時に並べない", async () => {
    /*
      同じレッスンが1画面に二度出ると、どちらが検索結果なのかが
      分からなくなる。
    */
    serve();
    const user = userEvent.setup();
    show();
    await screen.findByTestId("course-outline");

    await user.type(screen.getByTestId("lesson-search"), "d1のだい");

    expect(screen.queryByTestId("course-outline")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("lesson-d1")).toHaveLength(1);
  });

  it("やめれば道のりへ戻る", async () => {
    serve();
    const user = userEvent.setup();
    show();
    await screen.findByTestId("course-outline");

    const box = screen.getByTestId("lesson-search");
    await user.type(box, "あるはずのない言葉");
    await user.click(screen.getByTestId("lesson-search-clear"));

    expect(await screen.findByTestId("course-outline")).toBeInTheDocument();
  });
});
