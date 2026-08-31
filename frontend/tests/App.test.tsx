import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { COURSE } from "../src/course/catalog";
import { resetCatalog } from "../src/course/live";
import { BRAND } from "../src/content/ui";

/** サーバーから届く形の、2本目のコース（近日公開）。 */
const SECOND_COURSE = {
  id: "work_writing",
  title: "仕事の文章をAIで整える",
  description: "文章まわりの技をまとめて練習する。",
  availability: "coming_soon",
  lessons: [],
};

function catalogReply(courses: unknown[]): Response {
  return { ok: true, status: 200, json: async () => ({ courses }) } as Response;
}

/**
 * タイトル → ホーム → コース一覧 → レッスン の通し導線。
 *
 * ここで確かめるのは「たどり着けること」だけ。
 * レッスンの中身は course のテストが受け持つ。
 */
describe("画面の行き来", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "");
    resetCatalog();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCatalog();
  });

  const start = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole("button", { name: "はじめる" })[0]);
  };

  /** 下タブの「コース」を押して一覧へ。 */
  const openCourseTab = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: "コース" }));
  };

  /**
   * コース一覧から、学習中のコースの中身をひらく。
   *
   * コースは3段になっている（一覧 → 中身 → レッスン）。レッスンが
   * 並ぶのは2段目なので、そこまで進んでから見る。
   */
  const openCourseDetail = async (user: ReturnType<typeof userEvent.setup>) => {
    await openCourseTab(user);
    await user.click(await screen.findByTestId("current-course-open"));
  };

  it("タイトルから始まる", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: BRAND.headline }),
    ).toBeInTheDocument();
  });

  it("タイトルからホームへ進む", async () => {
    const user = userEvent.setup();
    render(<App />);

    await start(user);

    expect(
      await screen.findByRole("heading", { name: "学習の道のり" }),
    ).toBeInTheDocument();
  });

  it("ホームの「今日はここから」から、そのままレッスンへ入れる", async () => {
    const user = userEvent.setup();
    render(<App />);

    await start(user);
    /*
      ホームの主な入口はここ1つ。以前は横に並べたおすすめカードの
      1枚（recommend-*）だったが、次にやる1本を先頭に据える形に変えた。
      押す場所が1つなら、迷う余地も1つ分減る。
    */
    await user.click(await screen.findByTestId("continue-lesson"));

    // レッスンの最初の画面は、レッスンそのものの名前を見出しにする
    expect(
      await screen.findByRole("heading", {
        name: COURSE.lessons.find((l) => l.id === "rewrite_text")!.outcomeTitle,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Lesson 1")).toBeInTheDocument();
  });

  it("次にやる1本を「ほかの教材」に重ねて出さない", async () => {
    const user = userEvent.setup();
    render(<App />);

    await start(user);

    /*
      同じ教材が1画面に2回出ると、別のものだと思って両方を開く。
      次の1本は「今日はここから」に置くので、下の一覧からは外す。
    */
    await screen.findByTestId("continue-lesson");
    expect(screen.queryByTestId("recommend-rewrite_text")).not.toBeInTheDocument();

    // 始められる残り（いまは診断のみ）は、押せる入口として並ぶ
    expect(await screen.findByTestId("recommend-diagnosis")).toBeEnabled();
  });

  it("下タブのコースへ移ると、コースが並ぶ（レッスンは出さない）", async () => {
    /*
      ここは「どのコースにするか」を決める場所。開いた瞬間に
      9本のレッスンが出ると、決めるための材料が画面から消える。

      「すべてのコース」は、学習中のコース以外が1本以上あるときだけ
      出る（CoursePage.tsx）。同梱データはコース1本ぶんしか無いので、
      2本目が届く形でサーバーの応答を仕込む。
    */
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/catalog/")) {
        return Promise.resolve(catalogReply([COURSE, SECOND_COURSE]));
      }
      return Promise.reject(new Error(`未対応のfetch: ${url}`));
    });

    const user = userEvent.setup();
    render(<App />);

    await start(user);
    await openCourseTab(user);

    expect(await screen.findByTestId("all-courses")).toBeInTheDocument();
    expect(screen.queryByTestId("lesson-rewrite_text")).not.toBeInTheDocument();
  });

  it("コースの中へ入ると、全レッスンとFinal Challengeが並ぶ", async () => {
    const user = userEvent.setup();
    render(<App />);

    await start(user);
    await openCourseDetail(user);

    expect(
      await screen.findByRole("heading", { name: COURSE.title }),
    ).toBeInTheDocument();

    for (const lesson of COURSE.lessons) {
      expect(
        await screen.findByTestId(`lesson-${lesson.id}`),
        `${lesson.title} が一覧に無い`,
      ).toBeInTheDocument();
    }
  });

  it("ブラウザの戻るでも、アプリ内の1つ前の画面へ戻る", async () => {
    const user = userEvent.setup();
    render(<App />);

    await start(user);
    await openCourseDetail(user);
    expect(
      await screen.findByRole("heading", { name: COURSE.title }),
    ).toBeInTheDocument();

    act(() => window.history.back());

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "コース" })).toBeInTheDocument(),
    );
  });

  it("コースの中からレッスンを選べる", async () => {
    const user = userEvent.setup();
    render(<App />);

    await start(user);
    await openCourseDetail(user);
    await user.click(await screen.findByTestId("lesson-rewrite_text"));

    // レッスンの最初の画面は、レッスンそのものの名前を見出しにする
    expect(
      await screen.findByRole("heading", {
        name: COURSE.lessons.find((l) => l.id === "rewrite_text")!.outcomeTitle,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Lesson 1")).toBeInTheDocument();
  });

  it("レッスンの終了ボタンで、実際に開いた1つ前の画面へ戻る", async () => {
    const user = userEvent.setup();
    render(<App />);

    await start(user);
    await user.click(await screen.findByTestId("continue-lesson"));
    /*
      出口はヘッダーの「×」。前は右上の「レッスン一覧へ」という文字だった。
      ホームから直接開いたので、終了先もホームになる。
      ブラウザバックと上の終了ボタンで、同じ履歴を使う。
    */
    await user.click(await screen.findByTestId("lesson-exit"));

    expect(
      await screen.findByRole("heading", { name: "学習の道のり" }),
    ).toBeInTheDocument();
  });

  it("どの画面でもポーが表示される", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId("poe-avatar")).toBeInTheDocument();

    await start(user);
    // ホームでも同じ目印にそろえた（前は po-greeting という別名だった）
    expect(await screen.findByTestId("po-avatar")).toBeInTheDocument();

    await user.click(await screen.findByTestId("continue-lesson"));
    expect(await screen.findByTestId("po-avatar")).toBeInTheDocument();
  });

  it("下タブからマイ成果物へ入り、ホームへ戻れる", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    await user.click(await screen.findByRole("button", { name: /マイ成果物/ }));
    expect(
      await screen.findByRole("heading", { name: "マイ成果物" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ホーム" }));
    expect(
      await screen.findByRole("heading", { name: "学習の道のり" }),
    ).toBeInTheDocument();
  });

  it("下タブから外した学習記録へも、その他から入れる", async () => {
    /*
      タブから消すのと、行き先ごと消すのは別のこと。
      AI技とマイ成果物を入れるために外したが、探せば必ず
      見つかる場所を1つ残してある。
    */
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    await user.click(await screen.findByRole("button", { name: "その他" }));
    await user.click(await screen.findByRole("button", { name: /学習記録/ }));

    expect(
      await screen.findByRole("heading", { name: "学習記録" }),
    ).toBeInTheDocument();
  });

  it("下タブのその他から設定へ入り、ホームへ戻れる", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    await user.click(await screen.findByRole("button", { name: "その他" }));
    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ホーム" }));
    expect(
      await screen.findByRole("heading", { name: "学習の道のり" }),
    ).toBeInTheDocument();
  });
});

