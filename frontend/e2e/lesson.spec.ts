import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";

/**
 * レッスンを実際に「始めて・進めて・終えられる」ことを通しで確かめる。
 *
 * 画面の並びは教材データ（course/shared.ts の buildLessonFlow）が決めている。
 *
 *   完成イメージ → お試し（相手を1つ選ぶ）→ 変化の観察 → 短い解説×3
 *   → 条件を1つ足す → 見比べる → 安全の確認 → 自分の文章
 *   → 誰が読むか → どう変えたいか → 送る前の確認 → 結果 → ふりかえり → 完了
 *
 * 実APIは呼ばない。すべて stubApi で差し替える（要件 §15）。
 */

const START = "はじめる";
const LESSON_TAB = "教材一覧";

/** 最初の1回で選ぶ相手。quick_try の選択肢はこの3つだけ。 */
const AUDIENCE = "上司";
/** 条件を1つ足すときに選ぶもの。 */
const CONDITION = "もっと短く";

const REAL_TASK_TEXT =
  "お世話になっております。先日の件、ご確認いただけますでしょうか。よろしくお願いいたします。";

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

/**
 * レッスンの一覧まで出す。
 *
 * 「はじめる」の行き先はホームで、一覧は下タブの「教材一覧」にある。
 */
async function openLessonList(page: Page) {
  await page.getByRole("button", { name: START }).first().click();
  await page.getByRole("button", { name: LESSON_TAB }).click();
  await expect(page.getByTestId("lesson-rewrite_text")).toBeVisible();
}

/** レッスンの進み具合（何歩目か）。 */
function lessonProgress(page: Page) {
  return page.getByRole("progressbar", { name: "レッスンの進み具合" });
}

/** コース全体の進み具合（9本のうち何本終わったか）。 */
function courseProgress(page: Page) {
  return page.getByRole("progressbar", { name: "コース全体の進み具合" });
}

/** 診断を最後まで答える。おすすめが決まる。 */
async function completeDiagnosis(page: Page) {
  await page.getByTestId("lesson-diagnosis").click();

  await next(page); // まずは3つだけ教えてください
  await choose(page, "文章を書くことが多い");
  await next(page);
  await choose(page, "使ったことがない");
  await next(page);
  await choose(page, "文章を書く・直す");
  await next(page);
}

/** 文章改善レッスンを開き、最初の1回を送るところまで進める。 */
async function openRewrite(page: Page) {
  await page.getByTestId("lesson-rewrite_text").click();
  await next(page); // 完成イメージ
}

/** 最初の1回を送り、観察の画面まで進める。 */
async function firstRun(page: Page) {
  await choose(page, AUDIENCE);
  await next(page); // 送る → 生成 → 観察
  await expect(
    page.getByRole("heading", { name: "どこが変わったと思いますか" }),
  ).toBeVisible();
}

/** 観察 → 解説3枚 → 条件を足す画面。 */
async function throughConcepts(page: Page) {
  await next(page); // 観察 → 解説1
  await next(page); // 解説1 → 解説2
  await next(page); // 解説2 → 解説3
  await next(page); // 解説3 → 条件を足す
  await expect(
    page.getByRole("heading", { name: "条件を一つ足してみましょう" }),
  ).toBeVisible();
}

/** 条件を1つ足して送り、見比べの画面まで進める。 */
async function improve(page: Page, condition = CONDITION) {
  await choose(page, condition);
  await next(page); // 送る → 生成 → 見比べ
  await expect(
    page.getByRole("heading", { name: "変わり方を見比べる" }),
  ).toBeVisible();
}

/** 見比べ → 安全の確認 → 自分の文章の入力画面。 */
async function toRealTask(page: Page) {
  await next(page); // 見比べ → 安全の確認
  await expect(
    page.getByRole("heading", { name: "次は、自分の文章で試してみましょう" }),
  ).toBeVisible();
  await next(page); // 安全の確認 → 自分の文章
  await expect(page.getByRole("heading", { name: "自分の文章" })).toBeVisible();
}

/** 自分の文章を入れて、送る前の確認画面まで進める。 */
async function toPromptPreview(page: Page, text = REAL_TASK_TEXT) {
  await page.getByRole("textbox").fill(text);
  await next(page); // 自分の文章 → 誰が読みますか
  await next(page); // → どう変えたいですか
  await next(page); // → AIにはこう伝えます
  await expect(
    page.getByRole("heading", { name: "AIにはこう伝えます", level: 1 }),
  ).toBeVisible();
}

// ---------------------------------------------------------------- 通しシナリオ

