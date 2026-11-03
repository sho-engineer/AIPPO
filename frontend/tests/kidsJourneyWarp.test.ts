import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import canonical from "../src/kids/learning.html?raw";
import standalone from "../public/kids-title/index.html?raw";

// The journey warp: stripes open, chevrons rise, AIPPO blue with Po, then the new screen.
// It is decoration only: it never blocks taps, always cleans itself up, and is skipped for reduced motion.
type Api = { state: { view: string }; go(v: string): void };
const api = () => (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
function boot(source: string, reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced-motion") ? reduced : true }));
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(source.match(/<script>([\s\S]*?)<\/script>/)![1]);
  return api();
}
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("aippo_title_opening_v1", "seen");
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, challengeMode: "guided", readingSupport: "on" }));
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ authenticated: false }) }));
});
afterEach(() => {
  document.querySelector<HTMLButtonElement>("[data-opening-skip]")?.click();
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = "";
});

describe("Kids journey warp", () => {
  it("plays when the title starts the adventure, with Po and a short line, and removes itself", async () => {
    const a = boot(standalone, false); await vi.advanceTimersByTimeAsync(0);
    expect(a.state.view).toBe("home");
    document.querySelector<HTMLButtonElement>('[data-action="poster-start"]')!.click();
    expect(a.state.view).toBe("learning");
    const warp = document.querySelector(".journeyCurtain")!;
    expect(warp.getAttribute("aria-hidden")).toBe("true");
    expect(warp.querySelectorAll(".warpStripes i").length).toBeGreaterThan(10);
    expect(warp.querySelector(".warpChevrons")).not.toBeNull();
    expect(warp.querySelector(".warpHold .po")).not.toBeNull();
    expect(warp.querySelector(".warpHold strong")!.textContent).toBe("ぼうけんへ しゅっぱつ！");
    // The new screen is already there underneath; the warp only covers it for a moment.
    expect(document.querySelector('[data-action="start"]')).not.toBeNull();
    vi.advanceTimersByTime(1250);
    expect(document.querySelector(".journeyCurtain")).toBeNull();
  });
  it("uses the same warp for opening the map, and never stacks two", () => {
    const a = boot(canonical, false);
    a.go("map"); a.go("home"); a.go("map");
    expect(document.querySelectorAll(".journeyCurtain")).toHaveLength(1);
    expect(document.querySelector(".journeyCurtain strong")!.textContent).toBe("マップを ひらくよ！");
  });
  it("is skipped entirely for reduced motion", async () => {
    const a = boot(standalone, true); await vi.advanceTimersByTimeAsync(0);
    document.querySelector<HTMLButtonElement>('[data-action="poster-start"]')!.click();
    expect(a.state.view).toBe("learning");
    expect(document.querySelector(".journeyCurtain")).toBeNull();
  });
  it("does not play when settings opens the learning home (not a departure from the title)", async () => {
    const a = boot(standalone, false); await vi.advanceTimersByTimeAsync(0);
    a.go("settings");
    document.querySelector<HTMLButtonElement>('[data-action="learning-home"]')!.click();
    expect(a.state.view).toBe("learning");
    expect(document.querySelector(".journeyCurtain")).toBeNull();
  });
  it("lets taps through and is drawn with fixed, stable stripes", () => {
    for (const html of [canonical, standalone]) {
      const css = html.slice(0, html.indexOf("</head>"));
      expect(css).toMatch(/\.journeyCurtain\{[^}]*pointer-events:none/);
    }
    boot(canonical, false); api().go("map"); const first = document.querySelector(".warpStripes")!.innerHTML;
    api().go("home"); api().go("map");
    expect(document.querySelector(".warpStripes")!.innerHTML).toBe(first);
  });
});
