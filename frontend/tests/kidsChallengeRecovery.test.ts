import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../src/kids/learning.html?raw";
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const store = "aippo_kids_journey_v1";
function click(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull(); button!.click();
}
function boot(challenges: object[] = []) {
  localStorage.clear();
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, ageBand: "10-12" }));
  localStorage.setItem(store, JSON.stringify({ schema: 3, done: {}, challenges }));
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(`(function(){${script}\n})()`);
}
function sources() {
  click('[data-action="start"]'); click('[data-ch-task="sources"]');
  for (let i = 0; i < 3; i++) click('[data-ch-condition="0"]');
}
const record = {
  rubricVersion: 2, mode: "advanced", task: "sources", at: "2026-10-14T00:00:00Z",
  conditions: { area: "教材の地域A", when: "教材の明日", source: "公的な情報" },
  selectedRevision: "資料Bは日時が不明。外出の判断を保留する",
  selectedVerification: "資料Bの公式発信元で対象日時と更新日時を確認する",
  referenceSnapshot: [{ id: "B", area: "教材の地域A", when: "不明", source: "公的な情報", updated: "不明" }],
  evidence: { sourceMethodSelected: true }, hints: 0, errors: 0, support: "self", scope: "simulation",
};
afterEach(() => { document.body.innerHTML = ""; localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Kids source evaluation and historical recovery", () => {
  it.each([
    ["budget", 0.9, "place"], ["time", 0.1, "budget"], ["place", 0.9, "time"],
  ] as const)("changes an outing's previous %s defect and scores the actual candidate", (previousIssue, seed, expectedIssue) => {
    vi.spyOn(Math, "random").mockReturnValue(seed);
    const previous = { ...record, task: "outing", comparisonVersion: 3, issueKeys: [previousIssue], conditions: { budget: "500円", time: "90分", place: "屋外" } };
    boot([previous]); click('[data-action="retry"]');
    const candidate = document.querySelector(".challengeModal .dailyPrompt")!.textContent!;
    const values = candidate.match(/([\d,]+)円・(\d+)分・(屋内|屋外)/)!;
    expect(values).not.toBeNull();
    const actual = [Number(values[1].replaceAll(",", "")) > 500 ? "budget" : null, Number(values[2]) > 90 ? "time" : null, values[3] !== "屋外" ? "place" : null].filter(Boolean);
    expect(actual).toEqual([expectedIssue]);
    click(`[data-ch-issue="${expectedIssue}"]`); click('[data-ch-compare]');
    click('[data-ch-decision="revise"]');
    for (const key of ["fix", "reason", "verify"]) click(`[data-ch-${key}="correct"]`);
    click('[data-ch-support="self"]');
    const current = JSON.parse(localStorage.getItem(store)!).challenges.at(-1);
    expect(current.issueKeys).toEqual(actual); expect(current.variantSeed).toBe(seed);
    expect(current.selectedRevision).toContain("0円・90分・屋外");
  });
  it.each(["area", "when", "source"])("changes the previous %s defect on replay while scoring exactly the displayed B defect", (previousIssue) => {
    boot([{ ...record, comparisonVersion: 3, issueKeys: [previousIssue] }]);
    click('[data-action="retry"]');
    const cards = [...document.querySelectorAll(".challengeModal .dailyRecord")];
    const b = cards.find((card) => card.querySelector("strong")?.textContent?.includes("B"));
    expect(b).toBeTruthy();
    const text = b!.textContent!;
    const actualIssues = Object.entries(record.conditions).filter(([, value]) => !text.includes(value)).map(([key]) => key);
    expect(actualIssues).toHaveLength(1);
    expect(actualIssues[0]).not.toBe(previousIssue);
    if (actualIssues[0] !== "when") expect(text).not.toContain("不明");
    const wrongKey = ["area", "when", "source"].find((key) => !actualIssues.includes(key))!;
    click(`[data-ch-issue="${wrongKey}"]`); click('[data-ch-compare]');
    expect(document.querySelector('[data-ch-fix]')).toBeNull();
    click(`[data-ch-issue="${wrongKey}"]`);
    click(`[data-ch-issue="${actualIssues[0]}"]`); click('[data-ch-compare]');
    click('[data-ch-decision="hold"]');
    for (const key of ["reason", "verify"]) click(`[data-ch-${key}="correct"]`);
    click('[data-ch-support="self"]');
    const records = JSON.parse(localStorage.getItem(store)!).challenges;
    expect(records).toHaveLength(2);
    expect(records[1].comparisonVersion).toBe(4);
    expect(records[1].issueKeys).toEqual(actualIssues);
    expect(records[1].referenceSnapshot[1].when === "不明").toBe(actualIssues[0] === "when");
    expect(records[0].issueKeys).toEqual([previousIssue]);
  });
  it("treats an old record without comparison metadata as the old time defect and changes it", () => {
    boot([record]); click('[data-action="retry"]');
    const b = [...document.querySelectorAll(".challengeModal .dailyRecord")].find((card) => card.querySelector("strong")?.textContent?.includes("B"))!;
    expect(b.textContent).toContain(record.conditions.when);
    expect(b.textContent).not.toContain("不明");
    expect(document.querySelector('[data-ch-compare]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(store)!).challenges).toEqual([record]);
  });
  it("states that the scored comparison is about B before evaluating either card", () => {
    boot(); sources();
    expect(document.querySelector(".challengeModal h3")!.textContent).toContain("資料B");
    click('[data-ch-issue="when"]'); click('[data-ch-compare]');
    expect(document.querySelector('[data-ch-decision="hold"]')).not.toBeNull();
  });
  it("explains the selected source-check mistake instead of an unrelated repeated-answer mistake", () => {
    boot(); sources(); click('[data-ch-issue="when"]'); click('[data-ch-compare]');
    click('[data-ch-decision="hold"]'); click('[data-ch-reason="correct"]'); click('[data-ch-verify="wrong"]');
    const feedback = document.querySelector(".challengeFeedback")!.textContent!;
    expect(feedback).toMatch(/日時|資料|発信元/);
    expect(feedback).not.toContain("同じ回答を繰り返し");
    expect(document.querySelector('[data-ch-support]')).toBeNull();
  });
  it("opens a past record with its original conditions, plan, verification and source snapshot", () => {
    const later = { ...record, task: "outing", at: "2026-10-15T00:00:00Z", conditions: { budget: "500円", time: "90分", place: "屋外" }, selectedRevision: "近くの公園で観察：0円・90分・屋外" };
    boot([record, later]); click('[data-action="start"]'); click('[data-ch-history="0"]');
    const detail = document.querySelector('[data-history-replay]')!.closest('[role="dialog"]')!;
    expect(detail.textContent).toContain("教材の地域A"); expect(detail.textContent).toContain("教材の明日");
    expect(detail.textContent).toContain(record.selectedRevision); expect(detail.textContent).toContain(record.selectedVerification);
    expect(detail.textContent).toContain("不明");
    click('[data-history-close]'); expect(document.querySelector('[data-history-replay]')).toBeNull();
    expect(document.querySelector('[data-ch-history="0"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(store)!).challenges).toEqual([record, later]);
  });
});