describe("下タブの出し入れ", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "");
    resetCatalog();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCatalog();
  });

  const start = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole("button", { name: "はじめる" })[0]);
  };

  /**
   * 下タブに無い画面（学習記録・あとで見る）でも、帯そのものは出す。
   * 帯ごと消すと**戻る道まで消える**。ただしどのタブも光らせない——
   * 光らせると、そのタブを押したのに別の画面が出ていることになる。
   */
  it("学習記録でも、下タブは出ている", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    await user.click(await screen.findByRole("button", { name: "その他" }));
    await user.click(await screen.findByRole("button", { name: /学習記録/ }));

    await screen.findByRole("heading", { name: "学習記録" });
    expect(screen.getByTestId("tab-bar")).toBeInTheDocument();
  });

  it("学習記録では、どのタブも光らない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    await user.click(await screen.findByRole("button", { name: "その他" }));
    await user.click(await screen.findByRole("button", { name: /学習記録/ }));
    await screen.findByRole("heading", { name: "学習記録" });

    const lit = within(screen.getByTestId("tab-bar"))
      .getAllByRole("button")
      .filter((tab) => tab.getAttribute("aria-current") === "page");
    expect(lit).toHaveLength(0);
  });

  it("タイトル画面には、下タブを出さない", async () => {
    // 「押す場所は1つ」が売りの画面。抜け道を並べない
    render(<App />);

    expect(screen.queryByTestId("tab-bar")).not.toBeInTheDocument();
  });

  /**
   * ロゴを押したらホームへ。
   *
   * どのアプリでも上のロゴは「最初の画面へ戻る印」として使われていて、
   * 迷ったときに人はまずそこを押す。押しても何も起きないと、
   * その画面から出る方法を探し直すことになる。
   *
   * 奥の画面（コースの中身）から見るのは、そこが**下タブの光る場所と
   * 画面が食い違う**唯一の並びだから。下タブの「ホーム」で戻れるから
   * よいのではなく、押した場所に応えることを確かめる。
   */
  it("帯のロゴを押すと、ホームへ戻る", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    await user.click(await screen.findByRole("button", { name: "その他" }));
    await screen.findByRole("heading", { name: "設定" });

    await user.click(await screen.findByTestId("brand-home"));

    expect(
      await screen.findByRole("heading", { name: "学習の道のり" }),
    ).toBeInTheDocument();
  });

  /**
   * 読み上げでも、それが「ホームへ戻る」だと分かること。
   *
   * ロゴは画像なので、名前を付けないと読み上げは「ボタン」としか
   * 言わない。押す前に行き先が分からないボタンは、押されない。
   */
  it("ロゴのボタンには、行き先の名前が付いている", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    expect(
      await screen.findByRole("button", { name: "ホームへ戻る" }),
    ).toBeInTheDocument();
  });
});
