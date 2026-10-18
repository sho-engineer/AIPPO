import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import html from "../src/kids/learning.html?raw";

const key = "aippo_kids_journey_v1";
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
type Quest = { id: string; world: number; kind: string };
type RecordValue = Record<string, unknown>;
type Api = {
  quests: Quest[]; legacyQuests: Quest[]; allQuests: Quest[];
  saved: { schema: number; done: Record<string, RecordValue | boolean>; attempts: Record<string, number>; latestAttempts: Record<string, RecordValue>; portfolio: RecordValue[] };
  state: { quest: number; result: RecordValue; selected: RecordValue; order: string[]; tries: number; view: string; world: number; questPage: number | null };
  worldIndices: (world: number) => number[];
  questIndex: (id: string) => number;
  stagePassed: (world: number) => boolean;
  stampOwned: (world: number) => boolean;
  stageRequirement: (world: number) => { earned: number; required: number; testPassed: boolean };
  mastery: () => number; count: () => number; unlocked: (index: number) => boolean;
  nextFinish: () => void; go: (view: string) => void; render: () => void;
};
function boot(previous?: object): Api {
  localStorage.clear();
  if (previous) localStorage.setItem(key, JSON.stringify(previous));
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, ageBand: "7-9" }));
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(`(function(){${script}\n})()`);
  return (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
}
const passedTest = () => ({ assessmentVersion: 2, evidence: { knowledge: true, practice: true } });
function markLessons(api: Api, world: number) {
  api.quests.filter(q => q.world === world && q.kind !== "checkpoint").forEach(q => { api.saved.done[q.id] = { choices: {} }; });
}
function markStage(api: Api, world: number) {
  markLessons(api, world);
  api.saved.done[api.quests.find(q => q.world === world && q.kind === "checkpoint")!.id] = passedTest();
}
beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: true })); });
afterEach(() => { document.body.innerHTML = ""; localStorage.clear(); vi.unstubAllGlobals(); });

