/**
 * 終えたあとの1行——いま取った技で、地図がどこまで進んだか。
 *
 * 見張るのは3つ。
 *
 * - **技が付くのを待ってから聞く。** 待たないと、たったいま取った技が
 *   数に入らない（完了画面で「あと2つ」、地図で「あと1つ」になる）
 * - いちばん上まで来た人に「次は Lv.6」を作らない
 * - 読めなかったときは、祝う場所で騒がない
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextLevelAfterLesson } from "../src/components/course/NextLevelAfterLesson";
import type { LevelMap } from "../src/api/progression";

const MAP: LevelMap = {
  current_level: 1,
  reached_by: "diagnosis",
  levels: [],
  next: {
    number: 2,
    name: "頼む",
    description: "目的を伝えて、基本的な仕事をAIに頼める",
    status: "locked",
    skipped: false,
    skills: [],
    remaining: 1,
    has_challenge: true,
    challenge_open: false,
  },
};

function serve(body: LevelMap | null) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (body === null) throw new Error("offline");
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("終えたあとの、次の段の1行", () => {
  it("増えた分が届いてから、あと何個かを出す", async () => {
    serve(MAP);
    render(
      <NextLevelAfterLesson onOpenMap={() => {}} award={{ xp: 10, skills: [] }} />,
    );

    const row = await screen.findByTestId("completion-next-level");
    expect(row).toHaveTextContent("次は Lv.2 頼む");
    expect(row).toHaveTextContent("あと1つ");
  });

  it("増えた分が届くまでは、聞きに行かない", async () => {
    /*
      **待たないと、たったいま取った技が数に入らない。** 完了画面で
      「あと2つ」と出してから、地図を開くと「あと1つ」になる。
    */
    const fetching = serve(MAP);
    render(<NextLevelAfterLesson onOpenMap={() => {}} award={null} />);

    await waitFor(() =>
      expect(
        screen.queryByTestId("completion-next-level"),
      ).not.toBeInTheDocument(),
    );
    expect(fetching).not.toHaveBeenCalled();
  });

  it("届いたら、そのとき聞きに行く", async () => {
    const fetching = serve(MAP);
    const { rerender } = render(
      <NextLevelAfterLesson onOpenMap={() => {}} award={null} />,
    );
    expect(fetching).not.toHaveBeenCalled();

    rerender(
      <NextLevelAfterLesson onOpenMap={() => {}} award={{ xp: 0, skills: [] }} />,
    );

    expect(await screen.findByTestId("completion-next-level")).toBeInTheDocument();
  });

  it("技がそろった回は、挑戦できると言う", async () => {
    serve({ ...MAP, next: { ...MAP.next!, remaining: 0 } });
    render(<NextLevelAfterLesson onOpenMap={() => {}} award={{}} />);

    expect(await screen.findByTestId("completion-next-level")).toHaveTextContent(
      "必要な技がそろいました。挑戦できます",
    );
  });

  it("いちばん上まで来た人には、何も出さない", async () => {
    serve({ ...MAP, next: null });
    render(<NextLevelAfterLesson onOpenMap={() => {}} award={{}} />);

    await waitFor(() =>
      expect(
        screen.queryByTestId("completion-next-level"),
      ).not.toBeInTheDocument(),
    );
    expect(document.body.textContent ?? "").not.toContain("Lv.6");
  });

  it("押すと、学習マップへ行く", async () => {
    serve(MAP);
    const go = vi.fn();
    render(<NextLevelAfterLesson onOpenMap={go} award={{}} />);

    await userEvent.click(await screen.findByTestId("completion-next-level"));

    expect(go).toHaveBeenCalled();
  });

  it("行き先が無いときは、押せない1行を置かない", async () => {
    serve(MAP);
    render(<NextLevelAfterLesson award={{}} />);

    await waitFor(() =>
      expect(
        screen.queryByTestId("completion-next-level"),
      ).not.toBeInTheDocument(),
    );
  });

  it("読めなかったときは、祝う場所で騒がない", async () => {
    serve(null);
    render(<NextLevelAfterLesson onOpenMap={() => {}} award={{}} />);

    await waitFor(() =>
      expect(
        screen.queryByTestId("completion-next-level"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
