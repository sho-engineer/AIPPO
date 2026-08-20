/**
 * 画面をまたいで使う部品。
 *
 * 見た目そのものは目で見て決めるので、ここでは固めない。
 * 守るのは、**見た目を変えても崩れてはいけないこと**だけ。
 *
 *   1. 押せないボタンは、本当に押せない（見た目だけ薄くしない）
 *   2. 選ばれていることが、色以外でも分かる
 *   3. ポーの言葉が読み上げに届く
 *   4. 取っておいたものが無いときに、行き止まりにしない
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChoiceButton } from "../src/components/aippo/ChoiceButton";
import { PoHero } from "../src/components/aippo/PoHero";
import { PrimaryButton } from "../src/components/aippo/PrimaryButton";
import { SavedPage } from "../src/pages/SavedPage";

describe("主導線のボタン", () => {
  it("押すと呼ばれる", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PrimaryButton onClick={onClick}>次へ</PrimaryButton>);

    await user.click(screen.getByRole("button", { name: "次へ" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("止めているときは、押しても呼ばれない", async () => {
    /*
      見た目を薄くするだけだと、押せてしまう。
      送信中に二度押しされると、そのぶん費用がかかる。
    */
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <PrimaryButton onClick={onClick} disabled>
        送っています…
      </PrimaryButton>,
    );

    await user.click(screen.getByRole("button", { name: "送っています…" }));

    expect(screen.getByRole("button")).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("選ぶ札", () => {
  it("選ばれていることが読み上げに届く", () => {
    render(
      <ChoiceButton label="上司" selected onSelect={() => {}} />,
    );

    expect(screen.getByRole("button", { name: /上司/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("選ばれていない札は、そうと分かる", () => {
    render(<ChoiceButton label="上司" selected={false} onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: /上司/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("押すと呼ばれる", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ChoiceButton label="上司" selected={false} onSelect={onSelect} />);

    await user.click(screen.getByRole("button", { name: /上司/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe("画面のいちばん上（ポーと見出し）", () => {
  it("見出しとポーの言葉が両方出る", () => {
    render(<PoHero title="こんにちは" message="一緒に進めましょう。" />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("こんにちは");
    expect(screen.getByTestId("po-hero-message")).toHaveTextContent(
      "一緒に進めましょう。",
    );
  });

  it("ポーの言葉は、変わったことが読み上げに届く", () => {
    // 画面が切り替わっても、聞いている人には吹き出しの変化しか手がかりが無い
    render(<PoHero title="こんにちは" message="一緒に進めましょう。" />);

    expect(screen.getByTestId("po-hero-message")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("言葉が無ければ、吹き出しは出ない", () => {
    // 空の吹き出しを置くと、何か消えたように見える
    render(<PoHero title="こんにちは" />);

    expect(screen.queryByTestId("po-hero-message")).not.toBeInTheDocument();
  });

  it("ポーの目印は変えない", () => {
    /*
      表情の切り替わりを見ている検査（E2E）が、この目印を指している。
      置き場所を変えても指し先は動かさない、と決めてある。
    */
    render(<PoHero title="こんにちは" emotion="celebrate" />);

    expect(screen.getByTestId("po-avatar")).toHaveAttribute(
      "data-emotion",
      "celebrate",
    );
  });
});

describe("保存したもの", () => {
  /**
   * 目印はサーバーが持っている（端末ではない）。
   * 登録した人が別の端末で開いても、同じものが並ぶようにするため。
   */
  function serverHas(lessonIds: string[]) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const json = url.includes("/bookmarks")
        ? { items: lessonIds.map((id) => ({ lesson_id: id })) }
        : url.includes("/progress")
          ? {
              lessons: [],
              completed_count: 0,
              in_progress_count: 0,
              skills: [],
              signed_in: false,
            }
          : {};
      return { ok: true, status: 200, json: async () => json } as Response;
    });
  }

  beforeEach(() => {
    window.localStorage.clear();
    serverHas([]);
  });

  const open = () =>
    render(
      <SavedPage
        onSelectLesson={() => {}}
        onOpenCourse={() => {}}
        onOpenAccount={() => {}}
      />,
    );

  it("何も無いときも、行き止まりにしない", async () => {
    /*
      「まだありません」で終える画面を作らない（憲章 原則 I）。
      付け方を書き、そのまま教材へ行けるようにしておく。
    */
    open();

    const empty = await screen.findByTestId("saved-empty");
    expect(empty).toHaveTextContent("まだ何も入っていません");
    expect(
      within(empty).getByRole("button", { name: "教材を見る" }),
    ).toBeInTheDocument();
  });

  it("目印を付けた教材が並ぶ", async () => {
    serverHas(["rewrite_text"]);

    open();

    expect(await screen.findByTestId("saved-list")).toBeInTheDocument();
    expect(screen.getByTestId("saved-lesson-rewrite_text")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-empty")).not.toBeInTheDocument();
  });
});