test.describe("通しシナリオ", () => {
  test("診断からレッスン完了まで、迷わず進める", async ({ page }) => {
    const stub = await stubApi(page);
    await openTop(page);
    await openLessonList(page);

    // 1. 診断を終えると、おすすめが3つ決まる
    await completeDiagnosis(page);
    await expect(page.getByTestId("completion-view")).toBeVisible();
    await expect(page.getByTestId("recommended-rewrite_text")).toBeVisible();
    await expect(page.locator('[data-testid^="recommended-"]')).toHaveCount(3);
    // 診断は AI を使わない
    expect(stub.calls, "診断でAIを呼んでいる").toHaveLength(0);

    await next(page); // 完了する → ホームへ

    // 2. 診断のぶんだけ進む（9本のうち1本）
    await expect(courseProgress(page)).toHaveAttribute("aria-valuenow", "1");
    await expect(courseProgress(page)).toHaveAttribute("aria-valuemax", "9");

    // 3. 文章改善レッスンを開く。19歩の1歩目から始まる
    await page.getByRole("button", { name: LESSON_TAB }).click();
    await page.getByTestId("lesson-rewrite_text").click();
    await expect(lessonProgress(page)).toHaveAttribute("aria-valuenow", "1");
    await expect(lessonProgress(page)).toHaveAttribute("aria-valuemax", "19");
    await next(page); // 完成イメージ
    await expect(lessonProgress(page)).toHaveAttribute("aria-valuenow", "2");

    // 4. 相手を選ぶだけで、最初の結果まで届く
    await firstRun(page);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0].action).toBe("rewrite");
    expect(stub.calls[0].input.audience).toBe(AUDIENCE);
    await expect(page.getByTestId("result-compare")).toContainText(
      "【スタブ応答 1回目】",
    );

    // 5. 解説を読み、条件を1つ足す
    await throughConcepts(page);
    await improve(page);
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[1].action).toBe("improve");
    expect(stub.calls[1].input.improvement).toBe(CONDITION);
    // 前の結果も消えずに残る（消すと比べられない）
    await expect(page.getByTestId("result-compare")).toContainText(
      "【スタブ応答 2回目】",
    );

    // 6. 自分の文章で試す。送る前に、伝える内容を確認できる
    await toRealTask(page);
    await toPromptPreview(page);
    // 送る条件が、送る前に読める形で並んでいる
    await expect(page.getByTestId("prompt-cards")).toContainText("読む相手");
    await expect(page.getByTestId("prompt-cards")).toContainText(AUDIENCE);
    expect(stub.calls, "確認の前に送ってしまっている").toHaveLength(2);

    await next(page); // 送る
    await expect(
      page.getByRole("heading", { name: "自分の文章の結果" }),
    ).toBeVisible();
    expect(stub.calls).toHaveLength(3);
    expect(stub.calls[2].input.original_text).toContain("お世話になっております");

    // 7. ふりかえって完了する
    await next(page); // 結果 → ふりかえり
    await next(page); // ふりかえり → 完了
    await expect(page.getByTestId("completion-view")).toBeVisible();
    await expect(page.getByTestId("completion-view")).toContainText(
      "誰向けかを伝える",
    );
    // 完了画面の時点で、9本のうち2本（診断＋このレッスン）
    await expect(courseProgress(page)).toHaveAttribute("aria-valuenow", "2");

    await next(page); // 完了する → ホームへ

    // 8. ホームの進捗へ反映される
    await expect(courseProgress(page)).toHaveAttribute("aria-valuenow", "2");
    await expect(courseProgress(page)).toHaveAttribute("aria-valuemax", "9");
    await expect(page.getByTestId("progress-summary")).toContainText("2");
    // 自分の課題で試した回数も数えられている
    await expect(page.getByTestId("progress-summary")).toContainText("1回");
  });
});

// ------------------------------------------------------------ 迷わせない作り

