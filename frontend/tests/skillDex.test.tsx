/**
 * AI技図鑑。
 *
 * 見張るのは4つ。
 *
 * - 取っていない技も出るが、**どこで取れるか**が必ず書いてある
 * - 順位も他人との数も出さない
 * - 1つも無いときに行き止まりにしない
 * - 組み合わせの呼び名が、技そのものの名前を置き換えていない
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillDexPage } from "../src/pages/SkillDexPage";
import { SkillSummary } from "../src/components/aippo/SkillSummary";
import type { SkillDex } from "../src/api/skills";

const DEX: SkillDex = {
  skills: [
    {
      slug: "tone",
      name: "トーン指定",
      one_line: "文章の雰囲気を指定する",
      description: "雰囲気を言葉にして渡すと、書き直しの回数が減る。",
      example: "ていねいな言い方にしてください",
      acquired: true,
      acquired_at: "2026-08-20T10:00:00+09:00",
      lessons: [
        { slug: "rewrite_text", title: "文章を分かりやすくする", course_slug: "foundation" },
      ],
    },
    {
      slug: "comparison",
      name: "比較",
      one_line: "複数の案を出して見比べる",
      description: "比べる基準を自分で決めて、並べて見る。",
      example: "費用と手間の2つで比べてください",
      acquired: false,
      acquired_at: null,
      lessons: [
        { slug: "compare_options", title: "選択肢を比較する", course_slug: "foundation" },
      ],
    },
  ],
  acquired_count: 1,
  total_count: 2,
  combos: [
    {
      skills: ["tone", "comparison"],
      name: "選べる材料",
      one_line: "並べて、確かめてから決める",
      complete: false,
    },
  ],
  xp: { total: 30, level: "AI Starter", next_level: "AI Beginner", to_next: 70 },
};

function serve(body: SkillDex | null) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (body === null) throw new Error("offline");
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as Response;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

function open(dex: SkillDex | null = DEX) {
  serve(dex);
  return render(<SkillDexPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);
}

describe("AI技図鑑", () => {
  it("覚えた数を、自分のぶんだけ出す", async () => {
    open();

    expect(await screen.findByTestId("skill-count")).toHaveTextContent("1 / 2");
  });

  it("順位も、他の人の数も出さない", async () => {
    open();
    await screen.findByTestId("skill-count");

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("位");
    expect(text).not.toContain("平均");
    expect(text).not.toContain("ランキング");
  });

  it("まだの技にも、どこで取れるかが書いてある", async () => {
    /*
      行き先の無い枠を並べると、押しても何も無い項目になる。
      「まだ」と出すなら、そこから取りに行ける道を隣に置く。
    */
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByTestId("skill-toggle-comparison"));

    const link = screen.getByTestId("skill-lesson-comparison-compare_options");
    expect(link).toHaveTextContent("習得する");
    expect(link).toHaveTextContent("選択肢を比較する");
  });

  it("まだの技から、そのレッスンへ入れる", async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    serve(DEX);
    render(<SkillDexPage onSelectLesson={go} onOpenCourse={() => {}} />);

    await user.click(await screen.findByTestId("skill-toggle-comparison"));
    await user.click(screen.getByTestId("skill-lesson-comparison-compare_options"));

    expect(go).toHaveBeenCalledWith("compare_options");
  });

  it("覚えた技からは、やり直しに行ける", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByTestId("skill-toggle-tone"));

    expect(screen.getByTestId("skill-lesson-tone-rewrite_text")).toHaveTextContent(
      "もう一度やる",
    );
  });

  it("次の呼び名まで、あといくつかを出す", async () => {
    open();

    const bar = await screen.findByTestId("xp-bar");
    expect(bar).toHaveTextContent("AI Starter");
    expect(bar).toHaveTextContent("30 XP");
    expect(bar).toHaveTextContent("あと70");
    expect(bar).toHaveTextContent("AI Beginner");
  });

  it("いちばん上まで来た人には、あといくつを出さない", async () => {
    open({
      ...DEX,
      xp: { total: 2000, level: "AI Navigator", next_level: null, to_next: null },
    });

    const bar = await screen.findByTestId("xp-bar");
    expect(bar).toHaveTextContent("いちばん上の呼び名");
    expect(bar.textContent).not.toContain("あと");
  });

  it("組み合わせは、技の名前を置き換えない", async () => {
    /*
      呼び名で置き換えると、外の記事で通じる言葉を覚えられない。
      組み合わせの札の中にも、一般用語の名前をそのまま出す。
    */
    open();

    const combo = await screen.findByTestId("combo-tone-comparison");
    expect(combo).toHaveTextContent("選べる材料");
    expect(combo).toHaveTextContent("トーン指定");
    expect(combo).toHaveTextContent("比較");
  });

  it("1つも無いときに、行き止まりにしない", async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    serve({
      ...DEX,
      skills: DEX.skills.map((skill) => ({ ...skill, acquired: false, acquired_at: null })),
      acquired_count: 0,
    });
    render(<SkillDexPage onSelectLesson={() => {}} onOpenCourse={go} />);

    await user.click(await screen.findByTestId("skills-empty-start"));

    expect(go).toHaveBeenCalled();
  });

  it("読み込めなかったら、その場でやり直せる", async () => {
    const user = userEvent.setup();
    const send = serve(null);
    render(<SkillDexPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);

    await user.click(await screen.findByTestId("skills-retry"));

    // 下タブで往復させない。押した場所でもう一度取りにいく
    await waitFor(() => expect(send.mock.calls.length).toBeGreaterThan(1));
  });
});

describe("ホームのAI技", () => {
  const XP = { total: 30, level: "AI Starter", next_level: "AI Beginner", to_next: 70 };

  it("覚えた数と、いまの呼び名を出す", () => {
    render(<SkillSummary xp={XP} skills={3} onOpen={() => {}} />);

    const card = screen.getByTestId("skill-summary");
    expect(card).toHaveTextContent("AI技を3こ 覚えました");
    expect(card).toHaveTextContent("AI Starter");
  });

  it("1つも無いうちは出さない", () => {
    /*
      「0こ」を置いても、できることが増えていないと言われるだけになる。
      図鑑そのものは学習記録から開けるので、行き止まりにはならない。
    */
    render(<SkillSummary xp={XP} skills={0} onOpen={() => {}} />);

    expect(screen.queryByTestId("skill-summary")).not.toBeInTheDocument();
  });

  it("他人との比較を出さない", () => {
    render(<SkillSummary xp={XP} skills={3} onOpen={() => {}} />);

    const text = screen.getByTestId("skill-summary").textContent ?? "";
    expect(text).not.toContain("位");
    expect(text).not.toContain("平均");
  });
});
