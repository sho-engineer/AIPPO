/**
 * 1画面に収めるために、外へ出したもの。
 *
 * レッスンは1画面＝1アクションに収めた（`e2e/stepFits.spec.ts`）。
 * そのぶん、確かめたい人だけが要るものは押したら開く一枚
 * （`components/course/MoreSheet.tsx`）へ移してある。
 *
 * **移したものが本当に読めること**を、ここで押さえる。収まっている
 * かどうかだけを見張ると、「収まったが中身が消えた」に気づけない。
 *
 * ここで守るもの
 * --------------
 * 1. 比べる画面の一枚に、差分・道のり・図がある
 * 2. その中の文章は、押せば全文が出る（さらに一枚重なる）
 * 3. 完了画面の一枚に、アンケートと進み具合がある
 * 4. AI技を受け取る回は、その1つだけの画面になっている
 * 5. 一枚は**画面の上に**出る（下の画面が沈む）
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { dismissLessonIntro } from "./support/lessonIntro";

/** 次へ進む。答えが要る回は、その場にあるもので埋める。 */
async function advance(p: Page): Promise<boolean> {
  const primary = p.getByTestId("primary-action").first();
  if (!(await primary.count())) return false;

  const blocked = async () =>
    (await primary.isDisabled()) ||
    (await primary.getAttribute("aria-disabled")) === "true";

  if (await blocked()) {
    const box = p.locator("textarea:visible").first();
    if (await box.count()) {
      await box.fill("来週の打ち合わせの件、資料の確認をお願いします。");
    } else {
      const choice = p
        .locator("main button:visible")
        .filter({
          hasNotText:
            /レッスン一覧へ|もどる|くわしく|変わったところ|記録|全文|送っています|飛ばす|スキップ/,
        })
        .first();
      if (await choice.count()) await choice.click();
    }
    await p.waitForTimeout(300);
  }
  if (await blocked()) return false;
  await primary.click();
  await p.waitForTimeout(700);
  return true;
}

async function start(page: Page) {
  await stubApi(page);
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByTestId("continue-lesson").click();
  await dismissLessonIntro(page);
  await expect(page.getByTestId("lesson-header")).toBeVisible();
}

/** その目印が出る回まで進める。 */
async function runUntil(page: Page, testId: string) {
  for (let step = 0; step < 30; step += 1) {
    if (await page.getByTestId(testId).count()) return;
    if (!(await advance(page))) break;
  }
  await expect(page.getByTestId(testId)).toBeVisible();
}

test.setTimeout(120_000);

test.describe("変わったところの一枚", () => {
  test("差分・道のり・図が、押せば全部ある", async ({ page }) => {
    await start(page);
    await runUntil(page, "compare-more");

    await page.getByTestId("compare-more").click();

    const sheet = page.getByTestId("more-sheet");
    await expect(sheet).toContainText("何を変えた？");
    await expect(sheet).toContainText("どう変わった？");
    await expect(sheet).toContainText("1文ずつ見る");
    await expect(sheet).toContainText("ここまでの道のり");
    // 元・1回目・改善後の3つ
    await expect(page.getByTestId("full-original")).toBeVisible();
    await expect(page.getByTestId("full-first")).toBeVisible();
    await expect(page.getByTestId("full-improved")).toBeVisible();
  });

  test("文章を押すと、全文がもう一枚出る", async ({ page }) => {
    /*
      一枚の中の文章は3行で切ってある。**切った先を読むために
      一枚を送らせない**——押せば全文が出て、閉じれば元の続きから読める。
    */
    await start(page);
    await runUntil(page, "compare-more");
    await page.getByTestId("compare-more").click();

    await page.getByTestId("full-original").click();

    const full = page.getByTestId("full-text-sheet");
    await expect(full).toBeVisible();
    await expect(full).toContainText("元の文章");

    // 閉じても、下の一枚は開いたまま
    await page.keyboard.press("Escape");
    await expect(full).toHaveCount(0);
    await expect(page.getByTestId("more-sheet")).toBeVisible();
  });

  test("一枚は画面の上に出る（下の画面の中に閉じ込められない）", async ({ page }) => {
    /*
      `position: fixed` は、**先祖に `transform` があるとそこへ
      閉じ込められる**。レッスンの中身は `StepTransition` が包んでいて、
      そこには画面の入れ替わりを見せる `transform` が常に入っている。
      body へ出す（portal）のをやめると、一枚が「その回の中身の枠」の
      中に収まり、背景も暗くならない——実際そうなっていた。

      画面いっぱいに広がっているかで見る。
    */
    await start(page);
    await runUntil(page, "compare-more");
    await page.getByTestId("compare-more").click();

    const scrim = page.getByTestId("more-sheet-scrim");
    const box = await scrim.boundingBox();
    const view = page.viewportSize();
    expect(box, "背景が無い").not.toBeNull();
    expect(Math.round(box!.height)).toBe(view!.height);
    expect(Math.round(box!.y)).toBe(0);
  });
});

