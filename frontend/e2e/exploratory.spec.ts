/**
 * 探索テスト。
 *
 * 通常の E2E と違い、API をスタブせず **本物のバックエンド** に当てる。
 * スタブでは見つからない不具合を拾うためのもの。
 *
 *   接続先のずれ / Cookie / CSRF / 教材の配信 / サーバー側の断り
 *
 * 実際、学習イベント5種類が 400 で捨てられていたのはここで見つかった。
 * スタブは「送られたこと」しか見ないので、サーバーが受け取れるかは
 * 本物に当てないと分からない。
 *
 * 実行前に Django を http://127.0.0.1:8000 で起動しておくこと。
 * 居なければ自動でスキップする（手元で毎回立てなくてよい）。
 *
 *   cd backend && AI_PROVIDER=mock FRONTEND_URL=http://127.0.0.1:5173 \
 *     AI_RUNS_PER_IP_PER_DAY=0 AI_RUNS_PER_DAY=0 \
 *     uv run python manage.py runserver 127.0.0.1:8000
 *
 * 接続元単位の上限は外す。テストは全部おなじ接続元から来るので、
 * 付けたままだとテストを増やしたときに上限へ当たり、
 * アプリが壊れたように見える。上限そのものは backend のテストが見ている。
 */

import { expect, test, type Page, type Locator } from "@playwright/test";
import { dismissLessonIntro } from "./support/lessonIntro";

/**
 * 進めない状態か。
 *
 * `disabled` だけを見ない。答えが足りないときのボタンは、押せる形のまま
 * `aria-disabled` で「まだ進めない」を表している（押した人に理由を返すため）。
 * 属性だけで見分けると、押しても進まないボタンを押し続けることになる。
 */
async function blocked(primary: Locator): Promise<boolean> {
  if (await primary.isDisabled()) return true;
  return (await primary.getAttribute("aria-disabled")) === "true";
}

const API = "http://127.0.0.1:8000";
const SAMPLE = "来週の打ち合わせの件、資料の確認をお願いします。";

async function backendIsUp(page: Page): Promise<boolean> {
  try {
    return (await page.request.get(`${API}/health/live`)).ok();
  } catch {
    return false;
  }
}

/** 4xx / 5xx を集める。黙って捨てられている通信を見つけるため。 */
function collectFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    if (!url.startsWith(API)) return;
    // 二重押しの抑止（409）は意図どおりなので数えない
    if (response.status() >= 400 && response.status() !== 409) {
      failures.push(`HTTP ${response.status()} ${url.replace(API, "")}`);
    }
  });
  return failures;
}

async function toCourse(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).click();
  // コースは3段（一覧 → 中身 → レッスン）。レッスンが並ぶのは2段目
  await page.getByTestId("current-course-open").click();
}

async function advance(page: Page): Promise<boolean> {
  const primary = page.getByTestId("primary-action").first();
  if (!(await primary.isVisible().catch(() => false))) return false;

  if (await blocked(primary)) {
    const box = page.locator("textarea:visible").first();
    if (await box.count()) await box.fill(SAMPLE);
    else {
      const choice = page
        .locator("main button:visible")
        .filter({
          hasNotText:
            /レッスン一覧へ|もどる|くわしく|変わったところ|記録|全文|送っています|飛ばす|スキップ|あとにする/,
        })
        .first();
      if (await choice.count()) await choice.click();
    }
    await page.waitForTimeout(120);
  }
  if (await blocked(primary)) return false;

  await primary.click();
  return true;
}

async function runToEnd(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId("completion-view").isVisible().catch(() => false)) return;
    if (!(await advance(page))) break;
    await page.waitForTimeout(150);
  }
}

test.describe("本物のバックエンドに当てる", () => {
  test.slow();

  test.beforeEach(async ({ page }) => {
    test.skip(!(await backendIsUp(page)), "バックエンドが起動していません");
  });

  test("mock のままレッスンを完走できる（憲章 原則 III）", async ({ page }) => {
    const failures = collectFailures(page);

    await toCourse(page);
    await page.getByTestId("lesson-rewrite_text").click();
    await dismissLessonIntro(page);
    await runToEnd(page);

    await expect(page.getByTestId("completion-view")).toBeVisible();
    expect(failures, "失敗した通信がある").toEqual([]);
  });

  test("学習イベントが、ひとつも捨てられない", async ({ page }) => {
    /*
      画面が送るイベント名をサーバーが知らないと 400 になる。
      画面は止まらない作りなので、触っていても気づけない。
      実際にこれで5種類が捨てられていた。
    */
    const rejected: string[] = [];
    page.on("response", (response) => {
      if (!response.url().includes("/api/learning-events/")) return;
      if (response.status() >= 400) {
        rejected.push(`${response.status()} ${response.request().postData() ?? ""}`);
      }
    });

    await toCourse(page);
    await page.getByTestId("lesson-rewrite_text").click();
    await dismissLessonIntro(page);
    await runToEnd(page);

    expect(rejected, "サーバーが受け取らなかったイベント").toEqual([]);
  });

  test("教材はサーバーから届く", async ({ page }) => {
    const response = await page.request.get(`${API}/api/v1/catalog/`);
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as { courses: { lessons: unknown[] }[] };
    expect(body.courses.length).toBeGreaterThan(0);
    expect(body.courses[0].lessons.length).toBeGreaterThan(0);
  });

  test("教材が決めていない操作は、直接頼んでも断られる", async ({ page }) => {
    /*
      画面は教材データが決めた action しか送らないが、最後の砦はサーバー。
      画面を書き換えれば何でも送れてしまうので、ここで止まる必要がある。

      以前ここでは「近日公開の教材を直接叩く」を確かめていた。
      教材9本を全部開けたので、その状態はもう作れない
      （作るには管理画面から閉じる必要があり、E2E からは手が届かない）。
      近日公開の締め出しそのものは backend/tests/test_coming_soon.py が、
      1本を閉じたうえで 409 LESSON_COMING_SOON を確かめている。

      ここでは、同じ「サーバーが最後に止める」を、教材と操作の
      組み合わせで確かめる。plan は make_plan のもので、rewrite_text には無い。
    */
    const response = await page.request.post(`${API}/api/v1/ai/generate/`, {
      data: {
        lesson_id: "rewrite_text",
        step_id: "quick_try",
        action: "plan",
        input: { goal: "資料を作りきる", deadline: "今週中", available_time: "1日30分" },
      },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("このレッスンでは使えない操作です");
  });

  test("捌ける状態かを、サーバー自身が答える", async ({ page }) => {
    const response = await page.request.get(`${API}/health/ready`);

    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { checks: Record<string, boolean> };
    expect(body.checks).toMatchObject({ database: true, ai: true, email: true });
  });

  test("合言葉なしの書き込みは断られる", async ({ page }) => {
    /*
      通ってしまうと、よそのサイトからログイン中の人の代わりに操作できる。
      黙って壊れる種類なので、実際の Cookie と CSRF を通して確かめる。
    */
    const response = await page.request.patch(`${API}/api/v1/accounts/profile/`, {
      data: { display_name: "よそから" },
      failOnStatusCode: false,
    });

    expect([401, 403]).toContain(response.status());
  });
});
