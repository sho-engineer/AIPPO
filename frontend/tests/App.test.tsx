import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "../src/App";
import { COURSE } from "../src/course/catalog";
import { BRAND } from "../src/content/ui";

/**
 * タイトル → ホーム → コース一覧 → レッスン の通し導線。
 *
 * ここで確かめるのは「たどり着けること」だけ。
 * レッスンの中身は course のテストが受け持つ。
 */
describe("画面の行き来", () => {
  beforeEach(() => window.localStorage.clear());

  const start = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole("button", { name: "はじめる" })[0]);
  };

  /** 下タブの「コース」を押して一覧へ。 */
  const openCourseTab = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: "教材一覧" }));
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
      await screen.findByRole("heading", { name: "学習の進み具合" }),
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

  it("下タブの教材一覧へ移ると、全レッスンとFinal Challengeが並ぶ", async () => {
    const user = userEvent.setup();
    render(<App />);

    await start(user);
    await openCourseTab(user);

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

  it("コース一覧からレッスンを選べる", async () => {
    const user = userEvent.setup();
    render(<App />);

    await start(user);
    await openCourseTab(user);
    await user.click(await screen.findByTestId("lesson-rewrite_text"));

    // レッスンの最初の画面は、レッスンそのものの名前を見出しにする
    expect(
      await screen.findByRole("heading", {
        name: COURSE.lessons.find((l) => l.id === "rewrite_text")!.outcomeTitle,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Lesson 1")).toBeInTheDocument();
  });

  it("レッスンから一覧へ戻れる（行き止まりにしない）", async () => {
    const user = userEvent.setup();
    render(<App />);

    await start(user);
    await user.click(await screen.findByTestId("continue-lesson"));
    await user.click(await screen.findByRole("button", { name: "レッスン一覧へ" }));

    expect(
      await screen.findByRole("heading", { name: COURSE.title }),
    ).toBeInTheDocument();
  });

  it("どの画面でもポーが表示される", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByTestId("poe-avatar")).toBeInTheDocument();

    await start(user);
    expect(await screen.findByTestId("po-greeting")).toBeInTheDocument();

    await user.click(await screen.findByTestId("continue-lesson"));
    expect(await screen.findByTestId("po-avatar")).toBeInTheDocument();
  });

  it("下タブの未実装の行き先は押せない（黙って無反応にしない）", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    expect(await screen.findByRole("button", { name: /学習履歴/ })).toBeDisabled();
  });

  it("下タブから設定へ入り、ホームへ戻れる", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    await user.click(await screen.findByRole("button", { name: "設定" }));
    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ホーム" }));
    expect(
      await screen.findByRole("heading", { name: "学習の進み具合" }),
    ).toBeInTheDocument();
  });
});
