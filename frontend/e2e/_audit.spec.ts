/**
 * 横断の棚卸し。**目で見る前に、測れることを全部測る。**
 *
 * 診断・Day1・Day2 を4つの持ち方で通し、画面ごとに次を記録する。
 *
 *   はみ出し（横・縦）／入れ子の送り／重なり（文字・押し場所）
 *   固定配置の競合／帯の二重／Safe Area の二重・漏れ
 *   選ぶ前後のずれ／画面が変わる瞬間の古い文字
 *
 * CI では回さない（`_` 始まりは `playwright.config.ts` が外す）。
 */

import { test, type Page } from "@playwright/test";

import { openLessonById } from "./support/openLesson";
import { stubApi } from "./support/stubApi";
import { dismissLessonIntro } from "./support/lessonIntro";

const SIZES: [number, number][] = [
  [320, 568],
  [375, 667],
  [390, 844],
  [430, 932],
];

const MY_TEXT =
  "来月の全社会議について、各部門から出た意見をまとめました。" +
  "営業部は資料の共有方法を変えたいと述べ、管理部は開催時間の短縮を求めています。" +
  "企画部からは事前アンケートの実施案が出ました。次回までに方針を決める必要があります。";

/** いま出ている画面の、測れること全部。 */
async function measure(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const out: Record<string, unknown> = {};

    out.wide = root.scrollWidth - root.clientWidth;
    out.pageOver = root.scrollHeight - root.clientHeight;

    const stage = document.querySelector("[data-testid='step-stage']");
    out.stageOver = stage ? stage.scrollHeight - stage.clientHeight : 0;

    /* 入れ子の送り。textarea は本人が書く場所なので外す */
    const nested: string[] = [];
    for (const el of document.querySelectorAll("main *, [role='dialog'] *")) {
      if (el.tagName === "TEXTAREA") continue;
      if (el.getAttribute("data-testid") === "step-stage") continue;
      const style = getComputedStyle(el);
      if (!/auto|scroll/.test(style.overflowY)) continue;
      if (el.scrollHeight > el.clientHeight + 1) {
        nested.push(el.getAttribute("data-testid") ?? el.tagName);
      }
    }
    out.nested = nested;

    /* 覆われている押し場所（閉じた details と、送る先は除く） */
    const covered: string[] = [];
    for (const el of document.querySelectorAll(
      "main button:not([disabled]), main a[href], [role='dialog'] button:not([disabled])",
    )) {
      if (!el.checkVisibility()) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      if (y < 0 || y > window.innerHeight) continue;
      const scroller = el.closest("[data-testid='step-stage']");
      if (scroller) {
        const view = scroller.getBoundingClientRect();
        if (y < view.top || y > view.bottom) continue;
      }
      const top = document.elementFromPoint(x, y);
      if (top && !el.contains(top) && !top.contains(el)) {
        covered.push(`${(el.textContent ?? "").trim().slice(0, 10)}<-${top.tagName}.${String(top.className).slice(0, 20)}`);
      }
    }
    out.covered = covered;

    /*
      文字どうしの重なり。葉の要素だけを見る。

      3つ、外すものがある。どれも**測り方の癖**で、画面の崩れではない。

      1. 描かれていないもの（`checkVisibility`）。閉じた `<details>` の
         中身は、Chromium では箱を持ったまま描かれない（`contain: size`
         の中に居るので、親は畳んだ高さを返し、子は実寸を返す）。
         見出しの上にたたんだ一覧があると、**毎画面**それと見出しが
         重なって見える——`e2e/_probe.spec.ts` で確かめた。
      2. 折り返した行。`getBoundingClientRect` は行の**合併**を返すので、
         「ラベル：」と「値」が2行に折れただけで重なりになる。
         行の箱（`getClientRects`）どうしで見る。
      3. 送り枠の外。`step-stage` は送れる枠なので、その外にある子は
         切られて見えない。枠で切ってから比べる。
    */
    /** 先祖の切り取り枠を全部かける。見えている形だけを残す。 */
    const viewOf = (el: Element) => {
      let box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      for (let at = el.parentElement; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (style.overflowX === "visible" && style.overflowY === "visible") continue;
        const frame = at.getBoundingClientRect();
        box = {
          left: Math.max(box.left, frame.left),
          top: Math.max(box.top, frame.top),
          right: Math.min(box.right, frame.right),
          bottom: Math.min(box.bottom, frame.bottom),
        };
      }
      return box;
    };
    const boxesOf = (el: Element) => {
      const view = viewOf(el);
      return [...el.getClientRects()]
        .map((box) => ({
          left: Math.max(box.left, view.left),
          right: Math.min(box.right, view.right),
          top: Math.max(box.top, view.top),
          bottom: Math.min(box.bottom, view.bottom),
        }))
        .filter((box) => box.right - box.left > 1 && box.bottom - box.top > 1);
    };
    const leaves = [...document.querySelectorAll("main *, [role='dialog'] *")].filter(
      (el) =>
        el.children.length === 0 &&
        (el.textContent ?? "").trim().length > 0 &&
        el.checkVisibility(),
    );
    const overlaps: string[] = [];
    const boxes = leaves.map(boxesOf);
    for (let i = 0; i < leaves.length; i += 1) {
      for (let j = i + 1; j < leaves.length; j += 1) {
        if (leaves[i].contains(leaves[j]) || leaves[j].contains(leaves[i])) continue;
        let worst = 0;
        for (const a of boxes[i]) {
          for (const b of boxes[j]) {
            const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (x > 2 && y > 2) worst = Math.max(worst, y);
          }
        }
        if (worst > 0) {
          overlaps.push(
            `${(leaves[i].textContent ?? "").trim().slice(0, 8)}×${(leaves[j].textContent ?? "").trim().slice(0, 8)}(${Math.round(worst)}px)`,
          );
        }
      }
    }
    out.overlaps = [...new Set(overlaps)].slice(0, 4);

    /*
      切り落とされている文字。

      `overflow: hidden` の先祖に切られているものは、**送っても出てこない**
      ——読む手立てがそもそも無い。送れる枠（`auto`/`scroll`）に隠れて
      いるだけのものは、ここには数えない。
    */
    const cut: string[] = [];
    for (const el of leaves) {
      let hidden = false;
      for (let at = el.parentElement; at; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (style.overflowY === "hidden" || style.overflowX === "hidden") hidden = true;
        if (/auto|scroll/.test(style.overflowY) || /auto|scroll/.test(style.overflowX)) {
          hidden = false;
          break;
        }
      }
      if (!hidden) continue;
      const laid = el.getBoundingClientRect();
      /* 読み上げ専用（`sr-only`）は 1px の箱。切れているのが正しい姿 */
      if (laid.height < 4 || laid.width < 4) continue;
      const shown = boxesOf(el).reduce(
        (total, box) => total + (box.bottom - box.top) * (box.right - box.left),
        0,
      );
      const lost = 1 - shown / (laid.height * Math.max(laid.width, 1));
      if (lost > 0.15) {
        cut.push(`${(el.textContent ?? "").trim().slice(0, 10)}(${Math.round(lost * 100)}%)`);
      }
    }
    out.cut = [...new Set(cut)].slice(0, 4);

    /* 固定配置。数と、下端どうしの重なり */
    const fixed = [...document.querySelectorAll("body *")].filter(
      (el) => getComputedStyle(el).position === "fixed",
    );
    out.fixed = fixed.map(
      (el) => el.getAttribute("data-testid") ?? `${el.tagName}.${String(el.className).slice(0, 18)}`,
    );

    /* 帯の二重 */
    out.headers = document.querySelectorAll("[data-testid='lesson-header']").length;
    out.shells = document.querySelectorAll("[data-testid='step-shell']").length;

    /* Safe Area を読んでいる要素の数（二重適用の手がかり） */
    const safe = [...document.querySelectorAll("body *")].filter((el) => {
      const s = getComputedStyle(el);
      return [s.paddingBottom, s.paddingTop, s.marginBottom, s.height].some((v) =>
        String(v).includes("env("),
      );
    });
    out.safeAreaUsers = safe.length;

    /* 押し場所の下端が画面の中にあるか */
    const cta = document.querySelector("[data-testid='primary-action']");
    if (cta) {
      const box = cta.getBoundingClientRect();
      out.ctaBottomGap = Math.round(window.innerHeight - box.bottom);
      out.ctaTop = Math.round(box.top);
    }
    return out;
  });
}