describe("Kids critical progression: stamps, promotion and historic records", () => {
  it("has 10 then 3 practice missions, with a separate checkpoint in every stage", () => {
    const api = boot();
    expect(api.quests).toHaveLength(27);
    expect(new Set(api.quests.map(q => q.id)).size).toBe(27);
    for (let world = 0; world < 5; world++) {
      const quests = api.quests.filter(q => q.world === world);
      expect(quests.filter(q => q.kind !== "checkpoint")).toHaveLength(world === 0 ? 10 : 3);
      expect(quests.filter(q => q.kind === "checkpoint")).toHaveLength(1);
      expect(quests.at(-1)!.kind).toBe("checkpoint");
    }
  });

  for (const schema of [1, 3]) {
    it(`migrates schema ${schema} done, attempts, latest attempts and portfolio by original identity`, () => {
      const originalIds = schema === 1 ? ["w1-q1", "w1-q2", "w2-q1", "w2-q2", "w3-q1", "w3-q2", "w4-q1", "w4-q2"] : boot().legacyQuests.map(q => q.id);
      const last = originalIds.length - 1;
      const record = { at: "2026-10-01", choices: { color: "pink" }, hints: 3 };
      const latest = { at: "2026-10-02", hints: 1 };
      const api = boot({ schema, done: { 0: record, [last]: record }, attempts: { [last]: 4 }, latestAttempts: { [last]: latest }, portfolio: [{ quest: last, title: "既存の作品", choices: { color: "pink" } }] });
      expect(api.saved.schema).toBe(4);
      expect(api.saved.done[originalIds[0]]).toEqual(record);
      expect(api.saved.done[originalIds[last]]).toEqual(record);
      expect(api.saved.attempts).toEqual({ [originalIds[last]]: 4 });
      expect(api.saved.latestAttempts).toEqual({ [originalIds[last]]: latest });
      expect(api.saved.portfolio[0]).toMatchObject({ quest: originalIds[last], legacyQuest: last, title: "既存の作品" });
      expect(Object.keys(api.saved.done)).not.toContain("0");
      expect(api.saved.done["w1-purpose"]).toBeUndefined();
    });
  }

  it("preserves archived completions and portfolio on reload, without counting them toward current stamps", () => {
    const initial = boot();
    const oldIndex = initial.legacyQuests.findIndex(q => q.id === "w4-q3");
    const api = boot({ schema: 3, done: { [oldIndex]: { at: "2026-10-01", choices: {} } }, attempts: { [oldIndex]: 2 }, portfolio: [{ quest: oldIndex, title: "旧作品", choices: {} }] });
    expect(api.saved.done["w4-q3"]).toBeTruthy();
    expect(api.questIndex("w4-q3")).toBe(-1);
    expect(api.count()).toBe(0);
    const restored = boot(JSON.parse(localStorage.getItem(key)!));
    expect(restored.saved.done["w4-q3"]).toEqual({ at: "2026-10-01", choices: {} });
    expect(restored.saved.portfolio[0].quest).toBe("w4-q3");
    restored.go("parent");
    document.querySelector<HTMLButtonElement>('[data-action="recent"]')!.click();
    document.querySelector<HTMLButtonElement>("[data-recent-record]")!.click();
    expect(document.querySelector(".summaryModal")!.textContent).toContain("旧版・履歴保管");
    expect(document.querySelector(".summaryModal")!.textContent).toContain("2026-10-01");
  });

  it("does not promote from stamps alone, a legacy stamp alone, or partial test evidence", () => {
    const api = boot();
    markLessons(api, 0);
    expect(api.stageRequirement(0)).toEqual({ earned: 10, required: 10, testPassed: false });
    expect(api.stagePassed(0)).toBe(false);
    api.saved.done["w1-test"] = true;
    expect(api.stampOwned(0)).toBe(true);
    expect(api.stagePassed(0)).toBe(false);
    api.saved.done["w1-test"] = { assessmentVersion: 2, evidence: { knowledge: true, practice: false } };
    expect(api.stagePassed(0)).toBe(false);
    api.saved.done["w1-test"] = passedTest();
    expect(api.stagePassed(0)).toBe(true);
    expect(api.mastery()).toBe(1);
    expect(api.unlocked(api.questIndex("w2-q1"))).toBe(true);
  });

  it("retains old test evidence without awarding the newly expanded first stage prematurely", () => {
    const prior = boot();
    const done = Object.fromEntries(prior.legacyQuests.filter(q => q.world === 0).map(q => [String(prior.legacyQuests.indexOf(q)), q.kind === "checkpoint" ? passedTest() : { choices: {} }]));
    const api = boot({ schema: 3, done });
    expect(api.stampOwned(0)).toBe(true);
    expect(api.stageRequirement(0)).toEqual({ earned: 4, required: 10, testPassed: true });
    expect(api.stagePassed(0)).toBe(false);
    expect(api.mastery()).toBe(0);
    expect(api.unlocked(api.questIndex("w1-test"))).toBe(false);
    expect(api.unlocked(api.questIndex("w2-q2"))).toBe(false);
    api.go("map");
    const oldCertificate = document.querySelector(".stageStamp.historical");
    expect(oldCertificate!.textContent).toContain("旧");
    expect(oldCertificate!.classList.contains("earned")).toBe(false);
    api.go("parent");
    expect(document.body.textContent).toContain("スタンプ10個 ＋ ミニテスト");
    expect(document.body.textContent).toContain("旧版の合格証は履歴に保管");
  });

  it("requires the complete lower-stage prefix, not only the immediately previous certificate", () => {
    const api = boot();
    markStage(api, 1);
    expect(api.stagePassed(1)).toBe(true);
    expect(api.mastery()).toBe(0);
    expect(api.unlocked(api.questIndex("w3-q1"))).toBe(false);
    markStage(api, 0);
    expect(api.mastery()).toBe(2);
    expect(api.unlocked(api.questIndex("w3-q1"))).toBe(true);
  });

  it("replaying a mission preserves its first stamp and never increases the stamp count", () => {
    const api = boot();
    api.state.quest = api.questIndex("w1-q1");
    api.state.result = { success: true };
    api.state.selected = { color: "blue" };
    api.state.order = [];
    api.state.tries = 1;
    api.nextFinish();
    const first = api.saved.done["w1-q1"];
    api.state.result = { success: true };
    api.state.tries = 2;
    api.nextFinish();
    expect(api.count()).toBe(1);
    expect(api.stageRequirement(0).earned).toBe(1);
    expect(api.saved.done["w1-q1"]).toEqual(first);
    expect(api.saved.latestAttempts["w1-q1"].submitAttempts).toBe(2);
    expect(Object.keys(api.saved.done)).toEqual(["w1-q1"]);
  });

  it("shows direct home routes to the map, growth record and settings without clearing progress", () => {
    const api = boot({ schema: 4, done: { "w1-q1": { choices: {} } } });
    api.go("home");
    document.querySelector<HTMLButtonElement>('[data-action="challenge"]')!.click();
    expect(api.state.view).toBe("map");
    api.go("home");
    expect(document.querySelector('[data-nav="parent"]')!.textContent).toContain("成長記録");
    document.querySelector<HTMLButtonElement>('[data-nav="parent"]')!.click();
    expect(api.state.view).toBe("parent");
    api.go("home");
    document.querySelector<HTMLButtonElement>('[data-nav="settings"]')!.click();
    expect(api.state.view).toBe("settings");
    expect(api.count()).toBe(1);
  });

  it("connects all first-stage lessons and their checkpoint in order without pagination", () => {
    const api = boot();
    api.go("map");
    const nodes = [...document.querySelectorAll<HTMLButtonElement>('.questTrail [data-quest]')];
    expect(nodes.map(node => api.quests[Number(node.dataset.quest)].id)).toEqual(api.quests.filter(q => q.world === 0).map(q => q.id));
    expect(nodes).toHaveLength(11);
    expect(nodes[0].getAttribute('aria-current')).toBe('step');
    expect(nodes[0].disabled).toBe(false);
    expect(nodes.slice(1).every(node => node.disabled)).toBe(true);
    expect(nodes.at(-1)!.classList.contains('checkpoint')).toBe(true);
    expect(document.querySelector('[data-quest-page-step]')).toBeNull();
    nodes[0].click(); expect(api.state.view).toBe('play');
  });
  it('shows only a purpose preview for locked stages and opens each stage after its complete gate', () => {
    const api = boot(); api.go('map'); const original = JSON.stringify(api.saved);
    document.querySelector<HTMLButtonElement>('[data-world="1"]')!.click();
    expect(api.state.world).toBe(0);
    expect(document.querySelector('.stagePreviewSpeech')!.textContent).toContain('くらべて');
    expect(document.querySelectorAll('.questTrail [data-quest]')).toHaveLength(11);
    document.querySelector<HTMLButtonElement>('[data-stage-close]')!.click();
    expect(JSON.stringify(api.saved)).toBe(original);
    for (let world = 0; world < 4; world++) {
      markLessons(api, world); api.render();
      expect(document.querySelector(`[data-world="${world+1}"]`)!.classList.contains('stageLocked')).toBe(true);
      markStage(api, world); api.render();
      document.querySelector<HTMLButtonElement>(`[data-world="${world+1}"]`)!.click();
      expect(api.state.world).toBe(world+1);
      expect(document.querySelector('.mapStory p')!.textContent).not.toBe('');
    }
    document.querySelector<HTMLButtonElement>('[data-world="0"]')!.click(); expect(api.state.world).toBe(0);
  });
  it('tells each new stage story with manual pages and restores the map without changing progress', () => {
    const api = boot(); api.go('map'); const before = JSON.stringify(api.saved);
    expect(document.querySelector('.storySpeech')!.textContent).toContain('うちゅう');
    expect(document.querySelector('.shell')!.hasAttribute('inert')).toBe(true);
    const persistentPo = document.querySelector('.storyPo img');
    document.querySelector<HTMLButtonElement>('[data-story-next]')!.click();
    expect(document.querySelector('.storyPo img')).toBe(persistentPo);
    expect(document.querySelector('.storyBlueprint')).not.toBeNull();
    expect(document.querySelector('.storyPageCount')!.textContent).toBe('2 / 3');
    document.querySelector<HTMLButtonElement>('[data-story-back]')!.click();
    expect(document.querySelector('.storyPageCount')!.textContent).toBe('1 / 3');
    document.querySelector<HTMLButtonElement>('[data-story-skip]')!.click();
    expect(document.querySelector('.stageStory')).toBeNull();
    expect(document.querySelector('.shell')!.hasAttribute('inert')).toBe(false);
    api.go('map'); expect(document.querySelector('.stageStory')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-stage-story-replay]')!.click();
    expect(document.querySelector('.stageStory')).not.toBeNull();
    expect(JSON.stringify(api.saved)).toBe(before);
    document.querySelector<HTMLButtonElement>('[data-story-skip]')!.click();
    document.querySelector<HTMLButtonElement>('[data-stage-story-replay]')!.click();
    for (let page = 0; page < 3; page++) document.querySelector<HTMLButtonElement>('[data-story-next]')!.click();
    expect(api.state.view).toBe('map');
    expect(document.querySelector('.worldView')).not.toBeNull();
    expect(document.querySelector('.questHead')).toBeNull();
    expect(document.querySelector('.shell')!.hasAttribute('inert')).toBe(false);
    expect(JSON.stringify(api.saved)).toBe(before);
    markStage(api,0); api.go('map');
    expect(document.querySelector('.storySpeech')!.textContent).toContain('うみ');
  });
  it('reveals the map after the story with decorative-only motion and no automatic quest start', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const api = boot(); api.go('map');
    const map = document.querySelector('.worldView');
    const before = JSON.stringify(api.saved);
    for (let page = 0; page < 3; page++) document.querySelector<HTMLButtonElement>('[data-story-next]')!.click();
    expect(api.state.view).toBe('map');
    expect(document.querySelector('.worldView')).toBe(map);
    expect(map!.classList.contains('storyArrival')).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('[data-action="current"]'));
    expect(JSON.stringify(api.saved)).toBe(before);
    document.querySelector('.pathRoad')!.dispatchEvent(new Event('animationend'));
    expect(map!.classList.contains('storyArrival')).toBe(false);
    document.querySelector<HTMLButtonElement>('[data-action="current"]')!.click();
    expect(api.state.view).toBe('play');
  });
  it('gives each story page distinct information without repeating a sentence', () => {
    const api = boot();
    for (let world = 0; world < 5; world++) {
      api.go('map'); const sentences: string[] = [];
      for (let page = 0; page < 3; page++) {
        const speech = document.querySelector('.storySpeech')!.textContent!;
        expect(document.querySelector('.stageStory')!.textContent).not.toMatch(/[一-龯]/);
        sentences.push(...speech.split(/[。！？]/).map(text => text.replace(/\s/g, '')).filter(Boolean));
        if (page < 2) document.querySelector<HTMLButtonElement>('[data-story-next]')!.click();
      }
      expect(new Set(sentences).size).toBe(sentences.length);
      document.querySelector<HTMLButtonElement>('[data-story-skip]')!.click(); markStage(api,world);
    }
  });
  it('introduces every checkpoint with its actual goal before answers or assessment records', () => {
    const api = boot();
    for (let world = 0; world < 5; world++) {
      for (let prior = 0; prior < world; prior++) markStage(api, prior);
      markLessons(api, world); api.go('map');
      const checkpoint = api.quests.findIndex(q => q.world === world && q.kind === 'checkpoint');
      document.querySelector<HTMLButtonElement>(`[data-quest="${checkpoint}"]`)!.click();
      expect(document.querySelector('.checkpointPurpose')).not.toBeNull();
      expect(document.querySelector('.checkpointPurposeTarget')).not.toBeNull();
      expect(document.querySelector('[data-test-answer]')).toBeNull();
      expect(api.saved.done[api.quests[checkpoint].id]).toBeUndefined();
      if (world === 0) {
        const speech = document.querySelector('.checkpointPurposeSpeech')!.cloneNode(true) as HTMLElement;
        speech.querySelectorAll('rt').forEach(rt=>rt.remove());
        expect(speech.textContent).toContain('宇宙へ行くロケットを作りたい！');
        expect([...document.querySelectorAll('.checkpointPurposeSpeech rt')].map(rt=>rt.textContent)).toEqual(expect.arrayContaining(['うちゅう','いく','つくりたい','もり','いっしょ']));
        expect(document.querySelector('.checkpointPurposeTarget')!.textContent).toContain('ピンク');
        expect(document.querySelector('.checkpointPurposeTarget .place-forest')).not.toBeNull();
      }
      document.querySelector<HTMLButtonElement>('[data-action="assessment-begin"]')!.click();
      expect(document.querySelector('[data-test-answer]')).not.toBeNull();
      expect(api.saved.done[api.quests[checkpoint].id]).toBeUndefined();
    }
  });
  it('retains a historical future record while preventing it from bypassing a locked stage', () => {
    const api = boot(); const index = api.questIndex('w2-q1');
    api.saved.done['w2-q1'] = { choices: {}, at: '2026-10-17' };
    expect(api.unlocked(index)).toBe(false);
    api.state.world = 1; api.go('map'); expect(api.state.world).toBe(0);
    expect(api.saved.done['w2-q1']).toBeTruthy();
    markStage(api, 0); expect(api.unlocked(index)).toBe(true);
  });
  it('reveals Po speech without removing the full accessible text and cancels on interaction or navigation', () => {
    vi.useFakeTimers(); vi.stubGlobal('matchMedia', () => ({ matches: false }));
    try {
      const api = boot(); api.go('map');
      const full = document.querySelector('.poSpeechFull')!.textContent!;
      expect(full).toContain('うちゅう'); expect(document.querySelector('.poSpeechVisual')!.getAttribute('aria-hidden')).toBe('true');
      vi.advanceTimersByTime(84);
      expect(document.querySelector('.poSpeechVisual')!.textContent).toBe(full);
      const glyphs = document.querySelectorAll('.poGlyph');
      expect(document.querySelectorAll('.poGlyph.is-shown').length).toBeGreaterThan(0);
      expect(document.querySelectorAll('.poGlyph.is-shown').length).toBeLessThan(glyphs.length);
      document.querySelector('#app')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(document.querySelector('.poSpeech')).toBeNull(); expect(document.querySelector('.mapStory p')!.textContent).toBe(full);
      api.go('map'); expect(document.querySelector('.poSpeech')).toBeNull();
      api.go('settings'); expect(document.querySelector('.poSpeech')).toBeNull(); expect(vi.getTimerCount()).toBe(0);
      vi.stubGlobal('matchMedia', () => ({ matches: true })); api.go('map'); expect(document.querySelector('.poSpeech')).toBeNull();
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });
  it('keeps the same request node while changing cards and does not replay it after a retry', () => {
    vi.useFakeTimers(); vi.stubGlobal('matchMedia', () => ({ matches: false }));
    try {
      const api=boot(); api.go('map');
      document.querySelector<HTMLButtonElement>('[data-story-skip]')?.click();
      document.querySelector<HTMLButtonElement>('[data-quest="0"]')!.click();
      const request=document.querySelector('.questSub');
      document.querySelector<HTMLButtonElement>('[data-select="color:pink"]')!.click();
      expect(document.querySelector('.questSub')).toBe(request);
      expect(request!.textContent).toContain('あおに');
      expect(request!.querySelector('.poGlyph')).toBeNull();
      document.querySelector<HTMLButtonElement>('[data-action="submit"]')!.click();
      vi.advanceTimersByTime(450);
      expect(document.querySelectorAll('.resultNotice')).toHaveLength(1);
      expect(document.querySelector('.resultNotice')!.textContent).toContain('あお');
      document.querySelector<HTMLButtonElement>('[data-action="next"]')!.click();
      expect(document.querySelector('.questSub')!.textContent).toContain('あおに');
      expect(document.querySelector('.questSub .poGlyph')).toBeNull();
      expect(api.saved.done['w1-q1']).toBeUndefined();
    } finally { vi.clearAllTimers(); vi.useRealTimers(); }
  });
  it('fills stable mission slots without counting the checkpoint or replay stamps, and promotes only on the checkpoint', () => {
    const api=boot();
    Object.assign(api.state,{quest:0,result:{success:true},selected:{color:'blue'},order:[],tries:1});
    api.nextFinish();
    expect(document.querySelectorAll('.missionStamp')).toHaveLength(10);
    expect(document.querySelectorAll('.missionStamp.earned')).toHaveLength(1);
    expect(document.querySelectorAll('.freshStamp')).toHaveLength(1);
    api.nextFinish();
    expect(document.querySelectorAll('.missionStamp.earned')).toHaveLength(1);
    expect(document.querySelector('.freshStamp')).toBeNull();
    markLessons(api,0); api.go('map');
    document.querySelector<HTMLButtonElement>('[data-stamp-card]')!.click();
    expect(document.querySelectorAll('.missionStamp.earned')).toHaveLength(10);
    expect(document.querySelector('.stampCardHint')!.textContent).toContain('さいごの ミッション');
    expect(api.mastery()).toBe(0);
    expect(api.unlocked(api.questIndex('w2-q1'))).toBe(false);
    document.querySelector<HTMLButtonElement>('[data-stamp-close]')!.click();
    Object.assign(api.state,{quest:api.questIndex('w1-test'),result:{success:true,evidence:{knowledge:true,practice:true}}});
    api.nextFinish();
    expect(api.mastery()).toBe(1);
    expect(document.querySelectorAll('.miniTier.earned')).toHaveLength(1);
    expect(document.querySelector('.newTier')).not.toBeNull();
    expect(api.unlocked(api.questIndex('w2-q1'))).toBe(true);
    api.nextFinish(); expect(document.querySelector('.newTier')).toBeNull();
  });
});
