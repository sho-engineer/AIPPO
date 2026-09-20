/**
 * 学習マップ。
 *
 * 見張るのは5つ。
 *
 * - **「このレッスンをやれば必ず上がる」と書かない。** 上がる条件は
 *   2つあって、どちらも要る
 * - 診断で飛ばした段の技を、取ったことにしない
 * - 取っていない技には、取れるレッスンへの行き先が必ず付く
 * - 先の段の技は押せない（途中を飛ばして進めない）
 * - 「Fail」「できなかった」と読める言葉を置かない
 *
 * 段の数も名前も、ここで決めない——サーバーが返したものをそのまま
 * 並べる。だから検査もサーバーの応答の形で書く。
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LearningMapPage } from "../src/pages/LearningMapPage";
import type { LevelMap, MapLevel } from "../src/api/progression";

function level(over: Partial<MapLevel> & Pick<MapLevel, "number">): MapLevel {
  return {
    name: "頼む",
    description: "目的を伝えて、基本的な仕事をAIに頼める",
    status: "locked",
    skipped: false,
    skills: [],
    remaining: 0,
    has_challenge: false,
    challenge_open: false,
    ...over,
  };
}

/** 診断もまだの人。Lv.1 に居て、Lv.2 の技が2つとも未取得。 */
const FRESH: LevelMap = {
  current_level: 1,
  reached_by: "diagnosis",
  levels: [
    level({ number: 1, name: "試す", status: "current" }),
    level({
      number: 2,
      status: "locked",
      remaining: 2,
      has_challenge: true,
      skills: [
        {
          slug: "prompt",
          name: "プロンプト",
          one_line: "してほしいことをAIに伝える",
          status: "locked",
          lessons: ["rewrite_text"],
        },
        {
          slug: "context",
          name: "コンテキスト",
          one_line: "背景と目的を先に渡す",
          status: "locked",
          lessons: ["summarize_text"],
        },
      ],
    }),
    level({
      number: 3,
      name: "条件をつける",
      status: "locked",
      remaining: 1,
      has_challenge: true,
      skills: [
        {
          slug: "target",
          name: "ターゲット指定",
          one_line: "誰が読むのかをAIに伝える",
          status: "locked",
          lessons: ["rewrite_text"],
        },
      ],
    }),
  ],
  next: null,
};

function withNext(map: LevelMap): LevelMap {
  return {
    ...map,
    next: map.levels.find((one) => one.number === map.current_level + 1) ?? null,
  };
}

function serve(body: LevelMap | null) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (body === null) throw new Error("offline");
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