test.describe("迷わせない作りか", () => {
  test("選ぶまで進めず、理由をボタンのそばに出す", async ({ page }) => {
    await stubApi(page);
    await openTop(page);
    await openLessonList(page);
    await openRewrite(page);

    // 何も選ばずに進もうとする
    await expect(page.getByTestId("primary-action")).toBeDisabled();
    await expect(page.getByRole("status")).toContainText("えらんでみましょう");

    // 選べば進める
    await choose(page, AUDIENCE);
    await expect(page.getByTestId("primary-action")).toBeEnabled();
  });

  test("短すぎる入力は止めずに、書き足しを勧める", async ({ page }) => {
    await stubApi(page);
    await openTop(page);
    await openLessonList(page);
    await openRewrite(page);
    await firstRun(page);
    await throughConcepts(page);
    await improve(page);
    await toRealTask(page);

    await page.getByRole("textbox").fill("短い");

    // 提案は出るが、進めなくはしない
    await expect(page.getByRole("status")).toContainText("書き足す");
    await expect(page.getByTestId("primary-action")).toBeEnabled();
  });

  test("入力済みの内容は、あとから直せる", async ({ page }) => {
    await stubApi(page);
    await openTop(page);
    await openLessonList(page);
    await openRewrite(page);
    await firstRun(page);

    // ここまでに答えた内容をひらいて、選び直しへ戻る
    await page.getByText(/ここまでに答えた内容/).click();
    await page.getByRole("button", { name: "なおす" }).first().click();

    await expect(
      page.getByRole("heading", { name: "この文章は誰に送りますか？" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: AUDIENCE, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("読み込み直しても、続きから再開できる", async ({ page }) => {
    await stubApi(page);
    await openTop(page);
    await openLessonList(page);
    await openRewrite(page);
    await firstRun(page);
    await throughConcepts(page);
    await improve(page);
    await toRealTask(page);

    await page.getByRole("textbox").fill(REAL_TASK_TEXT);
    const before = await page.getByRole("textbox").inputValue();
    await page.reload();

    // 同じ画面に戻り、入力も残っている
    await expect(page.getByRole("heading", { name: "自分の文章" })).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveValue(before);
  });
});

// ------------------------------------------------------------ AI が失敗したとき

test.describe("AI が失敗したとき", () => {
  test("入力を消さず、もう一度送れる", async ({ page }) => {
    const stub = await stubApi(page, { failStatus: 502, failOnCall: 1 });
    await openTop(page);
    await openLessonList(page);
    await openRewrite(page);

    await choose(page, AUDIENCE);
    await next(page); // 送る → 失敗

    await expect(page.getByTestId("step-error")).toContainText("うまく届かなかった");
    // ポーは黙らない
    await expect(page.getByTestId("po-avatar")).toHaveAttribute(
      "data-emotion",
      "warning",
    );
    // 選んだ内容は消えない
    await page.getByText(/ここまでに答えた内容/).click();
    await expect(page.getByRole("group")).toContainText(AUDIENCE);

    await next(page); // もう一度送る
    await expect(
      page.getByRole("heading", { name: "どこが変わったと思いますか" }),
    ).toBeVisible();
    expect(stub.calls).toHaveLength(2);
    // 同じ条件で送り直せている
    expect(stub.calls[1].input.audience).toBe(AUDIENCE);
  });
});

// -------------------------------------------------- 個人情報・機密情報の確認

test.describe("個人情報・機密情報の確認", () => {
  /** 自分の文章に text を入れて、送るところまで進める。 */
  async function sendRealTask(page: Page, text: string) {
    await openLessonList(page);
    await openRewrite(page);
    await firstRun(page);
    await throughConcepts(page);
    await improve(page);
    await toRealTask(page);
    await toPromptPreview(page, text);
    await next(page); // 送る
  }

  test("メールアドレスは、確認したうえで送れる", async ({ page }) => {
    const stub = await stubApi(page);
    await openTop(page);
    await sendRealTask(page, "連絡先は tanaka@example.co.jp です。ご確認ください。");

    await expect(page.getByTestId("privacy-dialog")).toBeVisible();
    expect(stub.calls, "確認の前に送ってしまっている").toHaveLength(2);

    await page.getByTestId("privacy-send-anyway").click();
    await expect(
      page.getByRole("heading", { name: "自分の文章の結果" }),
    ).toBeVisible();
    expect(stub.calls).toHaveLength(3);
  });

  test("APIキーらしいものは送信そのものを止める", async ({ page }) => {
    const stub = await stubApi(page);
    await openTop(page);
    await sendRealTask(page, "鍵は sk-abcdefghijklmnopqrstuvwx です。ご確認ください。");

    await expect(page.getByTestId("privacy-dialog")).toBeVisible();
    await expect(page.getByTestId("privacy-send-anyway")).toBeDisabled();
    // 最初の2回ぶんから増えていない
    expect(stub.calls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------- 自分の課題

test.describe("自分の課題", () => {
  test("スキップできるが、飛ばしたことは記録する", async ({ page }) => {
    const stub = await stubApi(page);
    await openTop(page);
    await openLessonList(page);
    await openRewrite(page);
    await firstRun(page);
    await throughConcepts(page);
    await improve(page);
    await toRealTask(page);

    await page.getByRole("button", { name: "今回はスキップする" }).click();

    const skipped = stub.events.some(
      (event) => event.event_type === "real_task_skipped",
    );
    expect(skipped, "飛ばしたことが記録されていない").toBe(true);
  });
});

// ------------------------------------------------------- AI を使わないレッスン

test.describe("AI を使わないレッスン", () => {
  test("Lesson 7 は AI を呼ばずに最後まで進める", async ({ page }) => {
    const stub = await stubApi(page);
    await openTop(page);
    await openLessonList(page);
    await page.getByTestId("lesson-use_ai_safely").click();

    await next(page); // はじめに

    // 選んだ時点で、その場に解説が出る（答え合わせに画面を挟まない）
    await choose(page, "日付");
    await expect(page.getByTestId("quiz-explanation")).toBeVisible();
    await next(page);

    await choose(page, "パスワード");
    await expect(page.getByTestId("quiz-explanation")).toBeVisible();
    await next(page);

    await choose(page, "自分");
    await expect(page.getByTestId("quiz-explanation")).toBeVisible();
    await next(page);

    await next(page); // ふりかえり → 完了
    await expect(page.getByTestId("completion-view")).toBeVisible();

    expect(stub.calls, "AIを使わないレッスンで呼んでいる").toHaveLength(0);
  });
});
