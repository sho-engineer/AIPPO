import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

import { PO_EMOTIONS } from "../src/course/types";
import { poAssets } from "../src/po/assets";

/**
 * 探索テスト。
 *
 * 通常の E2E と違い、API をスタブせず **本物のバックエンド** に当てる。
 * `AI_PROVIDER=mock` のまま完走できること（憲章 原則 III）を、
 * 実際の HTTP・DB・Cookie を通して確かめる。
 *
 * 実行前に Django を http://127.0.0.1:8000 で起動しておくこと。
 * バックエンドが居ないときは自動でスキップする。
 *
 * テストは全部おなじ接続元から来るため、接続元単位の上限は外して起動する。
 *
 *   AI_PROVIDER=mock AI_RUNS_PER_IP_PER_DAY=0 AI_RUNS_PER_DAY=0 \
 *     AI_DAILY_REQUEST_LIMIT_PER_USER=0 python manage.py runserver 127.0.0.1:8000
 *
 * 付けたままだと、テストを増やしたときに上限へ当たり、
 * アプリが壊れたように見える。上限そのものは
 * backend/tests/test_ai_generate.py で確かめている。
 */

const API = "http://127.0.0.1:8000";

async function backendIsUp(page: Page): Promise<boolean> {
  try {
    const res = await page.request.get(`${API}/healthz`);
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

async function next(page: Page) {
  await page.getByTestId("primary-action").click();
}

async function choose(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function openLessonList(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  // 「はじめる」の行き先はホーム。レッスンの一覧は下タブの「教材一覧」にある
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByRole("button", { name: "教材一覧" }).click();
}

/** 文章改善レッスンを、結果が出るところまで進める。 */
async function runRewrite(page: Page) {
  await openLessonList(page);
  await page.getByTestId("lesson-rewrite_text").click();

  await next(page); // intro
  await choose(page, "仕事のメール");
  await next(page);
  await page.getByRole("button", { name: "用意された例文を使う" }).click();
  await next(page);
  await choose(page, "社外のお客様");
  await next(page);
  await choose(page, "ていねいに");
  await next(page);
  await choose(page, "3行くらい");
  await next(page); // 依頼の確認
  await next(page); // 送る
  await expect(page.getByTestId("result-compare")).toBeVisible({ timeout: 20_000 });
}

test.describe("探索テスト（本物のバックエンド）", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await backendIsUp(page)), "Django が起動していないためスキップ");
  });

  test("mock のままレッスンを完走できる", async ({ page }) => {
    const problems = collectConsole(page);
    await runRewrite(page);

    // 改善
    await next(page); // 結果 → 改善
    await choose(page, "もっと短く");
    await next(page);
    await expect(page.getByTestId("result-compare")).toBeVisible({
      timeout: 20_000,
    });

    // 自分の文章
    await next(page); // → 安全の確認
    await next(page); // → 自分の課題
    await page.getByRole("textbox").fill("探索テストで入力した文章です。");
    await next(page);
    await expect(page.getByTestId("result-compare")).toBeVisible({
      timeout: 20_000,
    });

    // 完了
    await next(page); // → ふりかえり
    await next(page); // → 完了
    await expect(page.getByTestId("completion-view")).toBeVisible();

    expect(problems, `コンソールに問題が出た:\n${problems.join("\n")}`).toEqual([]);
  });

  test("利用実績（provider / model / token / latency）が返ってくる", async ({
    page,
  }) => {
    // 記録の経路が動いていないと、費用を後から追えない
    const response = await page.request.post(`${API}/api/v1/ai/generate/`, {
      data: {
        lesson_id: "rewrite_text",
        step_id: "generate_result",
        action: "rewrite",
        input: {
          original_text: "先日の件ですが、追ってご連絡差し上げます。",
          audience: "社外のお客様",
          tone: "ていねいに",
          length: "3行くらい",
        },
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();

    expect(body.result).toBeTruthy();
    expect(body.tutor.message).toBeTruthy();
    expect(body.usage.provider).toBeTruthy();
    expect(body.usage.model).toBeTruthy();
    expect(body.usage.output_tokens).toBeGreaterThan(0);
    expect(body.usage.latency_ms).toBeGreaterThanOrEqual(0);
  });

  test("教材の外から任意の操作を流し込めない", async ({ page }) => {
    // action とレッスンの対応はサーバーが持つ。
    // ここが緩いと、教材と関係ない指示を投げられる。
    const response = await page.request.post(`${API}/api/v1/ai/generate/`, {
      data: {
        lesson_id: "make_plan",
        step_id: "generate_result",
        action: "rewrite",
        input: { original_text: "x", audience: "a", tone: "b", length: "c" },
      },
    });

    expect(response.status()).toBe(400);
  });

  test("learner_key の Cookie が発行され、JavaScript から読めない", async ({
    page,
  }) => {
    await runRewrite(page);

    const cookies = await page.context().cookies();
    const key = cookies.find((cookie) => cookie.name === "learner_key");

    expect(key, "learner_key が発行されていない").toBeTruthy();
    expect(key?.httpOnly, "JavaScript から読めてしまう").toBe(true);
  });

  test("操作ログに本文が渡っていない", async ({ page }) => {
    const bodies: Record<string, unknown>[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/learning-events/")) {
        const data = request.postDataJSON();
        if (data) bodies.push(data);
      }
    });

    await runRewrite(page);

    expect(bodies.length, "操作ログが1件も送られていない").toBeGreaterThan(0);
    for (const body of bodies) {
      for (const key of ["user_input", "text", "content", "original_text"]) {
        expect(body, `操作ログに ${key} が入っている`).not.toHaveProperty(key);
      }
    }
  });

  test("同じ内容を続けて送っても、二重に実行しない", async ({ page }) => {
    const payload = {
      lesson_id: "rewrite_text",
      step_id: "generate_result",
      action: "rewrite",
      input: {
        original_text: "二重送信をためす文章です。",
        audience: "上司",
        tone: "ていねいに",
        length: "1行",
      },
    };

    const first = await page.request.post(`${API}/api/v1/ai/generate/`, {
      data: payload,
    });
    const second = await page.request.post(`${API}/api/v1/ai/generate/`, {
      data: payload,
    });

    expect(first.status()).toBe(200);
    expect(second.status(), "同じ内容がもう一度実行されている").toBe(409);
  });

  test("極端に長い入力は 400 で拒否される", async ({ page }) => {
    const response = await page.request.post(`${API}/api/v1/ai/generate/`, {
      data: {
        lesson_id: "rewrite_text",
        step_id: "generate_result",
        action: "rewrite",
        input: {
          original_text: "あ".repeat(6000),
          audience: "上司",
          tone: "ていねいに",
          length: "1行",
        },
      },
    });

    expect(response.status()).toBe(400);
  });

  test("マニフェストにあるポーの画像が配信される", async ({ page }) => {
    // マニフェストに書いてあるのに 404 だと、
    // プレースホルダーばかりになって案内役に見えない。
    // 開発サーバーは、無いパスでも index.html を 200 で返す。
    // 状態コードだけでは判定できないので、中身の型で見る。
    const missing: string[] = [];
    for (const emotion of PO_EMOTIONS) {
      const response = await page.request.get(
        `http://127.0.0.1:5173${poAssets[emotion]}`,
      );
      const type = response.headers()["content-type"] ?? "";
      if (!response.ok() || !type.startsWith("image/")) missing.push(emotion);
    }

    // talking と blink は専用の絵がまだ無い（近い絵へ寄せている）
    expect(missing.sort()).toEqual(["blink", "talking"]);
  });

  test("スマートフォン幅で、入力欄と送信ボタンが同時に見える", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await openLessonList(page);
    await page.getByTestId("lesson-rewrite_text").click();
    await next(page);
    await choose(page, "仕事のメール");
    await next(page);

    const textarea = (await page.getByRole("textbox").boundingBox())!;
    const action = (await page.getByTestId("primary-action").boundingBox())!;

    expect(textarea.y, "入力欄が画面の外にある").toBeLessThan(780);
    expect(action.y + action.height, "ボタンが画面の外にある").toBeLessThanOrEqual(
      781,
    );
    // 重なっていないこと
    expect(textarea.y + textarea.height).toBeLessThanOrEqual(action.y + 1);
  });

  test("横スクロールが出ない", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openLessonList(page);
    await page.getByTestId("lesson-rewrite_text").click();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, "横スクロールが出ている").toBeLessThanOrEqual(1);
  });

  test("ポーが下のボタンのタップを奪わない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    await openLessonList(page);
    await page.getByTestId("lesson-rewrite_text").click();

    const box = (await page.getByTestId("po-avatar").boundingBox())!;
    const grabbed = await page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return element?.closest("[data-testid='po-avatar']") !== null;
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );

    expect(grabbed, "ポーがタップを奪っている").toBe(false);
  });

  test("UI に専門用語が出ていない", async ({ page }) => {
    await openLessonList(page);
    await page.getByTestId("lesson-rewrite_text").click();

    const text = (await page.textContent("body")) ?? "";
    for (const word of ["プロンプト", "トークン", "パラメータ", "API", "モデル"]) {
      expect(text, `画面に「${word}」が出ている`).not.toContain(word);
    }
  });
});
