/**
 * 報告された3点を、そのまま再現して数える。
 *
 *   ① 質問3・4で、選ぶとUIの位置が動く
 *   ② 診断中の画面が、すぐ終わる
 *   ③ 結果によっては、結果ページが縦に送れる
 *
 * **レイアウトが動いたのか、送られたのかを分ける。** 送り位置が変われば
 * 画面上の座標は全部ずれるので、`getBoundingClientRect` だけ見ていると
 * どちらも「動いた」に見える。送り位置を引いた座標（＝中身の中での
 * 位置）も一緒に出す。
 *
 * この道具の落とし穴
 * ------------------
 * `cy` は `step-stage` の送り量を足し戻した値だが、**下のCTAは
 * `step-stage` の外に居る**。外の要素に `cy` を当てると、動いていない
 * ものが動いたように出る——320 で観測した 0→38px はこれだった。
 * 送られたかどうかを疑うときは `_repro3.spec.ts` の、送らずに押す
 * （`dispatchEvent`）ほうで確かめること。
 */

import { test, type Page } from "@playwright/test";

import { dismissLessonIntro } from "./support/lessonIntro";
import { stubApi } from "./support/stubApi";

const SIZES = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

/** 画面上の座標と、送りを引いた座標の両方。 */
async function frame(page: Page) {
  return page.evaluate(() => {
    const stage = document.querySelector('[data-testid="step-stage"]');
    const top = stage?.scrollTop ?? 0;
    const box = (node: Element) => {
      const r = node.getBoundingClientRect();
      return {
        y: Math.round(r.y * 100) / 100,
        /** 送りを足し戻した位置。**中身の中での座標** */
        cy: Math.round((r.y + top) * 100) / 100,
        x: Math.round(r.x * 100) / 100,
        w: Math.round(r.width * 100) / 100,
        h: Math.round(r.height * 100) / 100,
      };
    };
    const one = (sel: string) => {
      const n = document.querySelector(sel);
      return n ? box(n) : null;
    };
    return {
      scrollTop: Math.round(top),
      scrollable: stage ? stage.scrollHeight - stage.clientHeight : 0,
      title: one("main h1"),
      desc: one('[data-testid="po-hero"] p'),
      body: one('[data-testid="assemble"]'),
      cta: one('[data-testid="primary-action"]'),
      hintBox: one('[data-testid="step-hint"]')
        ? box(document.querySelector('[data-testid="step-hint"]')!.parentElement!)
        : null,
      legends: [...document.querySelectorAll("legend")].map(box),
      chips: [...document.querySelectorAll('[data-testid="assemble-choice"]')].map(
        (n) => ({ t: (n.textContent ?? "").trim().slice(0, 8), ...box(n) }),
      ),
    };
  });
}

type Frame = Awaited<ReturnType<typeof frame>>;

/** 送りを除いた「本当の」移動だけを並べる。 */
function moved(a: Frame, b: Frame): string[] {
  const out: string[] = [];
  const cmp = (name: string, x: Frame["title"], y: Frame["title"]) => {
    if (!x || !y) {
      if (x !== y) out.push(`${name}: ${x ? "消えた" : "現れた"}`);
      return;
    }
    const bits: string[] = [];
    if (x.cy !== y.cy) bits.push(`中身内y ${x.cy}→${y.cy}`);
    if (x.x !== y.x) bits.push(`x ${x.x}→${y.x}`);
    if (x.w !== y.w) bits.push(`w ${x.w}→${y.w}`);
    if (x.h !== y.h) bits.push(`h ${x.h}→${y.h}`);
    if (bits.length) out.push(`${name}: ${bits.join(" / ")}`);
  };
  cmp("見出し", a.title, b.title);
  cmp("説明", a.desc, b.desc);
  cmp("本体", a.body, b.body);
  cmp("CTA", a.cta, b.cta);
  cmp("補助欄", a.hintBox, b.hintBox);
  a.legends.forEach((one, at) => cmp(`枠名${at + 1}`, one, b.legends[at]));
  a.chips.forEach((one, at) => cmp(`札「${one.t}」`, one, b.chips[at]));
  if (a.scrollTop !== b.scrollTop) {
    out.push(`▲送られた: ${a.scrollTop}→${b.scrollTop}px`);
  }
  return out;
}

