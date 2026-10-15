import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../src/kids/learning.html?raw";
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const store = "aippo_kids_journey_v1";
const click = (s: string) => { const b = document.querySelector<HTMLButtonElement>(s); expect(b, s).not.toBeNull(); b!.click(); };
function boot(challenges: object[] = []) {
  localStorage.clear();
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, ageBand: "10-12" }));
  localStorage.setItem(store, JSON.stringify({ schema: 3, done: {}, challenges }));
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(`(function(){${script}\n})()`);
}
const records = () => JSON.parse(localStorage.getItem(store)!).challenges;
const conditions = { sources: { area: "教材の地域A", when: "教材の明日", source: "公的な情報" }, outing: { budget: "0円", time: "60分", place: "屋内" } };
afterEach(() => { document.body.innerHTML = ""; localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("Explicit simulation decisions without invented revision evidence", () => {
  for (const task of ["sources", "outing"] as const) {
    it.each(["mismatch", "valid", "unknown"].flatMap(previous => Array.from({ length: 8 }, (_, combination) => [previous, combination] as const)))(`${task} cycles from %s with condition combination %i`, (previous, combination) => {
      const alternate = task === "sources" ? ["教材の地域B", "教材の週末", "施設の公式案内"] : ["500円", "90分", "屋外"];
      const chosen = Object.fromEntries(Object.entries(conditions[task]).map(([key, value], index) => [key, combination & (1 << index) ? alternate[index] : value]));
      const legacy = { at: "2026-10-14T00:00:00Z", task, mode: "advanced", comparisonVersion: 4, caseStatus: previous, issueKeys: [task === "sources" ? "area" : "budget"], conditions: chosen };
      boot([legacy]); click('[data-action="retry"]');
      const status = ({ mismatch: "valid", valid: "unknown", unknown: "mismatch" } as Record<string, string>)[previous];
      const issue = status === "valid" ? "none" : status === "unknown" ? (task === "sources" ? "when" : "time") : (task === "sources" ? "area" : "budget");
      click('[data-ch-compare]'); expect(document.querySelector('[data-ch-decision]')).toBeNull();
      click(`[data-ch-issue="${issue}"]`); click('[data-ch-compare]');
      const decision = status === "valid" ? "adopt" : task === "sources" || status === "unknown" ? "hold" : "revise";
      click(`[data-ch-decision="${decision === "adopt" ? "hold" : "adopt"}"]`);
      expect(document.querySelector('[data-ch-reason]')).toBeNull();
      click(`[data-ch-decision="${decision}"]`);
      expect(!!document.querySelector('[data-ch-fix]')).toBe(decision === "revise");
      if (decision === "revise") click('[data-ch-fix="correct"]');
      click('[data-ch-reason="correct"]'); click('[data-ch-verify="wrong"]');
      expect(document.querySelector('[data-ch-support]')).toBeNull();
      click('[data-ch-verify="correct"]'); click('[data-ch-support="self"]');
      const r = records().at(-1);
      expect(r.conditions).toEqual(chosen);
      expect(r.comparisonVersion).toBe(4); expect(r.caseStatus).toBe(status); expect(r.decisionSelected).toBe(decision);
      expect(r.evidence.revisionSelected).toBe(decision === "revise");
      expect(r.evidence.concreteRevisionSelected).toBe(decision === "revise");
      expect(r.completedAtISO).toBe(r.at); expect(r.timeZone).toBeTruthy(); expect(r.sequence).toBeGreaterThan(0);
      expect(records()[0]).toEqual(legacy);
      expect(r.scope).toBe("simulation"); expect(r.evidence.ability).toBeUndefined();
      expect(document.querySelector('.challengeModal details')!.textContent).toContain("コピー用の完成依頼ではありません");
      click('[data-ch-home]'); click('[data-daily-check="yes"]');
      expect(document.querySelector('.dailyPrompt')!.textContent).toContain("コピー用の完成依頼ではありません");
      expect(document.querySelector('.dailyModal')!.textContent).toContain("公開対象と具体日付");
      document.querySelector<HTMLSelectElement>('#daily-mode')!.value = "none";
      document.querySelector<HTMLSelectElement>('#daily-outcome')!.value = "unused";
      document.querySelector<HTMLSelectElement>('#daily-support')!.value = "together";
      document.querySelector<HTMLSelectElement>('#daily-child-wish')!.value = "stop";
      click('[data-daily-save]');
      const daily = JSON.parse(localStorage.getItem(store)!).daily.at(-1);
      expect(daily.childWish).toBe("stop"); expect(daily.sequence).toBeGreaterThan(r.sequence);
    });
  }
  it("keeps initial cases and closes unfinished work without trapping the child", () => {
    boot(); click('[data-action="start"]'); click('[data-ch-task="sources"]');
    for (let n = 0; n < 3; n++) click('[data-ch-condition="0"]');
    expect(document.querySelector('.challengeModal')!.textContent).toContain("不明");
    expect(document.querySelector('.challengeModal')!.textContent).toContain("未完了の練習は初めから");
    click('[data-ch-close]'); expect(document.querySelector('.challengeModal')).toBeNull(); expect(records()).toEqual([]);
  });
});