test.describe("分かりやすくなった？の画面", () => {
  test("変わったところは、中央に浮かぶ一枚で出す", async ({ page }) => {
    /*
      ここは**見て、閉じて、答える**場面。下から出る形は「送れば続きが
      ある読み物」に見えるので、閉じずに送り始める——そして後ろの
      レッスン画面には答えの札が待っている。

      中身も見る。全文の突き合わせより先に、言いかえの対応が出ること
      （簡単になったかは、そちらのほうが早く分かる）。
    */
    await start(page);
    await runUntil(page, "observation-list");

    await page.getByTestId("result-more").click();

    const sheet = page.getByTestId("changes-sheet");
    await expect(sheet).toHaveAttribute("data-placement", "center");
    await expect(page.getByTestId("changes-swaps")).toBeVisible();
    await expect(sheet).toContainText("ここを見て");

    // 全文の比べは、この中でもう1回押した人にだけ
    await expect(page.getByTestId("full-compare")).toHaveCount(0);
    await page.getByTestId("full-compare-open").click();
    await expect(page.getByTestId("full-before")).toBeVisible();
    await expect(page.getByTestId("full-after")).toBeVisible();
  });

  test("開いているあいだ、後ろのレッスン画面は動かない", async ({ page }) => {
    /*
      背景が動くと、閉じたときに**さっきまで見ていた場所と違う所**へ
      戻る。答えの札が画面の外へ出ていれば、押せる場所を探し直しになる。
    */
    await start(page);
    await runUntil(page, "observation-list");
    await page.getByTestId("result-more").click();
    await expect(page.getByTestId("changes-sheet")).toBeVisible();

    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(200);

    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    expect(
      await page.evaluate(() => document.body.style.overflow),
    ).toBe("hidden");
  });

  test("答えを選ぶまで、次へは押せない形で出す", async ({ page }) => {
    await start(page);
    await runUntil(page, "observation-list");

    const primary = page.getByTestId("primary-action").first();
    await expect(primary).toHaveAttribute("aria-disabled", "true");

    // 選べるのは1つ。押すと、その札にだけ印が付く
    const choices = page.getByTestId("observation-list").getByRole("button");
    await choices.first().click();
    await expect(choices.first()).toHaveAttribute("aria-pressed", "true");
  });

  test("横に並べた札の言葉が、語の途中で折り返さない", async ({ page }) => {
    /*
      2列に並べると、402px の画面で1枠は 177px しかない。印のための
      20px と左右の余白を**流れの中に**確保していたころ、文字に残る幅は
      131px で、「分かりやすくなった」（実測 136px 要る）が
      **「分かりや／すくなった」**と割れていた。

      文字を短くしても直らない種類の折り返しで、原因は幅の配り方の
      ほう。印を浮かせて一回り小さくし、余白を詰めて 139px 渡した。

      見るのは**行数**にする。何 px 空けたかは書き方の話で、
      守りたいのは「1行で読めること」のほう。
    */
    await start(page);
    await runUntil(page, "observation-list");

    const rows = await page.evaluate(() => {
      const list = document.querySelector("[data-testid='observation-list']")!;
      return Array.from(list.querySelectorAll("button")).map((button) => {
        const label = button.querySelector("span > span") as HTMLElement;
        const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
        return {
          text: label.textContent!.trim(),
          lines: Math.round(label.getBoundingClientRect().height / lineHeight),
        };
      });
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.lines, `「${row.text}」が ${row.lines} 行で出ている`).toBe(1);
    }
  });
});

test.describe("AI技を受け取る画面", () => {
  test("その1つだけの画面になっている", async ({ page }) => {
    await start(page);
    await runUntil(page, "skill-get");

    // 技の名前と、ひとことの説明
    await expect(page.getByTestId("skill-get-name")).toBeVisible();
    await expect(page.getByTestId("skill-get")).toContainText("AI技 GET");

    /*
      見出しは「新しいAI技」。教材データの見出しは技の名前そのもので、
      画面の真ん中にも同じ名前が大きく出る——**同じ言葉を1画面に2回**
      置かない。
    */
    await expect(page.locator("main h1").first()).toHaveText("新しいAI技");

    // ポーも出る（受け取る瞬間なので、顔だけ・黙って喜ぶ）
    await expect(page.locator("[data-po-scene='celebrate']").first()).toBeVisible();
  });
});

test.describe("このレッスンの記録", () => {
  test("アンケートと進み具合は、押せば全部ある", async ({ page }) => {
    await start(page);
    await runUntil(page, "completion-view");

    // 画面に残すのは3つだけ。アンケートは押すまで出ない
    await expect(page.getByTestId("survey")).toHaveCount(0);

    await page.getByTestId("completion-more").click();

    await expect(page.getByTestId("survey")).toBeVisible();
    await expect(page.getByTestId("more-sheet")).toContainText("コース進捗");
  });

  test("答えた内容は、これまでどおり送られる", async ({ page }) => {
    /*
      一枚の中へ移したことで**届かなくなっていない**ことを見る。
      有料テストの申込率は、記録から出せない唯一の数字
      （`docs/roadmap.md`）。ここが唯一の入口。
    */
    const api = await stubApi(page);
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.getByRole("button", { name: "はじめる" }).first().click();
    await page.getByTestId("continue-lesson").click();
    await dismissLessonIntro(page);
    await runUntil(page, "completion-view");

    await page.getByTestId("completion-more").click();
    for (const label of ["すぐ使えそう", "使うと思う", "試したい"]) {
      await page.locator('[data-testid="survey"] label', { hasText: label }).first().click();
    }
    await page.getByTestId("survey-submit").click();

    await expect(page.getByTestId("survey-done")).toBeVisible();
    expect(api.surveys).toHaveLength(1);
  });
});
