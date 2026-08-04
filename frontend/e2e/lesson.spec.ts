import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/**
 * 要件 §15 の Playwright シナリオを、そのまま1本の通しにしたもの。
 *
 *   診断 → おすすめ → 文章改善レッスン → 例文 → 条件 → 依頼の確認
 *   → 実行 → 比較 → もっと短く → 自分の文章 → 完了 → 進捗へ反映
 *
 * 実APIは呼ばない。すべて stubApi で差し替える。
 */

const START = "はじめる";

async function openTop(page: Page) {
  await page.goto("/");
  // 端末に残った下書きが前のテストから漏れないようにする
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

async function next(page: Page) {
  await page.getByTestId("primary-action").click();
}

async function choose(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function openCourse(page: Page) {
  // 「はじめる」の行き先はホーム。レッスンの一覧は下タブの「教材一覧」にある
  await page.getByRole("button", { name: START }).first().click();
  await page.getByRole("button", { name: "教材一覧" }).click();
}

/** 診断を最後まで答える。 */
async function completeDiagnosis(page: Page) {
  await page.getByTestId("lesson-diagnosis").click();

  await next(page); // intro
  await choose(page, "文章を書くことが多い");
  await next(page);
  await choose(page, "使ったことがない");
  await next(page);
  await choose(page, "文章を書く・直す");
  await next(page);
}

/** 文章改善レッスンを、AI へ送る直前まで進める。 */
async function openRewriteUpToPreview(page: Page) {
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
  await next(page);
}

test.describe("要件 §15 の通しシナリオ", () => {
  test("診断から完了まで、迷わず進める", async ({ page }) => {
    const stub = await stubApi(page);
    await openTop(page);
    await openCourse(page);

    // 1〜2. 診断を完了し、おすすめが3つ出る
    await completeDiagnosis(page);
    await expect(page.getByTestId("completion-view")).toBeVisible();
    await expect(page.getByTestId("recommended-rewrite_text")).toBeVisible();
    await expect(page.locator('[data-testid^="recommended-"]')).toHaveCount(3);

    await next(page); // 完了する → 一覧へ

    // 3〜5. 文章改善レッスンを開始し、例文と条件を選ぶ
    await openRewriteUpToPreview(page);

    // 6. 依頼内容を送信前に確認できる
    await expect(
      page.getByRole("heading", { name: "AIにはこう伝えます" }),
    ).toBeVisible();
    await expect(page.getByTestId("prompt-cards")).toContainText("社外のお客様");
    expect(stub.calls, "確認の前に送ってしまっている").toHaveLength(0);

    // 7. mock AI を実行する
    await next(page);
    await expect(page.getByTestId("result-compare")).toBeVisible();
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0].action).toBe("rewrite");
    expect(stub.calls[0].input.audience).toBe("社外のお客様");

    // 8. 改善前後を比べられる
    await expect(page.getByTestId("result-compare")).toContainText(
      "【スタブ応答 1回目】",
    );

    // 9. 「もっと短く」を実行する
    await next(page); // 結果 → 改善
    await choose(page, "もっと短く");
    await next(page);
    await expect(page.getByTestId("result-compare")).toContainText(
      "【スタブ応答 2回目】",
    );
    expect(stub.calls[1].action).toBe("improve");
    expect(stub.calls[1].input.improvement).toBe("もっと短く");

    // 前の結果も残っている（消さずに比べられる）
    await page.getByText(/これまでの結果/).click();
    await expect(page.getByTestId("run-1")).toBeVisible();

    // 10. 自分の文章のステップへ進む
    await next(page); // 直したあとの結果 → 安全の確認
    await next(page); // 確認 → 自分の課題
    await expect(
      page.getByRole("heading", { name: "次は、自分の文章で試してみましょう" }),
    ).toBeVisible();

    await page
      .getByRole("textbox")
      .fill("お世話になっております。例の件、いかがでしょうか。");
    await next(page);
    await expect(page.getByTestId("result-compare")).toBeVisible();
    expect(stub.calls[2].input.original_text).toContain("お世話になっております");

    // 11. レッスンを完了する
    await next(page); // 結果 → ふりかえり
    await next(page); // ふりかえり → 完了
    await expect(page.getByTestId("completion-view")).toBeVisible();
    await next(page); // 完了する

    // 12. 進捗画面へ反映される（診断とあわせて2本）
    await expect(page.getByTestId("progress-summary")).toContainText("2 / 9");
    await expect(page.getByTestId("progress-summary")).toContainText("1回");
    await expect(page.getByText("読む相手を伝えられる")).toBeVisible();
  });
});

