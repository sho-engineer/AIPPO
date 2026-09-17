import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { forgetGuestSeen } from "../src/course/diagnosisNudge";
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
 * 第1リリースで開くのは**診断と Day1 だけ**（catalog.ts の
 * RELEASE_COMING_SOON）。中身も画面も出来ているが、リリース判定が
 * 済んでいないものは「準備中」として一覧に出す。
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
  it("第1リリースで開くのは、診断と Day1 だけ", () => {
    /*
      **ここだけは本数を決め打ちにする。**

      ふだん公開範囲を検査に書くのは避ける（教材が1本増えるたびに
      落ちるだけで、止める仕組みが壊れても気づけない）。ただし
      「第1リリースは Day1 のみ」はリリースの約束そのもので、
      うっかり別の教材を開いたまま出すのがいちばん困る。

      教材を公開するときは、`catalog.ts` の RELEASE_COMING_SOON から
      id を1行消して、ここも一緒に直す——**2か所で済む**ように
      してある。画面側は触らない。
    */
    const open = startableLessons(COURSE.lessons).map((one) => one.id);
    expect(open).toEqual(["diagnosis", "rewrite_text"]);
  });

  it("準備中にしても、教材は消えない", () => {
    /*
      止めるのは開始だけ。中身も並びも残す——リリース判定が済んだ
      教材から順に開けるようにするためで、そのとき本文を書き直す
      ことにならないように。
    */
    expect(COURSE.lessons.length).toBeGreaterThan(2);
    for (const lesson of COURSE.lessons) {
      expect(lesson.steps.length, `${lesson.id} の中身が空`).toBeGreaterThan(0);
    }
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
    /*
      この回のあいだの控えも落とす。端末の控えと別に持っているので
      （`course/diagnosisNudge.ts`）、これが残ると2回目からようこそが
      出ない。
    */
    forgetGuestSeen();
    resetCatalog();
    vi.restoreAllMocks();
    serveCatalog();
  });

  afterEach(() => {
    cleanup();
    act(() => resetCatalog());
  });

  const start = async (user: ReturnType<typeof userEvent.setup>) => {
    /*
      ようこそ → （案内）→ ホーム。

      入口が2枚あるので、押すのも2回になることがある。案内は
      **出ていたら閉じる**形にしてある——見た印が端末に残っている
      回では出ないので、決め打ちにすると落ちる。
    */
    await user.click(await screen.findByTestId("welcome-guest"));
    const later = screen.queryByTestId("diagnosis-intro-later");
    if (later) await user.click(later);
  };

  /**
   * コースの中身（レッスンが並ぶ段）まで開く。
   *
   * コースは3段（一覧 → 中身 → レッスン）。近日公開の**教材**を見るのは
   * 2段目なので、そこまで進む。
   */
  const openCourse = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: "コース" }));
    await user.click(await screen.findByTestId("current-course-open"));
  };

  it("教材一覧に近日公開の教材も並ぶが、押せない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);
    await openCourse(user);

    // 一覧からは消さない。何が来るのかは見せる
    const soon = await screen.findByTestId(`lesson-${GATED}`);
    expect(soon).toBeInTheDocument();
    expect(soon).toHaveAttribute("data-availability", "coming_soon");
    /*
      **押せる形のまま残す。** `disabled` にしていたころは、押しても
      何も起きないので、壊れているのか押し方が悪いのかが分からない
      まま終わっていた。いまは押すと一言返る（下の検査）。

      読み上げには「いまは押せない」と伝える。`aria-disabled` は
      `disabled` と違って押下が届くので、両方を満たせる。
    */
    expect(soon).toHaveAttribute("aria-disabled", "true");

    // 始められるものには、その印を付けない
    expect(screen.getByTestId("lesson-rewrite_text")).toHaveAttribute(
      "data-availability",
      "available",
    );
  });

  it("準備中の行を押すと、画面は変わらず、一言だけ返る", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);
    await openCourse(user);

    await user.click(await screen.findByTestId(`lesson-${GATED}`));

    expect(await screen.findByTestId("toast")).toHaveTextContent(
      "このLessonは現在準備中です。公開まで少しお待ちください。",
    );
    // 教材の画面へは入っていない
    expect(screen.queryByTestId("lesson-header")).not.toBeInTheDocument();
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

    /*
      レッスン画面へは移っていないこと。

      目印は進み具合の帯。以前は区切りの帯（phase-stepper）で見ていたが、
      進み具合を1本にまとめた際に消えた。消えた目印で「無いこと」を
      確かめると、**画面が開いていても通ってしまう**。
    */
    expect(screen.queryByTestId("lesson-progress")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: COURSE.title })).toBeInTheDocument();
  });

  it("進捗の分母に近日公開を混ぜない", async () => {
    const user = userEvent.setup();
    render(<App />);
    await start(user);

    /*
      届いた2本のうち始められるのは1本なので、分母は 1（2ではない）。

      見る場所は今日の1本の「Day ◯ / ◯」。記録の行は**終えた数だけ**を
      出す形に変えたので、分母はもうそちらに出ていない。
    */
    const card = await screen.findByTestId("next-up");
    expect(card).toHaveTextContent(/Day\s*1\s*\/\s*1/);
    expect(card).not.toHaveTextContent(/\/\s*2/);
    // 終えた数は 0 のまま
    expect(await screen.findByTestId("stat-done")).toHaveTextContent("0");
  });
});
