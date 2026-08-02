import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/**
 * AIPPO 開発概要 §18 Phase 6 のシナリオ。
 *
 * 1. レッスンを開始する
 * 2. 用途を選択する
 * 3. 文章と条件を入力する
 * 4. AIを実行する
 * 5. ポーのヒントを確認する
 * 6. 条件を修正する
 * 7. 自分の文章で試す
 * 8. 課題を完了する
 * 9. celebrate状態が表示される
 */

/** トップから診断を抜けてレッスン画面まで進む。 */
async function openLesson(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "はじめる" }).click();

  // 診断3問
  for (let i = 0; i < 3; i++) {
    const choices = page.locator("main section button");
    await choices.first().waitFor();
    await choices.first().click();
  }

  await page.getByRole("button", { name: "これを試す" }).click();
  await expect(page.getByTestId("lesson-step")).toBeVisible();
}

async function goToLesson(page: Page) {
  await openLesson(page);
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "INTRO");
}

async function runFirstGeneration(page: Page) {
  await page.getByTestId("primary-action").click(); // はじめる
  await expect(page.getByTestId("lesson-step")).toHaveAttribute(
    "data-step",
    "SELECT_USE_CASE",
  );

  await page.getByRole("button", { name: "仕事のメール" }).click();
  await expect(page.getByTestId("lesson-step")).toHaveAttribute(
    "data-step",
    "FIRST_INPUT",
  );

  await page.getByRole("button", { name: "社外のお客様", exact: true }).click();
  await page.getByRole("button", { name: "ていねいに", exact: true }).click();
  await page.getByRole("button", { name: "3行くらい", exact: true }).click();
  await page.getByTestId("primary-action").click(); // AIに送る

  await expect(page.getByTestId("lesson-step")).toHaveAttribute(
    "data-step",
    "REVIEW_RESULT",
  );
}

test.describe("最初のレッスンを通しで完走する", () => {
  test("開始から celebrate まで到達する", async ({ page }) => {
    const stub = await stubApi(page);
    await goToLesson(page);

    // 1-4. 開始 → 用途選択 → 条件入力 → AI実行
    await runFirstGeneration(page);
    expect(stub.rewriteCalls).toHaveLength(1);
    expect(stub.rewriteCalls[0].audience).toBe("社外のお客様");

    // 改善前後の比較が出る
    await expect(page.getByTestId("result-compare")).toBeVisible();
    await expect(page.getByText("もとの文章")).toBeVisible();
    await expect(page.getByTestId("run-1")).toBeVisible();

    // 5. ポーのヒントを確認する
    await expect(page.getByTestId("poe-avatar")).toContainText(
      "【スタブ応答】",
    );

    // 6. 条件を修正する（改善）
    await page.getByTestId("primary-action").click(); // 次へ
    await expect(page.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "IMPROVE_INPUT",
    );
    await page.getByRole("button", { name: "もっと短くしたい" }).click();

    await expect(page.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "REVIEW_RESULT",
    );
    await expect(page.getByTestId("run-2")).toBeVisible();
    expect(stub.rewriteCalls[1].instruction).toContain("短く");

    // 7. 自分の文章で試す
    await page.getByTestId("primary-action").click(); // 次へ
    await page.getByRole("button", { name: "自分の文章で試す" }).click();
    await expect(page.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "REAL_TASK",
    );

    await page
      .getByLabel("あなたの文章")
      .fill("お世話になっております。先日の資料の件、ご確認いただけましたでしょうか。");
    await page.getByTestId("primary-action").click();

    await expect(page.getByTestId("result-compare")).toBeVisible();
    expect(stub.rewriteCalls).toHaveLength(3);
    expect(stub.rewriteCalls[2].original_text).toContain("先日の資料");
    // 自分の文章での実行後は、その場で結果を見せる（画面を行き来させない）
    await expect(page.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "REAL_TASK",
    );

    // 8. 課題を完了する
    await page.getByTestId("primary-action").click(); // 振り返りへ進む
    await expect(page.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "REFLECTION",
    );
    await page.getByTestId("primary-action").click(); // 完了する

    // 9. celebrate 状態
    await expect(page.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "COMPLETE",
    );
    await expect(page.getByTestId("completion-view")).toBeVisible();
    await expect(page.getByText("できるようになりました")).toBeVisible();

    // 完了イベントが送られている
    expect(stub.events.some((e) => e.event_type === "lesson_completed")).toBe(true);
  });

  test("完了画面でアンケートに答えられる", async ({ page }) => {
    const stub = await stubApi(page);
    await goToLesson(page);
    await runFirstGeneration(page);

    // 最短で完了まで進む
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "もっと短くしたい" }).click();
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "自分の文章で試す" }).click();
    await page.getByLabel("あなたの文章").fill("自分で書いた文章です。");
    await page.getByTestId("primary-action").click(); // AIに送る
    await page.getByTestId("primary-action").click(); // 振り返りへ進む
    await page.getByTestId("primary-action").click(); // 完了する

    await expect(page.getByTestId("completion-view")).toBeVisible();

    await page.getByRole("button", { name: "なかった" }).click();
    await page.getByRole("button", { name: "使うと思う" }).click();
    await page.getByRole("button", { name: "学びたい" }).click();
    await page.getByRole("button", { name: "興味がある" }).click();

    await expect(page.getByText("ありがとうございました。")).toBeVisible();
    expect(stub.surveys).toHaveLength(1);
    expect(stub.surveys[0].would_pay).toBe("yes");
  });
});