/** 1画面ぶんの記録を1行にする。問題のあるものだけ。 */
function line(tag: string, index: number, title: string, m: Record<string, any>) {
  const bad: string[] = [];
  if (m.wide > 1) bad.push(`横+${m.wide}`);
  if (m.pageOver > 1) bad.push(`ページ+${m.pageOver}`);
  if (m.stageOver > 8) bad.push(`中身+${m.stageOver}`);
  if (m.nested?.length) bad.push(`入れ子送り=${m.nested.join("/")}`);
  if (m.covered?.length) bad.push(`覆い=${m.covered.join("/")}`);
  if (m.overlaps?.length) bad.push(`重なり=${m.overlaps.join("/")}`);
  if (m.cut?.length) bad.push(`切れ=${m.cut.join("/")}`);
  if (m.headers > 1) bad.push(`帯×${m.headers}`);
  if (m.shells > 1) bad.push(`柱×${m.shells}`);
  if (typeof m.ctaBottomGap === "number" && m.ctaBottomGap < 0)
    bad.push(`CTAが画面外 ${m.ctaBottomGap}`);
  if (!bad.length) return null;
  return `${tag} ${String(index).padStart(2, "0")} 「${title}」 ${bad.join(" | ")}`;
}

async function advance(page: Page) {
  const primary = page.getByTestId("primary-action").first();
  if (!(await primary.count())) return false;
  if ((await primary.getAttribute("aria-disabled")) === "true") {
    const box = page.locator("textarea:visible").first();
    if (await box.count()) await box.fill(MY_TEXT);
    else {
      const parts = page.getByTestId("assemble-part");
      const count = await parts.count();
      if (count > 0) {
        for (let i = 0; i < count; i += 1) {
          const part = parts.nth(i);
          if (await part.locator("[aria-pressed='true']").count()) continue;
          await part.getByTestId("assemble-choice").first().click();
        }
      } else {
        const choice = page.locator("main [aria-pressed]").first();
        if (await choice.count()) await choice.click();
      }
    }
    await page.waitForTimeout(200);
  }
  await primary.click({ force: true });
  await page.waitForTimeout(450);
  return true;
}

