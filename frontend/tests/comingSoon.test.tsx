import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { COURSE } from "../src/course/catalog";
import { resetCatalog } from "../src/course/live";
import {
  comingSoonNote,
  hasComingSoonDetail,
  isComingSoon,
  isStartable,
  startableLessons,
} from "../src/course/availability";
import type { Lesson } from "../src/course/types";

/**
 * 近日公開の教材は、一覧に出すが始められないこと。
 *
 * 教材9本の中身が揃ったので、同梱データの既定は**全部が始められる**に
 * 変えた（catalog.ts の RELEASE_COMING_SOON は空）。
 * それでも止める仕組みは残す。未完成の教材を足すときや、問題が見つかって
 * 一時的に閉じるときに要る。
 *
 * そこでこのテストは「どの教材が開いているか」ではなく、
 * **近日公開にしたら本当に止まるか**を見る。以前は
 * `expect(startable).toEqual(["diagnosis", "rewrite_text"])` のように
 * その時々の公開範囲を書いていたが、それは教材が1本増えるたびに
 * 落ちるだけで、止める仕組みが壊れても気づけない。
 *
 * 押せるボタンが1つ残るだけで、始められないはずの教材が始まる。
 * 画面の入口をすべて見る。
 */

/** 止まることを確かめる相手。サーバーから近日公開として届く。 */
const GATED = "summarize_text";

/**
 * サーバーが返す教材。1本は開いていて、1本は近日公開。
 *
 * 教材の本体は DB にあり、管理画面から止められる。画面は起動時に
 * 1回聞いてそれに従うので、止まるかどうかはこの形で確かめられる。
 */
const FROM_SERVER = {
  id: "first_step_7days",
  title: COURSE.title,
  description: COURSE.description,
  lessons: [
    {
      id: "rewrite_text",
      number: 1,
      title: "文章を分かりやすくする",
      goal: "伝わる文章にする",
      outcomes: [],
      tags: [],
      usesAi: true,
      estimatedMinutes: 8,
      availability: "available",
      steps: [{ id: "intro", type: "intro", title: "はじめに" }],
    },
    {
      id: GATED,
      number: 2,
      title: "長い文章を短くまとめる",
      goal: "まとめる目的と出力の形を指定できるようになる",
      outcomes: [],
      tags: [],
      usesAi: true,
      estimatedMinutes: 8,
      availability: "coming_soon",
      plannedReleaseDate: "2026-09-01",
      // 中身は配られない。止めている以上、渡す理由が無い
      steps: [],
    },
  ],
};

/**
 * 教材だけ差し替える。
 *
 * ほかの問い合わせは**失敗させる**。空の 200 を返すと、受け取り側が
 * 期待した形と違うものを掴んで別の壊れ方をする。ここで見たいのは
 * 教材の止め方だけなので、それ以外は「繋がらない」と同じ状態にする
 * （画面はもともと、繋がらなくても動くように作ってある）。
 */
function serveCatalog() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(typeof input === "string" ? input : (input as Request).url);
    if (!url.includes("/catalog/")) throw new Error("offline");
    return {
      ok: true,
      status: 200,
      json: async () => ({ courses: [FROM_SERVER] }),
    } as Response;
  });
}

describe("近日公開の判定", () => {
  const lesson = (over: Partial<Lesson>): Lesson =>
    ({ id: "x", number: 1, title: "", goal: "", outcomes: [], tags: [], usesAi: true, steps: [], ...over }) as Lesson;

  it("availability が coming_soon のときだけ止める", () => {
    expect(isComingSoon(lesson({ availability: "coming_soon" }))).toBe(true);
    expect(isComingSoon(lesson({ availability: "available" }))).toBe(false);
  });

  it("指定が無ければ始められる扱いにする", () => {
    // 同梱データで動かすとき、全部が近日公開になると何も始められない
    expect(isStartable(lesson({}))).toBe(true);
  });

  it("公開予定日があるときだけ日付を出す", () => {
    expect(comingSoonNote(lesson({ availability: "coming_soon" }))).not.toMatch(/\d年/);
    expect(
      comingSoonNote(
        lesson({ availability: "coming_soon", plannedReleaseDate: "2026-09-01" }),
      ),
    ).toContain("2026年9月1日");
  });

  it("独自の一言があれば、そちらを優先する", () => {
    expect(
      comingSoonNote(
        lesson({ availability: "coming_soon", comingSoonMessage: "準備中です" }),
      ),
    ).toBe("準備中です");
  });

  it("知らせる中身があるかどうかを見分けられる", () => {
    // 公開日も個別の文も無ければ、出るのは決まり文句だけ。
    // それを9本ぶん並べても何も伝わらないので、出さない側に倒す
    expect(hasComingSoonDetail(lesson({ availability: "coming_soon" }))).toBe(false);
    expect(
      hasComingSoonDetail(
        lesson({ availability: "coming_soon", plannedReleaseDate: "2026-09-01" }),
      ),
    ).toBe(true);
    expect(
      hasComingSoonDetail(
        lesson({ availability: "coming_soon", comingSoonMessage: "準備中です" }),
      ),
    ).toBe(true);
  });
});

describe("同梱データの既定", () => {
  it("教材9本は、すべて始められる", () => {
    // 中身は9本とも揃っている。閉じておくと、画面には出ているのに
    // 押せない教材が並ぶだけになる
    expect(startableLessons(COURSE.lessons)).toHaveLength(COURSE.lessons.length);
    expect(COURSE.lessons).toHaveLength(9);
  });

  it("どの教材にも、進められる中身がある", () => {
    for (const lesson of COURSE.lessons) {
      expect(lesson.steps.length, `${lesson.id} の中身が空`).toBeGreaterThan(0);
    }
  });
});

describe("画面での見え方", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetCatalog();
    vi.restoreAllMocks();
    serveCatalog();
  });

  afterEach(() => {
    cleanup();
    act(() => resetCatalog());
  });

  const start = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole("button", { name: "はじめる" })[0]);
  };

  const openCourse = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: "教材一覧" }));
  };

  it("教材一覧に近日公開の教材も並ぶが、押せない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);
    await openCourse(user);

    // 一覧からは消さない。何が来るのかは見せる
    const soon = await screen.findByTestId(`lesson-${GATED}`);
    expect(soon).toBeInTheDocument();
    expect(soon).toBeDisabled();
    expect(soon).toHaveAttribute("data-availability", "coming_soon");

    // 始められるものは押せる
    expect(screen.getByTestId("lesson-rewrite_text")).toBeEnabled();
  });

  it("近日公開の行には、公開予定が出る", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);
    await openCourse(user);

    const soon = await screen.findByTestId(`lesson-${GATED}`);
    expect(soon).toHaveTextContent("2026年9月1日");
  });

  it("押してもレッスンは始まらない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);
    await openCourse(user);

    const soon = await screen.findByTestId(`lesson-${GATED}`);
    await user.click(soon).catch(() => {
      // 押せないボタンなので、クリックが弾かれてもよい
    });

    // レッスン画面へは移っていないこと
    expect(screen.queryByTestId("phase-stepper")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: COURSE.title })).toBeInTheDocument();
  });

  it("進捗の分母に近日公開を混ぜない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    // 届いた2本のうち始められるのは1本なので、分母は 1（2ではない）
    const progress = await screen.findByTestId("progress-summary");
    expect(progress).toHaveTextContent("0/1");
  });
});