test.describe("待ち時間の見せ方", () => {
  test("書けたところから文章が出る", async ({ page }) => {
    // わざと細かく刻んで、書き終わる前の状態を捉えられるようにする
    await stubApi(page, {
      streamChunkSize: 2,
      rewrite: () => "書き直した文章がここに入ります。".repeat(4),
    });
    await goToLesson(page);

    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "仕事のメール" }).click();
    await page.getByRole("button", { name: "社外のお客様", exact: true }).click();
    await page.getByRole("button", { name: "ていねいに", exact: true }).click();
    await page.getByRole("button", { name: "3行くらい", exact: true }).click();
    await page.getByTestId("primary-action").click();

    // 書き終わったら結果の比較に切り替わり、書きかけは畳まれる
    await expect(page.getByTestId("result-compare")).toBeVisible();
    await expect(page.getByTestId("streaming-text")).toBeHidden();
    await expect(page.getByTestId("run-1")).toContainText("書き直した文章");
  });

  test("流し込みが使えない環境でも、結果は同じように出る", async ({ page }) => {
    // 途中で溜め込むプロキシや古い環境を想定する。
    // 学習者の失敗ではないので、画面にエラーを出してはいけない。
    const stub = await stubApi(page, { streaming: false });
    await goToLesson(page);
    await runFirstGeneration(page);

    await expect(page.getByTestId("result-compare")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(stub.rewriteCalls).toHaveLength(1);
  });
});

test.describe("迷わせない作りになっているか", () => {
  test("穴埋めが空のまま送ると、足りない項目を1つだけ示す", async ({ page }) => {
    const stub = await stubApi(page);
    await goToLesson(page);

    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "仕事のメール" }).click();
    await page.getByTestId("primary-action").click(); // 何も選ばずに送信

    const alerts = page.getByRole("alert");
    await expect(alerts).toHaveCount(1);
    await expect(alerts).toContainText("誰向け");
    expect(stub.rewriteCalls).toHaveLength(0);
    await expect(page.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "FIRST_INPUT",
    );
  });

  test("自分の文章が空のときは、例文で試す道を残す", async ({ page }) => {
    await stubApi(page);
    await goToLesson(page);
    await runFirstGeneration(page);

    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "もっと短くしたい" }).click();
    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "自分の文章で試す" }).click();

    await page.getByTestId("primary-action").click(); // 空のまま送信
    await expect(page.getByRole("alert")).toContainText("入力してみましょう");

    // 行き止まりにならない
    await page
      .getByRole("button", { name: "思いつかないので、用意された例文で試す" })
      .click();
    await expect(page.getByLabel("あなたの文章")).not.toHaveValue("");
  });

  test("AI が失敗しても入力が消えず、やり直せる", async ({ page }) => {
    await stubApi(page, { rewriteStatus: 502 });
    await goToLesson(page);

    await page.getByTestId("primary-action").click();
    await page.getByRole("button", { name: "仕事のメール" }).click();
    await page.getByRole("button", { name: "社外のお客様", exact: true }).click();
    await page.getByRole("button", { name: "ていねいに", exact: true }).click();
    await page.getByRole("button", { name: "3行くらい", exact: true }).click();

    const sourceText = await page.getByLabel("分かりやすくしたい文章").inputValue();
    await page.getByTestId("primary-action").click();

    await expect(page.getByRole("alert")).toContainText("もう一度");
    await expect(page.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "FIRST_INPUT",
    );
    // 入力が保持されている
    await expect(page.getByLabel("分かりやすくしたい文章")).toHaveValue(sourceText);
    await expect(
      page.getByRole("button", { name: "社外のお客様", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("ポーはどの画面にも表示される", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");
    await expect(page.getByTestId("poe-avatar")).toBeVisible();

    await page.getByRole("button", { name: "はじめる" }).click();
    await expect(page.getByTestId("poe-avatar")).toBeVisible();
  });
});

test.describe("再訪", () => {
  test("前回の到達ステップから再開できる", async ({ page }) => {
    await stubApi(page, { resumeStep: "IMPROVE_INPUT" });
    await openLesson(page);

    await expect(page.getByTestId("lesson-step")).toHaveAttribute(
      "data-step",
      "IMPROVE_INPUT",
    );
  });
});