async function walk(page: Page, tag: string, found: string[]) {
  for (let index = 0; index < 34; index += 1) {
    const title = (await page.locator("h1").first().innerText().catch(() => ""))
      .replace(/\s+/g, "")
      .slice(0, 16);
    const m = await measure(page);
    const row = line(tag, index, title, m);
    if (row) found.push(row);
    if (await page.getByTestId("completion-view").count()) break;
    if (!(await advance(page))) break;
  }
}

async function openHome(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  const start = page.getByTestId("welcome-guest");
  if (await start.count()) await start.click();
  await page.getByTestId("tab-bar").waitFor();
}

test.describe("棚卸し", () => {
  test.setTimeout(300_000);

  for (const [width, height] of SIZES) {
    test(`診断 ${width}×${height}`, async ({ page }) => {
      const found: string[] = [];
      await page.setViewportSize({ width, height });
      try {
        await stubApi(page);
        await openHome(page);
        const m = await measure(page);
        const row = line("HOME", 0, "ホーム", m);
        if (row) found.push(row);

        await page.getByRole("button", { name: "コース" }).first().click();
        await page.getByTestId("current-course-open").click();
        await page.getByTestId("lesson-diagnosis").first().click();
        await dismissLessonIntro(page);
        await walk(page, "診断", found);
      } finally {
        console.error(`\n===== 診断 ${width}×${height} =====`);
        console.error(found.length ? found.join("\n") : "（指摘なし）");
      }
    });

    test(`Day1 ${width}×${height}`, async ({ page }) => {
      const found: string[] = [];
      await page.setViewportSize({ width, height });
      try {
        await stubApi(page);
        await openHome(page);
        await page.getByTestId("continue-lesson").click();
        await dismissLessonIntro(page);
        await walk(page, "Day1", found);
      } finally {
        console.error(`\n===== Day1 ${width}×${height} =====`);
        console.error(found.length ? found.join("\n") : "（指摘なし）");
      }
    });

    test(`Day2 ${width}×${height}`, async ({ page }) => {
      const found: string[] = [];
      await page.setViewportSize({ width, height });
      try {
        await stubApi(page, { result: () => "・要点1\n・要点2\n・要点3" });
        await openLessonById(page, "summarize_text");
        await walk(page, "Day2", found);
      } finally {
        console.error(`\n===== Day2 ${width}×${height} =====`);
        console.error(found.length ? found.join("\n") : "（指摘なし）");
      }
    });
  }
});
