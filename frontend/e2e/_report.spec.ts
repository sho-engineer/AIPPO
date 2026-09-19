/**
 * 実機の指摘を、同じ持ち方で確かめる。
 *
 * 報告は iPhone の Safari（上に Dynamic Island、下にアドレスバー）。
 * 見える高さはそのぶん縮むので、そこに合わせて測る。
 */

import { test, type Page } from "@playwright/test";

import { openLessonById } from "./support/openLesson";
import { stubApi } from "./support/stubApi";

/** iPhone 15 Pro / 16 の Safari。上下の帯が出ている状態。 */
const SIZES: { name: string; width: number; height: number }[] = [
  { name: "393×659（Safari 帯あり）", width: 393, height: 659 },
  { name: "393×727", width: 393, height: 727 },
  { name: "390×664", width: 390, height: 664 },
];

const MY_TEXT = "来月の全社会議について、各部門から出た意見をまとめました。";

async function fill(page: Page) {
  const primary = page.getByTestId("primary-action").first();
  if ((await primary.getAttribute("aria-disabled")) !== "true") return;
  const box = page.locator("textarea:visible").first();
  if (await box.count()) {
    await box.fill(MY_TEXT);
    return;
  }
  const parts = page.getByTestId("assemble-part");
  const count = await parts.count();
  if (count > 0) {
    for (let at = 0; at < count; at += 1) {
      const part = parts.nth(at);
      if (await part.locator("[aria-pressed='true']").count()) continue;
      await part.getByTestId("assemble-choice").first().click();
    }
    return;
  }
  const choice = page.locator("main [aria-pressed]").first();
  if (await choice.count()) await choice.click();
}

async function forward(page: Page) {
  await fill(page);
  await page.getByTestId("primary-action").first().click({ force: true });
  await page.waitForTimeout(400);
}

/** 描かれている文字どうしの重なりと、大きな空きを測る。 */
async function look(page: Page) {
  return page.evaluate(() => {
    const view = (el: Element) => {
      let box = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
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
    const boxes = (el: Element) => {
      const clip = view(el);
      return [...el.getClientRects()]
        .map((box) => ({
          left: Math.max(box.left, clip.left),
          right: Math.min(box.right, clip.right),
          top: Math.max(box.top, clip.top),
          bottom: Math.min(box.bottom, clip.bottom),
        }))
        .filter((box) => box.right - box.left > 1 && box.bottom - box.top > 1);
    };
    const leaves = [...document.querySelectorAll("main *")].filter(
      (el) =>
        el.children.length === 0 &&
        (el.textContent ?? "").trim().length > 0 &&
        el.checkVisibility(),
    );
    const overlaps: string[] = [];
    const all = leaves.map(boxes);
    for (let i = 0; i < leaves.length; i += 1) {
      for (let j = i + 1; j < leaves.length; j += 1) {
        if (leaves[i].contains(leaves[j]) || leaves[j].contains(leaves[i])) continue;
        let worst = 0;
        for (const a of all[i]) {
          for (const b of all[j]) {
            const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (x > 2 && y > 2) worst = Math.max(worst, y);
          }
        }
        if (worst > 0) {
          overlaps.push(
            `${(leaves[i].textContent ?? "").trim().slice(0, 9)}×${(leaves[j].textContent ?? "").trim().slice(0, 9)}(${Math.round(worst)})`,
          );
        }
      }
    }

    /* いちばん大きな縦の空き。送り枠の中で、隣り合う中身のすきま */
    const stage = document.querySelector("[data-testid='step-stage']");
    let gap = 0;
    let where = "";
    if (stage) {
      const rows = [...stage.querySelectorAll("*")]
        .filter((el) => el.checkVisibility() && (el.textContent ?? "").trim())
        .map((el) => ({ el, box: el.getBoundingClientRect() }))
        .filter((one) => one.box.height > 4);
      for (let i = 0; i < rows.length; i += 1) {
        const next = rows.find((one) => one.box.top >= rows[i].box.bottom - 1);
        if (!next) continue;
        const space = next.box.top - rows[i].box.bottom;
        if (space > gap) {
          gap = space;
          where = `${(rows[i].el.textContent ?? "").trim().slice(0, 10)} ↓ ${(next.el.textContent ?? "").trim().slice(0, 10)}`;
        }
      }
    }
    return {
      overlaps: [...new Set(overlaps)].slice(0, 4),
      stageOver: stage ? stage.scrollHeight - stage.clientHeight : 0,
      gap: Math.round(gap),
      where,
      stamps: document.querySelectorAll("[data-testid='course-stamps']").length,
      stampText: (document.querySelector("main")?.innerText ?? "").includes("スタンプ"),
    };
  });
}

test.describe("実機の指摘", () => {
  test.setTimeout(240_000);

  for (const size of SIZES) {
    test(`Day1 を通して測る（${size.name}）`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await stubApi(page);
      await openLessonById(page, "rewrite_text");

      const rows: string[] = [];
      for (let at = 0; at < 26; at += 1) {
        const title = (await page.locator("h1").first().innerText().catch(() => ""))
          .replace(/\s+/g, "")
          .slice(0, 14);
        const seen = await look(page);
        const bad: string[] = [];
        if (seen.overlaps.length) bad.push(`重なり=${seen.overlaps.join("/")}`);
        if (seen.stageOver > 8) bad.push(`中身+${seen.stageOver}`);
        if (seen.gap > 56) bad.push(`空き ${seen.gap}px（${seen.where}）`);
        if (seen.stamps || seen.stampText) bad.push("スタンプ有り");
        if (bad.length) rows.push(`${String(at).padStart(2, "0")}「${title}」 ${bad.join(" | ")}`);
        if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) break;
        await forward(page);
      }
      console.error(`\n===== ${size.name} =====`);
      console.error(rows.length ? rows.join("\n") : "（指摘なし）");
    });
  }

  test("「自分で指定する」を選んだときの、伝え方の画面", async ({ page }) => {
    /*
      実機の報告では、ここで「現在の指示」の面が下で切れていた。
      自由入力の欄が増えるぶん、いちばん背の高くなる組み合わせ。
    */
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await stubApi(page);
      await openLessonById(page, "rewrite_text");

      for (let at = 0; at < 26; at += 1) {
        const title = (await page.locator("h1").first().innerText().catch(() => ""))
          .replace(/\s+/g, "");
        if (title.startsWith("どんな伝え方にしますか")) break;
        await forward(page);
      }
      const free = page.getByRole("button", { name: "自分で指定する" });
      if (!(await free.count())) {
        console.error(`${size.name}: 「自分で指定する」が無い`);
        continue;
      }
      await free.click();
      await page.waitForTimeout(400);

      const seen = await look(page);
      console.error(
        `${size.name}: 中身+${seen.stageOver}` +
          ` / 重なり=${seen.overlaps.join("/") || "なし"}` +
          ` / 空き ${seen.gap}px（${seen.where}）`,
      );
    }
  });
});
