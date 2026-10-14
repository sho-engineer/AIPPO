import { afterEach, describe, expect, it } from "vitest";
import html from "../src/kids/learning.html?raw";
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const store = "aippo_kids_journey_v1";

function click(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  button!.click();
}

function boot(previous?: object) {
  localStorage.clear();
  if (previous) localStorage.setItem(store, JSON.stringify(previous));
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, ageBand: "10-12" }));
  document.body.innerHTML = '<div id="app"></div>';
  expect(script).toBeTruthy();
  window.eval(`(function(){${script}\n})()`);
  click('[data-action="start"]');
}

function choose(task: string, options: number[]) {
  click(`[data-ch-task="${task}"]`);
  return options.map((option) => {
    const value = document.querySelector(`[data-ch-condition="${option}"]`)!.textContent!;
    click(`[data-ch-condition="${option}"]`);
    return value;
  });
}

function compare(task: string) {
  (task === "outing" ? ["budget", "time"] : ["when"]).forEach((key) => click(`[data-ch-issue="${key}"]`));
  click("[data-ch-compare]");
}

function finish() {
  click('[data-ch-fix="correct"]');
  click('[data-ch-reason="correct"]');
  click('[data-ch-verify="correct"]');
  click('[data-ch-support="self"]');
}

function records() {
  return JSON.parse(localStorage.getItem(store)!).challenges;
}

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("Kids concrete learning evidence stays within simulation", () => {
  for (const task of ["outing", "sources"]) {
    for (let combination = 0; combination < 8; combination++) {
      const options = [combination & 1, (combination >> 1) & 1, (combination >> 2) & 1];
      it(`${task}: selected conditions ${options.join("/")} produce honest persisted evidence`, () => {
        boot();
        const values = choose(task, options);
        compare(task);
        expect(document.querySelector(".challengeModal")?.textContent).toContain("教材");
        finish();
        const record = records().at(-1);
        expect(Object.values(record.conditions)).toEqual(values);
        expect(record.rubricVersion).toBe(2);
        expect(record.scope).toBe("simulation");
        expect(record.evidence.concreteRevisionSelected).toBe(true);
        expect(record.evidence.sourceCardsCompared).toBe(task === "sources");
        expect(record.evidence.sourceCheck).toBeUndefined();
        expect(record.selectedRevision).toBeTruthy();
        if (task === "sources") {
          expect(record.referenceSnapshot).toBeTruthy();
          expect(JSON.stringify(record.referenceSnapshot)).toContain("教材");
        }
        expect(record.errors).toBe(0);
        expect(record.support).toBe("self");
        const persisted = JSON.parse(localStorage.getItem(store)!);
        expect(persisted.schema).toBe(3);
        boot(persisted);
        expect(records().at(-1)).toEqual(record);
      });
    }
  }

  it("rejects all-conditions guessing and wrong revisions, reasons and checks without recording success", () => {
    boot();
    choose("outing", [1, 0, 1]);
    ["budget", "time", "place"].forEach((key) => click(`[data-ch-issue="${key}"]`));
    click("[data-ch-compare]");
    expect(document.querySelector("[data-ch-fix]")).toBeNull();
    click('[data-ch-issue="place"]');
    click("[data-ch-compare]");
    const wrong = document.querySelector('[data-ch-fix="incorrect"]')!.textContent!;
    const right = document.querySelector('[data-ch-fix="correct"]')!.textContent!;
    expect(wrong.length).toBeGreaterThan(right.length);
    click('[data-ch-fix="incorrect"]');
    expect(document.querySelector("[data-ch-reason]")).toBeNull();
    click('[data-ch-fix="correct"]');
    click('[data-ch-reason="wrong"]');
    expect(document.querySelector("[data-ch-verify]")).toBeNull();
    click('[data-ch-reason="correct"]');
    click('[data-ch-verify="wrong"]');
    expect(document.querySelector("[data-ch-support]")).toBeNull();
    click("[data-ch-hint]");
    click('[data-ch-verify="correct"]');
    click('[data-ch-support="hint"]');
    expect(records().at(-1)).toMatchObject({ errors: 4, hints: 1, support: "hint" });
  });

  it("preserves old rubric records without upgrading them into new evidence", () => {
    const old = { rubricVersion: 1, task: "outing", scope: "simulation", hints: 0, errors: 0, support: "self", at: "2026-10-12T00:00:00Z" };
    boot({ schema: 3, done: {}, challenges: [old] });
    choose("sources", [0, 1, 0]);
    compare("sources");
    finish();
    expect(records()[0]).toEqual(old);
    expect(records()[1].rubricVersion).toBe(2);
  });
});
