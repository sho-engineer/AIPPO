import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import canonical from "../src/kids/learning.html?raw";
import standalone from "../public/kids-title/index.html?raw";

// The outside of the app (aippo.jp serves public/kids-title/ as the site root):
// icons, share preview, 404, help/contact, page titles and in-app messages.
const kidsTitleDir = resolve(process.cwd(), "public/kids-title");
const inKidsTitle = (name: string) => join(kidsTitleDir, name);
type Api = { state: { view: string; quest: number }; quests: { short: string }[]; go(v: string): void; enterQuest(n: number): void };
const api = () => (window as unknown as { AIPPO_TEST: Api }).AIPPO_TEST;
const click = (s: string) => { const b = document.querySelector<HTMLElement>(s); expect(b, s).not.toBeNull(); b!.click(); };
function boot(source = canonical) {
  document.body.innerHTML = '<div id="app"></div>';
  window.eval(source.match(/<script>([\s\S]*?)<\/script>/)![1]);
  return api();
}
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("aippo_title_opening_v1", "seen");
  localStorage.setItem("aippo_kids_settings_v1", JSON.stringify({ guardianAccepted: true, challengeMode: "guided", readingSupport: "on" }));
  vi.useFakeTimers(); vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => { throw new Error("not json"); } }));
});
afterEach(() => {
  document.querySelector<HTMLButtonElement>("[data-opening-skip]")?.click();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); document.body.innerHTML = "";
});

describe("Kids site shell", () => {
  it.each([["canonical", canonical], ["standalone", standalone]])("%s head links icons, manifest and a Kids share preview", (_, html) => {
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain('rel="icon" href="favicon.ico"');
    expect(head).toContain('rel="apple-touch-icon" href="apple-touch-icon.png"');
    expect(head).toContain('rel="manifest" href="manifest.webmanifest"');
    expect(head).toContain('property="og:image" content="https://aippo.jp/og-kids.jpg"');
    expect(head).toContain('name="twitter:card" content="summary_large_image"');
    // The adult-app share image says "AIが気になる…人へ" and must not be reused for Kids.
    expect(head).not.toContain("ogp.png");
  });
  it("ships every file the head and 404 page point to next to the standalone page", () => {
    for (const name of ["favicon.ico", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "manifest.webmanifest", "og-kids.jpg", "404.html"]) {
      expect(existsSync(inKidsTitle(name)), name).toBe(true);
    }
    const manifest = JSON.parse(readFileSync(inKidsTitle("manifest.webmanifest"), "utf8"));
    // iOS keeps a separate storage for standalone home-screen apps; Kids records
    // are device-local, so the icon must open the same browser storage.
    expect(manifest.display).toBe("browser");
    for (const icon of manifest.icons) expect(existsSync(inKidsTitle(icon.src)), icon.src).toBe(true);
  });
  it("404 page uses root paths, offers the way back and stays out of search results", () => {
    const page = readFileSync(inKidsTitle("404.html"), "utf8");
    expect(page).toContain('<html lang="ja">');
    expect(page).toContain('name="robots" content="noindex"');
    expect(page).toContain('href="/"');
    expect(page).toMatch(/src="\/assets\/po\/[a-z]+\.webp"/);
    for (const src of page.matchAll(/src="\/([^"]+)"/g)) expect(existsSync(inKidsTitle(src[1])), src[1]).toBe(true);
    expect(page).toContain("mailto:support@aippo.jp");
  });
  it("names each screen in the tab title so history and bookmarks are distinguishable", () => {
    const a = boot();
    expect(document.title).toContain("AIPPO Kids");
    a.go("map"); expect(document.title).toBe("ぼうけんマップ | AIPPO Kids");
    a.go("settings"); expect(document.title).toBe("保護者向け設定 | AIPPO Kids");
    a.enterQuest(0); expect(document.title).toBe(`${a.quests[0].short} | AIPPO Kids`);
  });
  it("offers FAQ and contact from guardian settings, with a close button that is always reachable", () => {
    const a = boot(); a.go("settings");
    const contact = document.querySelector<HTMLAnchorElement>('a.settingAction[href^="mailto:"]');
    expect(contact!.href).toBe("mailto:support@aippo.jp");
    click('[data-action="faq"]');
    const dialog = document.querySelector('[aria-labelledby="faq-title"]')!;
    expect(dialog.textContent).toContain("料金");
    expect(dialog.textContent).toContain("このブラウザの中だけ");
    expect(dialog.textContent).toContain("外部のAIには送信しません");
    // No claims about paid plans or sync that do not exist.
    expect(dialog.textContent).not.toMatch(/有料プラン|月額|同期できます/);
    expect(document.activeElement).toBe(dialog.querySelector("[data-close]"));
    click('[aria-labelledby="faq-title"] [data-close]');
    expect(document.querySelector('[aria-labelledby="faq-title"]')).toBeNull();
  });
  it("confirms an export with a message that stays on the settings screen", () => {
    const a = boot(); a.go("settings");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
    HTMLAnchorElement.prototype.click = () => {};
    click('[data-action="export"]');
    vi.advanceTimersByTime(3000);
    expect(document.querySelector(".exportStatus")!.textContent).toContain("書き出しました");
  });
  it("explains form problems in the page instead of relying on browser bubbles", async () => {
    boot(standalone); await vi.advanceTimersByTimeAsync(0);
    click('[data-action="poster-login"]');
    expect(document.querySelector("#account-form")!.hasAttribute("novalidate")).toBe(true);
    // The reset path is listed first and labelled plainly.
    expect(document.querySelector('.accountLinks button')!.textContent).toBe("パスワードを忘れた方はこちら");
    click(".accountSubmit");
    expect(document.querySelector(".accountAlert")!.textContent).toBe("メールアドレスを入力してください。");
    (document.querySelector<HTMLInputElement>('input[name="email"]')!).value = "not-an-email";
    click(".accountSubmit");
    expect(document.querySelector(".accountAlert")!.textContent).toContain("メールアドレスの形");
    click('[data-authmode="signup"]');
    (document.querySelector<HTMLInputElement>('input[name="email"]')!).value = "parent@example.com";
    (document.querySelector<HTMLInputElement>('input[name="password"]')!).value = "short";
    (document.querySelector<HTMLInputElement>('input[name="confirm"]')!).value = "short";
    click(".accountSubmit");
    expect(document.querySelector(".accountAlert")!.textContent).toBe("パスワードは8文字以上にしてください。");
  });
});
