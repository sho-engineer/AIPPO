/**
 * コースが複数あるときの扱い。
 *
 * 守るのは4つ。
 *
 *   1. 中身のあるコースを学ぶ側に選ぶ（並び順の先頭を鵜呑みにしない）
 *   2. これから増えるコースも一覧には出す
 *   3. ただし押させない
 *   4. 押せない理由をその場に書く
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CoursePage } from "../src/pages/CoursePage";
import { COURSE } from "../src/course/catalog";
import { currentCourse, loadCatalog, resetCatalog } from "../src/course/live";

/** 中身のあるコース1つと、まだ中身の無いコース2つ。 */
function catalog() {
  return {
    courses: [
      {
        id: "make_images",
        title: "AIで画像をつくる",
        description: "言葉でイメージを伝えて、ほしい絵に近づけていきます。",
        difficulty: "beginner",
        availability: "coming_soon",
        comingSoonMessage: "画像を作る仕組みを用意しています",
        // 中身はまだ配られない
        lessons: [
          { id: "image_first", number: 1, title: "はじめてAIで画像を作る", goal: "1枚作る", outcomes: [], tags: [], usesAi: true, availability: "coming_soon", steps: [] },
        ],
      },
      // サーバーから来たことが分かるよう、題を変えておく。
      // 同梱へ倒れたのか、正しく選べたのかを見分けるため
      { ...COURSE, title: `${COURSE.title}（サーバー版）`, availability: "available" },
      {
        id: "safe_at_work",
        title: "AIを安全に仕事で使う",
        description: "確かめるところを身につけます。",
        difficulty: "beginner",
        availability: "coming_soon",
        lessons: [],
      },
    ],
  };
}

function serve(body: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const json = url.includes("/catalog/")
      ? body
      : url.includes("/progress/")
        ? {
            lessons: [],
            completed_count: 0,
            in_progress_count: 0,
            skills: [],
            signed_in: false,
          }
        : url.includes("/bookmarks")
          ? { items: [] }
          : {};
    return { ok: true, status: 200, json: async () => json } as Response;
  });
}

beforeEach(() => {
  window.localStorage.clear();
  resetCatalog();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetCatalog();
});

describe("学ぶコースの選び方", () => {
  it("先頭が近日公開でも、中身のあるコースを選ぶ", async () => {
    /*
      並び順の先頭を無条件に採ると、近日公開のコースを一番上へ
      並べ替えた日に、教材が1本も無い画面になる。
    */
    serve(catalog());

    await loadCatalog();

    expect(currentCourse().id).toBe(COURSE.id);
    // 同梱へ倒れていない（サーバーの中身が使われている）こと
    expect(currentCourse().title).toBe(`${COURSE.title}（サーバー版）`);
    expect(currentCourse().lessons.length).toBeGreaterThan(0);
  });

  it("中身のあるコースが1つも無ければ、同梱のままにする", async () => {
    // 上書きして教材ゼロの画面を作らない
    serve({ courses: [{ id: "empty", title: "から", description: "", lessons: [] }] });

    await loadCatalog();

    expect(currentCourse().id).toBe(COURSE.id);
  });
});

describe("これから増えるコース", () => {
  const open = () => {
    render(<CoursePage onSelectLesson={() => {}} />);
  };

  it("一覧に出る", async () => {
    // 何がどれだけ増えるのかを先に見せる
    serve(catalog());
    open();

    const list = await screen.findByTestId("upcoming-courses");
    expect(within(list).getByText("AIで画像をつくる")).toBeInTheDocument();
    expect(within(list).getByText("AIを安全に仕事で使う")).toBeInTheDocument();
  });

  it("押せない", async () => {
    // 押せるのに何も起きないものを作らない
    serve(catalog());
    open();

    await waitFor(() =>
      expect(screen.getByTestId("course-make_images")).toBeDisabled(),
    );
    expect(screen.getByTestId("course-make_images")).toHaveAttribute(
      "data-availability",
      "coming_soon",
    );
  });

  it("押せない理由が、その場に書いてある", async () => {
    // 黙って無反応にしない
    serve(catalog());
    open();

    await waitFor(() =>
      expect(screen.getByTestId("course-make_images")).toHaveTextContent(
        "画像を作る仕組みを用意しています",
      ),
    );
  });

  it("いま学んでいるコースは、増える側に出さない", async () => {
    // 同じものが2か所に出ると、別のものだと読まれる
    serve(catalog());
    open();

    const list = await screen.findByTestId("upcoming-courses");
    expect(
      within(list).queryByText(`${COURSE.title}（サーバー版）`),
    ).not.toBeInTheDocument();
  });

  it("届いていないときは、何も出さない", async () => {
    // 同梱データで動いているとき。無いものを作って見せない
    serve({ courses: [] });
    open();

    await waitFor(() => expect(screen.getByTestId("lesson-search")).toBeInTheDocument());
    expect(screen.queryByTestId("upcoming-courses")).not.toBeInTheDocument();
  });
});