test.describe("迷わせない作りか", () => {
  test("必要な入力が足りないとき、理由をボタンのそばに出す", async ({ page }) => {
    await stubApi(page);
    await openTop(page);
    await openCourse(page);
    await page.getByTestId("lesson-rewrite_text").click();
    await next(page); // intro

    // 何も選ばずに進もうとする
    await expect(page.getByTestId("primary-action")).toBeDisabled();
    await expect(page.getByRole("status")).toContainText("えらんでみましょう");
  });

  test("短すぎる入力は止めずに、書き足しを勧める", async ({ page }) => {
    await stubApi(page);
    await openTop(page);
    await openCourse(page);
    await page.getByTestId("lesson-rewrite_text").click();
    await next(page);
    await choose(page, "仕事のメール");
    await next(page);

    await page.getByRole("textbox").fill("短い");

    // 提案は出るが、進めなくはしない
    await expect(page.getByRole("status")).toContainText("書き足す");
    await expect(page.getByTestId("primary-action")).toBeEnabled();
  });

  test("入力済みの内容は、あとから直せる", async ({ page }) => {
    await stubApi(page);
    await openTop(page);
    await openCourse(page);
    await openRewriteUpToPreview(page);

    await page.getByText(/ここまでに答えた内容/).click();
    await page.getByRole("button", { name: "なおす" }).first().click();

    await expect(
      page.getByRole("heading", { name: "どんな文章を直しますか" }),
    ).toBeVisible();
  });

  test("読み込み直しても、続きから再開できる", async ({ page }) => {
    await stubApi(page);
    await openTop(page);
    await openCourse(page);
    await page.getByTestId("lesson-rewrite_text").click();
    await next(page);
    await choose(page, "仕事のメール");
    await next(page);
    await page.getByRole("button", { name: "用意された例文を使う" }).click();

    const before = await page.getByRole("textbox").inputValue();
    await page.reload();

    await expect(page.getByRole("textbox")).toHaveValue(before);
  });
});

test.describe("AI が失敗したとき", () => {
  test("入力を消さず、もう一度送れる", async ({ page }) => {
    const stub = await stubApi(page, { failStatus: 502, failOnCall: 1 });
    await openTop(page);
    await openCourse(page);
    await openRewriteUpToPreview(page);

    await next(page);
    await expect(page.getByTestId("step-error")).toContainText(
      "うまく届かなかった",
    );
    // ポーは黙らない
    await expect(page.getByTestId("po-avatar")).toHaveAttribute(
      "data-emotion",
      "warning",
    );

    await next(page);
    await expect(page.getByTestId("result-compare")).toBeVisible();
    expect(stub.calls).toHaveLength(2);
    // 同じ条件で送り直せている（入力が消えていない）
    expect(stub.calls[1].input.audience).toBe("社外のお客様");
  });
});

test.describe("個人情報・機密情報の確認", () => {
  async function fillWith(page: Page, text: string) {
    await openCourse(page);
    await page.getByTestId("lesson-rewrite_text").click();
    await next(page);
    await choose(page, "仕事のメール");
    await next(page);
    await page.getByRole("textbox").fill(text);
    await next(page);
    await choose(page, "社外のお客様");
    await next(page);
    await choose(page, "ていねいに");
    await next(page);
    await choose(page, "3行くらい");
    await next(page);
    await next(page); // 送る
  }

  test("メールアドレスは、確認したうえで送れる", async ({ page }) => {
    const stub = await stubApi(page);
    await openTop(page);
    await fillWith(page, "連絡先は tanaka@example.co.jp です。");

    await expect(page.getByTestId("privacy-dialog")).toBeVisible();
    expect(stub.calls, "確認の前に送ってしまっている").toHaveLength(0);

    await page.getByTestId("privacy-send-anyway").click();
    await expect(page.getByTestId("result-compare")).toBeVisible();
    expect(stub.calls).toHaveLength(1);
  });

  test("APIキーらしいものは送信そのものを止める", async ({ page }) => {
    const stub = await stubApi(page);
    await openTop(page);
    await fillWith(page, "鍵は sk-abcdefghijklmnopqrstuvwx です。");

    await expect(page.getByTestId("privacy-dialog")).toBeVisible();
    await expect(page.getByTestId("privacy-send-anyway")).toBeDisabled();
    expect(stub.calls).toHaveLength(0);
  });
});

test.describe("自分の課題", () => {
  test("スキップできるが、飛ばしたことは記録する", async ({ page }) => {
    const stub = await stubApi(page);
    await openTop(page);
    await openCourse(page);
    await openRewriteUpToPreview(page);

    await next(page); // 送る（確認 → 送信 → 結果）
    await next(page); // 結果 → 改善
    await choose(page, "もっと短く");
    await next(page); // 改善を送る → 直したあとの結果
    await next(page); // → 安全の確認
    await next(page); // → 自分の課題

    await page.getByRole("button", { name: "今回はスキップする" }).click();

    const skipped = stub.events.some(
      (event) => event.event_type === "real_task_skipped",
    );
    expect(skipped, "飛ばしたことが記録されていない").toBe(true);
  });
});

test.describe("AI を使わないレッスン", () => {
  test("Lesson 7 は AI を呼ばずに最後まで進める", async ({ page }) => {
    const stub = await stubApi(page);
    await openTop(page);
    await openCourse(page);
    await page.getByTestId("lesson-use_ai_safely").click();

    await next(page); // intro
    await choose(page, "日付");
    await expect(page.getByTestId("quiz-explanation")).toBeVisible();
    await next(page);
    await choose(page, "パスワード");
    await next(page);
    await choose(page, "自分");
    await next(page);
    await next(page); // ふりかえり
    await expect(page.getByTestId("completion-view")).toBeVisible();

    expect(stub.calls, "AIを使わないレッスンで呼んでいる").toHaveLength(0);
  });
});
