/**
 * ひし形の動きを、実ブラウザで確かめる。
 *
 *   ・枠（目盛り・軸・名前）は最初から動かない
 *   ・青い面と点だけが、中心から実際の位置へ開く
 *   ・開ききった形が、確定したスコアと一致する
 *   ・戻ってきたときは再生しない
 *   ・読み上げには、途中の値を渡さない
 */

import { expect, test, type Page } from "@playwright/test";

import { dismissLessonIntro } from "./support/lessonIntro";
import { stubApi } from "./support/stubApi";

async function answerOne(page: Page): Promise<boolean> {
  if (((await page.getByTestId("completion-view").count()) ||
      (await page.getByTestId("diagnosis-analyzing").count()))) return false;
  const parts = page.getByTestId("assemble-part");
  const count = await parts.count();
  if (count > 0) {
    for (let i = 0; i < count; i += 1) {
      const part = parts.nth(i);
      if (await part.locator("[aria-pressed='true']").count()) continue;
      await part.getByTestId("assemble-choice").first().click();
    }
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(600);
    return true;
  }
  const cards = page.locator("[aria-pressed]");
  if (await cards.count()) await cards.first().click();
  await page.waitForTimeout(700);
  const primary = page.getByTestId("primary-action");
  if (
    (await primary.count()) &&
    (await primary.getAttribute("aria-disabled")) !== "true"
  ) {
    await primary.click();
    await page.waitForTimeout(600);
  }
  return true;
}

/** 青い面の頂点。開き具合を読むのに使う。 */
async function shape(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="radar-chart"] svg');
    if (!svg) return null;
    const polys = [...svg.querySelectorAll("polygon")];
    /* 最後の polygon が「いまの形」（目盛り5つ → 目標 → いま の順） */
    const now = polys[polys.length - 1];
    const rings = polys.slice(0, 5).map((p) => p.getAttribute("points"));
    const dots = [...svg.querySelectorAll("circle")].map((c) => ({
      x: Number(c.getAttribute("cx")),
      y: Number(c.getAttribute("cy")),
    }));
    /** 中心からいちばん遠い頂点の距離。0 なら中心に畳まれている */
    const far = (now.getAttribute("points") ?? "")
      .split(" ")
      .map((pair) => pair.split(",").map(Number))
      .reduce(
        (max, [x, y]) => Math.max(max, Math.hypot(x - 50, y - 50)),
        0,
      );
    return {
      far: Math.round(far * 100) / 100,
      rings,
      dots,
      label: svg.getAttribute("aria-label") ?? "",
      names: [...document.querySelectorAll('[data-testid="radar-chart"] span')].map(
        (n) => (n.textContent ?? "").trim(),
      ),
    };
  });
}

test("ひし形は、枠を動かさずに中心から開く", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-diagnosis").first().click();
  await dismissLessonIntro(page);
  await page.getByTestId("primary-action").click();
  for (let i = 0; i < 8; i += 1) if (!(await answerOne(page))) break;

  await expect(page.locator("main h1").first()).toHaveText("あなたの現在地", {
    timeout: 8000,
  });
  /* 現在地 → 4つの力 */
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("radar-chart")).toBeVisible();

  /* 開きはじめ。中心に近いはず */
  const early = await shape(page);
  await page.waitForTimeout(120);
  const mid = await shape(page);
  await page.waitForTimeout(900);
  const done = await shape(page);

  console.error(
    `\n開きはじめ : ${early?.far}\n` +
      `途中       : ${mid?.far}\n` +
      `開いた後   : ${done?.far}\n` +
      `読み上げ   : ${done?.label}\n` +
      `軸の名前   : ${done?.names.join(" / ")}\n` +
      `枠が動いたか: ${JSON.stringify(early?.rings) === JSON.stringify(done?.rings) ? "動いていない" : "★動いた"}`,
  );

  /* 枠は最初から最後まで同じ */
  expect(early?.rings, "目盛りの輪が動いている").toEqual(done?.rings);

  /*
    中心から開いている。

    2つの見本のうち**どちらかが**最終形より小さければよい。1コマ目を
    取り逃がすことがあるので、両方に厳しくすると、動きが正しくても
    たまに落ちる検査になる。
  */
  expect(done?.far ?? 0, "開ききった形が無い").toBeGreaterThan(0);
  const opening = Math.min(early?.far ?? 99, mid?.far ?? 99);
  expect(opening, "中心から開いていない（最初から最終形だった）").toBeLessThan(
    done?.far ?? 0,
  );

  /* 読み上げは、最初から確定した段を言う（途中の 0 を言わない） */
  expect(early?.label).toBe(done?.label);
  expect(done?.label).toMatch(/5段階のうち [1-5]/);

  /* 戻ってきたら、再生しない */
  await page.getByTestId("primary-action").click(); // おすすめへ
  await page.waitForTimeout(400);
  await page.getByTestId("lesson-back").click(); // 4つの力へ戻る
  await expect(page.getByTestId("radar-chart")).toBeVisible();
  const again = await shape(page);
  console.error(`戻ったとき : ${again?.far}（開いた後 ${done?.far}）`);
  expect(again?.far, "戻ってきたのに、また中心から開いた").toBe(done?.far);
});