function open(map: LevelMap | null = withNext(FRESH), onSelectLesson = () => {}) {
  serve(map);
  return render(<LearningMapPage onSelectLesson={onSelectLesson} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("学習マップ", () => {
  it("サーバーが返した段を、そのまま全部並べる", async () => {
    open();

    await screen.findByTestId("map-level-1");
    expect(screen.getByTestId("map-level-2")).toBeInTheDocument();
    expect(screen.getByTestId("map-level-3")).toBeInTheDocument();
  });

  it("いまいる段に「いまここ」を出す", async () => {
    open();

    expect(await screen.findByTestId("map-here-1")).toBeInTheDocument();
    expect(screen.queryByTestId("map-here-2")).not.toBeInTheDocument();
  });

  it("次の段に、あと何個かを出す", async () => {
    open();

    expect(await screen.findByTestId("map-next-line")).toHaveTextContent(
      "必要な技があと2つです",
    );
  });

  it("「必ず上がる」とは言わない", async () => {
    open();

    await screen.findByTestId("map-levels");
    const text = document.body.textContent ?? "";
    for (const phrase of ["必ずレベルアップ", "必ずLevel Up", "必ず上がり"]) {
      expect(text).not.toContain(phrase);
    }
  });

  it("落ちた・できなかった、と読める言葉を置かない", async () => {
    open();

    await screen.findByTestId("map-levels");
    const text = document.body.textContent ?? "";
    for (const phrase of ["失敗", "不合格", "Fail", "できませんでした"]) {
      expect(text).not.toContain(phrase);
    }
  });

  it("取っていない技には、取れるレッスンの名前が付く", async () => {
    open();

    const node = await screen.findByTestId("map-skill-prompt");
    expect(node).toHaveTextContent("文章を分かりやすくする");
  });

  it("取っていない技を押すと、そのレッスンへ入る", async () => {
    const go = vi.fn();
    open(withNext(FRESH), go);

    await userEvent.click(await screen.findByTestId("map-skill-prompt"));

    expect(go).toHaveBeenCalledWith("rewrite_text");
  });

  it("先の段の技は押せない", async () => {
    /*
      いま Lv.1 なので、手を付けられるのは Lv.2 まで。Lv.3 の技を
      先に取れてしまうと、途中を飛ばして上がれる。
    */
    open();

    const far = await screen.findByTestId("map-skill-target");
    expect(far).toHaveAttribute("data-state", "locked");
    expect(far.tagName).not.toBe("BUTTON");
  });

  it("技がそろっていない段の挑戦は、あと何個かを言う", async () => {
    open();

    const node = await screen.findByTestId("map-challenge-2");
    expect(node).toHaveAttribute("data-open", "false");
    expect(node).toHaveTextContent("技があと2つ");
  });

  it("問題を用意していない段は「準備中」と出す", async () => {
    const map = withNext({
      ...FRESH,
      levels: FRESH.levels.map((one) =>
        one.number === 2 ? { ...one, has_challenge: false } : one,
      ),
    });
    open(map);

    expect(await screen.findByTestId("map-challenge-2")).toHaveTextContent(
      "準備中",
    );
  });

  it("技がそろうと、挑戦できると出す", async () => {
    const map = withNext({
      ...FRESH,
      levels: FRESH.levels.map((one) =>
        one.number === 2
          ? {
              ...one,
              remaining: 0,
              challenge_open: true,
              skills: one.skills.map((skill) => ({
                ...skill,
                status: "earned" as const,
              })),
            }
          : one,
      ),
    });
    open(map);

    const node = await screen.findByTestId("map-challenge-2");
    expect(node).toHaveAttribute("data-open", "true");
    expect(node).toHaveTextContent("挑戦できます");
  });

  describe("診断で飛ばした段", () => {
    const SKIPPED: LevelMap = withNext({
      current_level: 3,
      reached_by: "diagnosis",
      levels: [
        level({ number: 1, name: "試す", status: "done", skipped: true }),
        level({
          number: 2,
          status: "done",
          skipped: true,
          remaining: 2,
          has_challenge: true,
          skills: [
            {
              slug: "prompt",
              name: "プロンプト",
              one_line: "してほしいことをAIに伝える",
              status: "locked",
              lessons: ["rewrite_text"],
            },
            {
              slug: "context",
              name: "コンテキスト",
              one_line: "背景と目的を先に渡す",
              status: "locked",
              lessons: ["summarize_text"],
            },
          ],
        }),
        level({ number: 3, name: "条件をつける", status: "current" }),
      ],
      next: null,
    });

    it("通り過ぎた段と分かるように出す", async () => {
      open(SKIPPED);

      expect(await screen.findByTestId("map-skipped-2")).toHaveTextContent(
        "診断で通過",
      );
    });

    it("中の技を、取ったことにしない", async () => {
      /*
        **ここが混ざるのがいちばん困る。** 通り過ぎた印と習得済みを
        同じものにすると、使えるか分からない技が「習得済み」に並ぶ。
      */
      open(SKIPPED);

      expect(await screen.findByTestId("map-skill-prompt")).toHaveAttribute(
        "data-state",
        "open",
      );
    });

    it("通り過ぎた段に、残りの数を出さない", async () => {
      /*
        済んだはずの段に「技があと2つ」と出ると、まだ宿題が残って
        いるように読める。取っていないことは、技の一覧のほうが言う。
      */
      open(SKIPPED);

      expect(await screen.findByTestId("map-challenge-2")).toHaveTextContent(
        "通過ずみ",
      );
    });

    it("「習得済み」とは書かない", async () => {
      open(SKIPPED);

      await screen.findByTestId("map-skipped-2");
      expect(document.body.textContent ?? "").not.toContain("習得済み");
    });
  });

  describe("読み込めなかったとき", () => {
    it("行き止まりにせず、もう一度読める", async () => {
      open(null);

      expect(await screen.findByTestId("map-error")).toBeInTheDocument();
      expect(screen.getByTestId("map-retry")).toBeInTheDocument();
    });

    it("もう一度押すと、今度は出る", async () => {
      const fetching = serve(null);
      render(<LearningMapPage onSelectLesson={() => {}} />);
      await screen.findByTestId("map-retry");

      fetching.mockImplementation(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => withNext(FRESH),
          }) as Response,
      );
      await userEvent.click(screen.getByTestId("map-retry"));

      await waitFor(() =>
        expect(screen.getByTestId("map-levels")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("map-error")).not.toBeInTheDocument();
    });
  });
});
