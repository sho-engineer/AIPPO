/**
 * 軽快さと状態のたな卸し。**押して確かめる。**
 *
 * DOM があることと、押して意図どおり動くことは別。ここでは
 *
 *   連打／戻る／Retry／古い応答／生成中の見え方／キーボード／文字拡大
 *
 * を、実際に押して測る。CI では回さない（`_` 始まり）。
 */

import { test, expect, type Page, type Route } from "@playwright/test";

import { openLessonById } from "./support/openLesson";
import { stubApi } from "./support/stubApi";

const MY_TEXT =
  "来月の全社会議について、各部門から出た意見をまとめました。" +
  "営業部は資料の共有方法を変えたいと述べ、管理部は開催時間の短縮を求めています。" +
  "企画部からは事前アンケートの実施案が出ました。次回までに方針を決める必要があります。";

interface Sent {
  at: number;
  input: Record<string, string>;
  requestId: string | null;
}

/**
 * 生成の経路を、こちらで握る。
 *
 * **`stubApi` のあとに登録する**（あとから登録した経路が先に当たる）。
 * 遅さ・失敗・何回来たかを、ここで決める。
 */
async function holdGenerate(
  page: Page,
  options: { delay?: number; fail?: (call: number) => boolean } = {},
): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route("**/api/v1/ai/generate/", async (route: Route) => {
    const body = route.request().postDataJSON() as {
      input?: Record<string, string>;
      request_id?: string;
    };
    const at = sent.length + 1;
    sent.push({
      at,
      input: body.input ?? {},
      requestId: body.request_id ?? null,
    });
    if (options.delay) await new Promise((done) => setTimeout(done, options.delay));
    if (options.fail?.(at)) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail: "いま混み合っています。" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: `【${at}回目】要点をまとめました。\n・要点1\n・要点2\n・要点3`,
        tutor: { message: "見てみよう", emotion: "neutral", action: "review" },
      }),
    });
  });
  return sent;
}

/** 入力や選択を埋めて、送れる状態にする。 */
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

/** AIへ送る回（`step-error` か結果が返るまで）まで進める。 */
async function toSend(page: Page, stopAt = 30) {
  for (let at = 0; at < stopAt; at += 1) {
    const label = await page.getByTestId("primary-action").first().innerText();
    if (/送|まとめ|書き直|つくって|生成/.test(label)) return true;
    await fill(page);
    await page.getByTestId("primary-action").first().click({ force: true });
    await page.waitForTimeout(350);
  }
  return false;
}