async function openTo(page: Page, question: number) {
  await stubApi(page);
  await page.goto("/");
  /* 前の回の控えが残っていると、続きの関所が開いて進めない */
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-diagnosis").first().click();
  await dismissLessonIntro(page);
  await page.getByTestId("primary-action").click();
  for (let q = 1; q < question; q += 1) {
    const parts = page.getByTestId("assemble-part");
    const n = await parts.count();
    if (n > 0) {
      for (let i = 0; i < n; i += 1) {
        await parts.nth(i).getByTestId("assemble-choice").first().click();
      }
    } else {
      await page.locator("main [aria-pressed]").first().click();
    }
    await page.waitForTimeout(350);
    await page.getByTestId("primary-action").click();
    await page.waitForTimeout(550);
  }
}

/*
  回ごとに別の検査にする。1つの検査で2回ひらき直すと、**走っている
  ページが控えを書き戻す**ので、消してから読み込み直しても前の回に
  着いてしまった（実際そうなった）。
*/
for (const size of SIZES) {
  for (const q of [3, 4]) {
  test(`① 質問${q}で選ぶと動くか（${size.name}）`, async ({ page }) => {
    const report: string[] = [`\n\n════ ① 質問${q} ${size.name} ════`];

    {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openTo(page, q);
      const heading = (await page.locator("main h1").first().innerText()).trim();
      const first = await frame(page);
      report.push(
        `\n── 質問${q}「${heading.slice(0, 14)}」 送れる量 ${first.scrollable}px`,
      );

      const parts = page.getByTestId("assemble-part");
      const n = await parts.count();

      /* 枠を1つずつ選ぶ */
      for (let i = 0; i < n; i += 1) {
        const before = await frame(page);
        await parts.nth(i).getByTestId("assemble-choice").first().click();
        await page.waitForTimeout(400);
        const bits = moved(before, await frame(page));
        report.push(`  枠${i + 1}を選ぶ → ${bits.length ? "" : "動かない"}`);
        bits.forEach((b) => report.push(`      ${b}`));
      }

      /* 解除（同じ札をもう一度） */
      const off = await frame(page);
      await parts.nth(0).getByTestId("assemble-choice").first().click();
      await page.waitForTimeout(400);
      let bits = moved(off, await frame(page));
      report.push(`  枠1を解除 → ${bits.length ? "" : "動かない"}`);
      bits.forEach((b) => report.push(`      ${b}`));

      /* 選び直し（別の札） */
      const again = await frame(page);
      await parts.nth(0).getByTestId("assemble-choice").last().click();
      await page.waitForTimeout(400);
      bits = moved(again, await frame(page));
      report.push(`  枠1を別の札へ → ${bits.length ? "" : "動かない"}`);
      bits.forEach((b) => report.push(`      ${b}`));
    }

    console.error(report.join("\n"));
  });
  }
}

test("② 診断中の画面が、何ミリ秒出ているか", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTo(page, 5);
  await page.locator("main [aria-pressed]").first().click();
  await page.waitForTimeout(350);

  const started = Date.now();
  await page.getByTestId("primary-action").click();
  await page.waitForSelector('[data-testid="diagnosis-analyzing"]');
  const shown = Date.now();
  await page.waitForSelector('[data-testid="diagnosis-analyzing"]', {
    state: "detached",
    timeout: 15000,
  });
  const gone = Date.now();

  console.error(
    `\n\n════ ② 診断中 ════\n` +
      `  押してから出るまで : ${shown - started}ms\n` +
      `  出ている時間       : ${gone - shown}ms\n` +
      `  合計               : ${gone - started}ms`,
  );
});
