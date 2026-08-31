/**
 * 学習記録。**何を学んだか**の画面。
 *
 * 前はこの1枚に、学んだこと・できること・作ったものが混ざっていた。
 * 作ったものを取りに来た人が、教材の一覧と回数の数字を通り過ぎることに
 * なる。分けたうえで、隣の2つへの入口をここにも置いてある——
 * 分けたせいで「前はここにあったもの」が行方不明になるほうが困る。
 *
 * ここで守るのは4つ。
 *
 *   1. どの教材をどこまでやったかが並ぶこと
 *   2. 今日あと何回使えるかが、上限に当たる前に見えること
 *   3. AI技・マイ成果物への入口があること
 *   4. まだ何も無い人にも、次にすることが分かること
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecordPage } from "../src/pages/RecordPage";

const SESSION = {
  id: "s1",
  lesson_id: "rewrite_text",
  completed: true,
  current_step: "completion",
  attempt_count: 3,
  started_at: "2026-08-18T15:00:00+09:00",
  updated_at: "2026-08-18T15:03:00+09:00",
};

const FULL = {
  artifacts: [],
  sessions: [SESSION],
  ai_quota: { limit: 10, used: 3, remaining: 7 },
};

function serve(body: unknown, ok = true) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (!ok) throw new Error("offline");
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

function show(props: Partial<Parameters<typeof RecordPage>[0]> = {}) {
  return render(
    <RecordPage
      onSelectLesson={() => {}}
      onOpenCourse={() => {}}
      onOpenSkills={() => {}}
      onOpenWorks={() => {}}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("取り組んだ教材", () => {
  it("並び、押すともう一度開ける", async () => {
    // 見返して「もう一度」と思ったときに、探し直させない
    serve(FULL);
    const open = vi.fn();
    show({ onSelectLesson: open });

    await userEvent.click(await screen.findByTestId("record-session-rewrite_text"));

    expect(open).toHaveBeenCalledWith("rewrite_text");
  });
});

describe("隣の画面への入口", () => {
  /*
    3つの画面で言っていることを分けた。分けたぶん、
    「前はここにあったもの」を探せる道を残す。
  */
  it("AI技へ行ける", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    serve(FULL);
    show({ onOpenSkills: open });

    await user.click(await screen.findByTestId("record-open-skills"));

    expect(open).toHaveBeenCalledTimes(1);
  });

  it("マイ成果物へ行ける", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    serve(FULL);
    show({ onOpenWorks: open });

    await user.click(await screen.findByTestId("record-open-works"));

    expect(open).toHaveBeenCalledTimes(1);
  });

  it("役割の違いが、行き先の隣に書いてある", async () => {
    // 名前だけだと、どちらに何があるのか押すまで分からない
    serve(FULL);
    show();

    expect(await screen.findByTestId("record-open-skills")).toHaveTextContent(
      "いま自分にできること",
    );
    expect(screen.getByTestId("record-open-works")).toHaveTextContent(
      "AIと作ったもの",
    );
  });
});

describe("今日つかえる回数", () => {
  it("上限に当たる前に、残りが見える", async () => {
    serve(FULL);
    show();

    const quota = await screen.findByTestId("ai-quota");

    expect(quota).toHaveTextContent("あと7回");
    expect(quota).toHaveTextContent("10回のうち3回");
  });

  it("上限を外しているときは、数を出さない", async () => {
    // 0 を出すと「残り0回」と読めてしまい、逆の意味になる
    serve({ ...FULL, ai_quota: { limit: null, used: 0, remaining: null } });
    show();

    await screen.findByTestId("record-session-rewrite_text");

    expect(screen.queryByTestId("ai-quota")).not.toBeInTheDocument();
  });
});

describe("まだ何も無いとき", () => {
  const empty = { artifacts: [], sessions: [], ai_quota: { limit: 10, used: 0, remaining: 10 } };

  it("行き止まりにしない。そこから行ける", async () => {
    /*
      「レッスンを1本進めると、ここに残ります」と書くなら、その
      レッスンへ行く道を同じ場所に置く。やり方を書いて道を置かないのは、
      書いていないのとあまり変わらない（憲章 原則 I）。
    */
    const user = userEvent.setup();
    const openCourse = vi.fn();
    serve(empty);
    show({ onOpenCourse: openCourse });

    await user.click(await screen.findByTestId("record-empty-start"));

    expect(openCourse).toHaveBeenCalledTimes(1);
  });
});

describe("読み込めなかったとき", () => {
  it("黙って空にせず、そう伝える", async () => {
    // 空と区別が付かないと、「記録が消えた」と思われる
    serve(null, false);
    show();

    await waitFor(() =>
      expect(screen.getByTestId("record-error")).toBeInTheDocument(),
    );
  });

  it("「もう一度」を、その文の隣で押せる", async () => {
    /*
      「もう一度お試しください」と書くなら、もう一度を押せる場所を
      同じ場所に置く。下タブで往復させると、同じことを別の手順で
      覚えることになる。
    */
    const user = userEvent.setup();
    let online = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (!online) throw new Error("offline");
      return { ok: true, status: 200, json: async () => FULL } as Response;
    });

    show();
    await screen.findByTestId("record-error");

    online = true;
    await user.click(screen.getByTestId("record-retry"));

    expect(
      await screen.findByTestId("record-session-rewrite_text"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("record-error")).not.toBeInTheDocument();
  });
});

describe("形が違う応答が返ったとき", () => {
  /**
   * 前段のプロキシや設定違いのエンドポイントが、200 のまま
   * 別の形を返すことがある。そのまま `sessions.length` を読むと
   * **画面ごと真っ白**になり、押せる場所が1つも無くなる。
   *
   * 200 が返っている以上「読み込めませんでした」でもない。
   * 足りない配列は空として扱い、画面は出す。
   */
  it("画面が真っ白にならない", async () => {
    serve({ session: null });
    show();

    expect(await screen.findByTestId("record-empty")).toBeInTheDocument();
  });
});