test.describe("軽快さと状態", () => {
  test.setTimeout(180_000);

  test("連打しても、送るのは1回だけ", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubApi(page);
    const sent = await holdGenerate(page, { delay: 900 });
    await openLessonById(page, "summarize_text");
    expect(await toSend(page)).toBe(true);

    const primary = page.getByTestId("primary-action").first();
    await primary.click({ force: true });
    await primary.click({ force: true });
    await primary.click({ force: true });
    await page.waitForTimeout(2500);

    console.error(`連打: 送った回数=${sent.length} 合言葉=${sent.map((one) => one.requestId).join(",")}`);
    expect(sent.length, "連打で二重に送っている").toBe(1);
  });

  test("生成中も、画面は白くならない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubApi(page);
    await holdGenerate(page, { delay: 1200 });
    await openLessonById(page, "summarize_text");
    expect(await toSend(page)).toBe(true);

    const title = await page.locator("h1").first().innerText();
    await page.getByTestId("primary-action").first().click({ force: true });
    await page.waitForTimeout(400);

    const during = await page.evaluate(() => {
      const main = document.querySelector("main");
      return {
        text: (main?.innerText ?? "").replace(/\s+/g, "").length,
        heading: document.querySelector("h1")?.textContent ?? "",
        busy: document.querySelector("[data-testid='primary-action']")?.textContent ?? "",
      };
    });
    console.error(`生成中: 文字数=${during.text} 見出し=「${during.heading}」 ボタン=「${during.busy.trim()}」`);
    expect(during.text, "生成中に本文が消えている").toBeGreaterThan(20);
    expect(during.heading, "生成中に見出しが消えている").not.toBe("");
    expect(title).not.toBe("");
  });

  test("失敗しても、入力と条件は残る", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubApi(page);
    const sent = await holdGenerate(page, { fail: (call) => call === 1 });
    await openLessonById(page, "summarize_text");
    expect(await toSend(page)).toBe(true);

    await page.getByTestId("primary-action").first().click({ force: true });
    const retry = page.getByRole("button", { name: "もう一度おくる" });
    const inline = page.getByTestId("step-error");
    await expect(retry.or(inline).first()).toBeVisible({ timeout: 8000 });

    if (await retry.count()) await retry.click();
    else await page.getByTestId("primary-action").first().click({ force: true });
    await page.waitForTimeout(1500);

    console.error(
      `失敗のあと: 送った回数=${sent.length}\n` +
        sent
          .map((one) => `  ${one.at}回目 ${JSON.stringify(one.input).slice(0, 120)}`)
          .join("\n"),
    );
    expect(sent.length, "もう一度が届いていない").toBe(2);
    expect(
      JSON.stringify(sent[1].input),
      "もう一度で、送る中身が変わっている",
    ).toBe(JSON.stringify(sent[0].input));
  });

  test("戻っても、同じ生成をやり直さない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubApi(page);
    const sent = await holdGenerate(page);
    await openLessonById(page, "summarize_text");
    expect(await toSend(page)).toBe(true);

    await page.getByTestId("primary-action").first().click({ force: true });
    await page.waitForTimeout(1200);
    const after = sent.length;

    // 結果を見てから1歩戻り、もう一度進む
    await page.getByTestId("lesson-back").click();
    await page.waitForTimeout(600);
    await page.getByTestId("primary-action").first().click({ force: true });
    await page.waitForTimeout(1200);

    console.error(`戻って進む: 送った回数 ${after} → ${sent.length}`);
    expect(sent.length, "戻って進んだだけで、もう一度送っている").toBe(after);
  });

  test("キーボードが出ても、入力欄と「次へ」が同時に見える", async ({ page }) => {
    /*
      ソフトキーボードは Playwright では出せない。**同じことが起きる
      条件**——見える高さがキーボードのぶん縮む——を作って測る。
      `interactive-widget=resizes-content` を宣言してあるので、実機でも
      `100dvh` がこの高さまで縮む。
    */
    await stubApi(page);
    await openLessonById(page, "summarize_text");
    for (const size of [
      { width: 320, height: 568, keyboard: 216 },
      { width: 375, height: 667, keyboard: 216 },
      { width: 390, height: 844, keyboard: 291 },
      { width: 430, height: 932, keyboard: 302 },
    ]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      // 自分の文章を書く回まで進む
      for (let at = 0; at < 30; at += 1) {
        if (await page.locator("textarea:visible").count()) break;
        await fill(page);
        await page.getByTestId("primary-action").first().click({ force: true });
        await page.waitForTimeout(300);
      }
      if (!(await page.locator("textarea:visible").count())) continue;

      await page.setViewportSize({
        width: size.width,
        height: size.height - size.keyboard,
      });
      await page.locator("textarea:visible").first().click();
      await page.waitForTimeout(300);

      const view = await page.evaluate(() => {
        const at = (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const box = el.getBoundingClientRect();
          return `${Math.round(box.top)}〜${Math.round(box.bottom)}(高さ${Math.round(box.height)})`;
        };
        const box = [...document.querySelectorAll("textarea")].find((one) =>
          one.checkVisibility(),
        );
        const cta = document.querySelector("[data-testid='primary-action']");
        const b = box?.getBoundingClientRect();
        const c = cta?.getBoundingClientRect();
        const shell = document.querySelector("[data-testid='step-shell']");
        return {
          height: window.innerHeight,
          dvh: getComputedStyle(shell ?? document.body).height,
          page: document.documentElement.scrollHeight,
          scrolled: Math.round(window.scrollY),
          shell: at("[data-testid='step-shell']"),
          header: at("[data-testid='lesson-header']"),
          stage: at("[data-testid='step-stage']"),
          shells: document.querySelectorAll("[data-testid='step-shell']").length,
          areas: document.querySelectorAll("textarea").length,
          po: document.querySelectorAll("[data-testid='po-hero'] [data-po-scene]").length,
          parts: [
            ...(document.querySelector("[data-testid='step-shell']")?.children ?? []),
          ].flatMap((el) => {
            const b = el.getBoundingClientRect();
            const own = `${el.getAttribute("data-testid") ?? el.tagName}:${Math.round(b.height)}`;
            const kids = [...el.querySelectorAll(":scope > *, :scope > * > *")]
              .map((one) => {
                const box = one.getBoundingClientRect();
                if (box.height < 4) return "";
                return `  ·${one.tagName}${(one.textContent ?? "").trim().slice(0, 8)}:${Math.round(box.height)}`;
              })
              .filter(Boolean);
            return [own, ...kids];
          }),
          boxTop: b ? Math.round(b.top) : null,
          boxBottom: b ? Math.round(b.bottom) : null,
          ctaTop: c ? Math.round(c.top) : null,
          ctaBottom: c ? Math.round(c.bottom) : null,
        };
      });
      console.error(
        `キーボード ${size.width}×${size.height}: 見える高さ${view.height}` +
          ` ページ${view.page} 送り${view.scrolled}\n` +
          `  帯 ${view.header} / 柱 ${view.shell}（指定 ${view.dvh}） / 中身 ${view.stage}\n` +
          `  柱の中:\n${view.parts.join("\n")}（柱${view.shells} 欄${view.areas} ポー${view.po}）\n` +
          `  入力欄 ${view.boxTop}〜${view.boxBottom} / 次へ ${view.ctaTop}〜${view.ctaBottom}`,
      );
      expect(view.ctaBottom, `${size.width}: 「次へ」が画面の外`).toBeLessThanOrEqual(
        view.height + 1,
      );
      expect(view.boxTop, `${size.width}: 入力欄が画面の外`).toBeGreaterThanOrEqual(-1);
      expect(view.boxBottom, `${size.width}: 入力欄が見えない`).toBeGreaterThan(0);

      // 次の持ち方へ移る前に、いったん元の高さへ戻す
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.waitForTimeout(200);
    }
  });

  test("文字を大きくしても、切り落とさない", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await stubApi(page);
    await page.addInitScript(() => {
      // 端末の「文字を大きく」に当たる。根の文字の大きさを上げる
      document.documentElement.style.fontSize = "20px";
    });
    await openLessonById(page, "summarize_text");

    const found: string[] = [];
    for (let at = 0; at < 26; at += 1) {
      const title = (await page.locator("h1").first().innerText().catch(() => ""))
        .replace(/\s+/g, "")
        .slice(0, 14);
      const cut = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll("main *")) {
          if (el.children.length > 0) continue;
          if (!(el.textContent ?? "").trim()) continue;
          if (!el.checkVisibility()) continue;
          const box = el.getBoundingClientRect();
          if (box.height < 4 || box.width < 4) continue;
          let clipped = false;
          for (let up = el.parentElement; up; up = up.parentElement) {
            const style = getComputedStyle(up);
            if (/auto|scroll/.test(style.overflowY + style.overflowX)) break;
            if (style.overflowY !== "hidden" && style.overflowX !== "hidden") continue;
            const frame = up.getBoundingClientRect();
            if (
              box.bottom > frame.bottom + 1 ||
              box.right > frame.right + 1 ||
              box.top < frame.top - 1
            ) {
              clipped = true;
            }
          }
          if (clipped) out.push((el.textContent ?? "").trim().slice(0, 12));
        }
        return [...new Set(out)].slice(0, 3);
      });
      if (cut.length) found.push(`${at} 「${title}」 切れ=${cut.join("/")}`);
      if (await page.getByTestId("completion-view").count()) break;
      await fill(page);
      await page.getByTestId("primary-action").first().click({ force: true });
      await page.waitForTimeout(350);
    }
    console.error("===== 文字20px =====");
    console.error(found.length ? found.join("\n") : "（指摘なし）");
  });
});
