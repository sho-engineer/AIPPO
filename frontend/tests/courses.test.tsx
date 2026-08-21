/**
 * コースが複数あるときの扱い。
 *
 * 守るのは5つ。
 *
 *   1. 中身のあるコースを学ぶ側に選ぶ（並び順の先頭を鵜呑みにしない）
 *   2. すべてのコースが同じ形で並ぶ
 *   3. 近日公開のものは押させない
 *   4. 押せない理由をその場に書く
 *   5. 続きに戻る1本が、先頭に別の形で出る
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

describe("コース一覧", () => {
  const open = () => {
    render(
      <CoursePage onOpenCourse={() => {}} onSelectLesson={() => {}} />,
    );
  };

  it("すべてのコースが並ぶ", async () => {
    // 何がどれだけあるのかを、選ぶ前に見せる
    serve(catalog());
    open();

    const list = await screen.findByTestId("all-courses");
    expect(within(list).getByText("AIで画像をつくる")).toBeInTheDocument();
    expect(within(list).getByText("AIを安全に仕事で使う")).toBeInTheDocument();
  });

  it("学習中のコースは、下の一覧に重ねて出さない", async () => {
    /*
      同じ題が1画面に2回出ると、上と下が別のものに見える。
      上に出ているものは上で完結させて、下は
      「まだ手を付けていないもの」だけにする。
    */
    serve(catalog());
    open();

    const list = await screen.findByTestId("all-courses");
    expect(
      within(list).queryByText(`${COURSE.title}（サーバー版）`),
    ).not.toBeInTheDocument();
    // 上には出ている
    expect(screen.getByTestId("current-course-open")).toHaveTextContent(
      `${COURSE.title}（サーバー版）`,
    );
  });

  it("続きに戻る1本が、先頭に別の形で出る", async () => {
    /*
      この画面を開く人がいちばん多く求めているのは、探すことではなく
      続きに戻ること。同じ形で7つ並べると、毎回自分の1本を探し直す。
    */
    serve(catalog());
    open();

    await waitFor(() =>
      expect(screen.getByTestId("current-course-continue")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("current-course-count")).toHaveTextContent("/");
  });

  it("近日公開のコースは押せない", async () => {
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

  it("いきなりレッスンを並べない", async () => {
    /*
      ここは「どのコースにするか」を決める場所。開いた瞬間に
      9本のレッスンが出ると、決めるための材料が画面から消える。
      レッスンが並ぶのは、コースを選んだ次の段。
    */
    serve(catalog());
    open();

    await screen.findByTestId("all-courses");
    expect(screen.queryByTestId("lesson-search")).not.toBeInTheDocument();
    expect(screen.queryByTestId("lesson-rewrite_text")).not.toBeInTheDocument();
  });

  it("届いていないときは、学習中の1本だけ出す", async () => {
    /*
      同梱データで動いているとき。他のコースは知らないので、
      空の枠を作らず、節ごと出さない。
    */
    serve({ courses: [] });
    open();

    await waitFor(() =>
      expect(screen.getByTestId("current-course-open")).toHaveTextContent(
        COURSE.title,
      ),
    );
    expect(screen.queryByTestId("all-courses")).not.toBeInTheDocument();
  });
});
