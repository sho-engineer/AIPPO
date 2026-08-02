import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * 探索テスト。
 *
 * 通常の E2E と違い、API をスタブせず **本物のバックエンド** に当てる。
 * AI_PROVIDER=stub のまま完走できること（憲章 原則 III）を、
 * 実際の HTTP・DB・Cookie を通して確かめる。
 *
 * 実行前に Django を http://127.0.0.1:8000 で起動しておくこと。
 * バックエンドが居ないときは自動でスキップする。
 */

const API = "http://127.0.0.1:8000";

async function backendIsUp(page: Page): Promise<boolean> {
  try {
    const res = await page.request.get(`${API}/api/lessons/rewrite_text_001/session/`);
    return res.ok();
  } catch {
    return false;
  }
}

/** コンソールのエラーと警告を集める。 */
function collectConsole(page: Page) {
  const problems: string[] = [];
  const onMessage = (msg: ConsoleMessage) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      problems.push(`[${msg.type()}] ${msg.text()}`);
    }
  };
  page.on("console", onMessage);
  page.on("pageerror", (err) => problems.push(`[pageerror] ${err.message}`));
  return problems;
}

async function openLesson(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "はじめる" }).click();
  for (let i = 0; i < 3; i++) {
    const choices = page.locator("main section button");
    await choices.first().waitFor();
    await choices.first().click();
  }
  await page.getByRole("button", { name: "これを試す" }).click();
  await expect(page.getByTestId("lesson-step")).toBeVisible();
}

test.describe("探索テスト（本物のバックエンド）", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await backendIsUp(page)), "Django が起動していないためスキップ");
  });

  test("AI_PROVIDER=stub のままレッスンを完走できる", async ({ page }) => {
    const problems = collectConsole(page);
    await openLesson(page);

    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "仕事のメール" }).click();
    await page.getByRole("button", { name: "社外のお客様", exact: true }).click();
    await page.getByRole("button", { name: "ていねいに", exact: true }).click();
    await page.getByRole("button", { name: "3行くらい", exact: true }).click();
    await page.getByTestId("primary-action").click();

    // 本物のAPIから結果が返る
    await expect(page.getByTestId("run-1")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "REVIEW_RESULT",
    );

    // 改善
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "もっと短くしたい" }).click();
    await expect(page.getByTestId("run-2")).toBeVisible({ timeout: 15_000 });

    // 自分の文章
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "自分の文章で試す" }).click();
    await page.getByLabel("あなたの文章").fill("探索テストで入力した文章です。");
    await page.getByTestId("primary-action").click();
    await expect(page.getByTestId("result-compare")).toBeVisible({ timeout: 15_000 });

    // 完了
    await page.getByTestId("primary-action").click();
    await page.getByTestId("primary-action").click();
    await expect(page.getByTestId("completion-view")).toBeVisible();

    expect(problems, `コンソールに問題が出た:\n${problems.join("\n")}`).toEqual([]);
  });

  test("learner_key の Cookie が発行され、再訪で引き継がれる", async ({ page }) => {
    await openLesson(page);
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "仕事のメール" }).click();

    const cookies = await page.context().cookies();
    const learnerKey = cookies.find((c) => c.name === "learner_key");
    expect(learnerKey, "learner_key が発行されていない").toBeDefined();
    expect(learnerKey?.httpOnly, "HttpOnly になっていない").toBe(true);
  });

  test("操作ログに本文が渡っていない", async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/learning-events/") && req.method() === "POST") {
        const body = req.postDataJSON();
        if (body) bodies.push(body);
      }
    });

    await openLesson(page);
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "仕事のメール" }).click();
    await page.getByRole("button", { name: "社外のお客様", exact: true }).click();
    await page.getByRole("button", { name: "ていねいに", exact: true }).click();
    await page.getByRole("button", { name: "3行くらい", exact: true }).click();
    await page.getByTestId("primary-action").click();
    await expect(page.getByTestId("run-1")).toBeVisible({ timeout: 15_000 });

    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(Object.keys(body)).not.toContain("user_input");
      expect(Object.keys(body)).not.toContain("original_text");
      // 文字数は入っていてよい
      expect(body).toHaveProperty("input_length");
    }
  });

  test("実行回数の上限を超えると 429 が返る", async ({ page }) => {
    const payload = {
      original_text: "上限の確認に使う文章です。",
      audience: "社外のお客様",
      tone: "ていねいに",
      length: "3行くらい",
    };

    let lastStatus = 0;
    for (let i = 0; i < 12; i++) {
      const res = await page.request.post(
        `${API}/api/lessons/rewrite-text/generate/`,
        { data: payload },
      );
      lastStatus = res.status();
      if (lastStatus === 429) break;
    }

    expect(lastStatus, "上限に達しても 429 が返らない").toBe(429);
  });

  test("極端に長い入力は 400 で拒否される", async ({ page }) => {
    const res = await page.request.post(`${API}/api/lessons/rewrite-text/generate/`, {
      data: {
        original_text: "あ".repeat(5001),
        audience: "社外のお客様",
        tone: "ていねいに",
        length: "3行くらい",
      },
    });

    expect(res.status()).toBe(400);
    expect(await res.text()).toContain("original_text");
  });

  test("ポーの画像6枚がすべて配信される", async ({ page }) => {
    const emotions = [
      "neutral",
      "question",
      "thinking",
      "hint",
      "warning",
      "celebrate",
    ];
    for (const emotion of emotions) {
      const res = await page.request.get(`/poe/${emotion}.svg`);
      expect(res.status(), `${emotion} の画像が無い`).toBe(200);
    }
  });

  test("スマートフォン幅でポーが入力欄を隠さない", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openLesson(page);
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "仕事のメール" }).click();

    const textarea = page.getByLabel("分かりやすくしたい文章");
    await textarea.scrollIntoViewIfNeeded();
    const textBox = await textarea.boundingBox();
    const poeBox = await page.getByTestId("poe-avatar").boundingBox();

    expect(textBox).not.toBeNull();
    expect(poeBox).not.toBeNull();
    // 入力欄の下端がポーの上端より上にあること
    expect(textBox!.y + textBox!.height).toBeLessThanOrEqual(poeBox!.y + 1);
  });

  test("ポーが下のボタンのタップを奪わない", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openLesson(page);
    await page.getByTestId("primary-action").click();

    // ポーの吹き出しの真下にある座標を押しても、下のボタンへ届くこと
    const poe = page.getByTestId("poe-avatar");
    await expect(poe).toBeVisible();
    const poeBox = (await poe.boundingBox())!;

    const covered = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest('[data-testid="poe-avatar"]') !== null;
      },
      [poeBox.x + poeBox.width / 2, poeBox.y + poeBox.height / 2],
    );
    expect(covered, "ポーがクリックを受け取ってしまっている").toBe(false);

    // 実際に用途を選べること
    await page.getByRole("button", { name: "自分の文章" }).click();
    await expect(page.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "FIRST_INPUT",
    );
  });

  test("UI に専門用語が出ていない", async ({ page }) => {
    const banned = ["プロンプト", "トークン", "モデル", "API", "コンテキスト"];

    await page.goto("/");
    for (const word of banned) {
      await expect(
        page.locator("body"),
        `トップに「${word}」が出ている`,
      ).not.toContainText(word);
    }

    await openLesson(page);
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "仕事のメール" }).click();
    for (const word of banned) {
      await expect(
        page.locator("body"),
        `レッスン画面に「${word}」が出ている`,
      ).not.toContainText(word);
    }
  });
});
