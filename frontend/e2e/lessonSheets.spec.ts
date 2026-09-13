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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { dismissLessonIntro } from "./support/lessonIntro";
import { openLessonById } from "./support/openLesson";
import { flowLessonId } from "./support/openLessons";

/** 次へ進む。答えが要る回は、その場にあるもので埋める。 */
async function advance(p: Page): Promise<boolean> {
  /*
    技を受け取る回で「覚えた」を押すと、スタンプ台紙が1枚挟まる。
    閉じずに下のボタンを押そうとすると、背景が受け取ってしまう。
  */

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

/**
 * 骨格のままの教材を開く（`flowLessonId`）。
 *
 * 3本を見比べる一枚（`compare-more`）と、結果の「変わったところ」
 * （`result-more`）は**骨格の組み方**。Day1 と Day2 は手書きに
 * 組み直したとき、結果を**代表的な変化**で出す形に変えたので
 * （`components/course/day1/Changes.tsx`）、この2つが出ない。
 *
 * どれが骨格型かは名前で決め打ちにしない——手書きが増えるたびに
 * 書き替えることになる。第1リリースでは準備中なので、検査のあいだ
 * だけ開ける。
 */
async function startFlowLesson(page: Page) {
  await stubApi(page);
  await openLessonById(page, flowLessonId());
}

/** その目印が出る回まで進める。 */
async function runUntil(page: Page, testId: string) {
  for (let step = 0; step < 30; step += 1) {
    if (await page.getByTestId(testId).count()) return;
    if (!(await advance(page))) break;
  }
  await expect(page.getByTestId(testId)).toBeVisible();
}

const SNAPSHOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../catalog-snapshot.json",
);

/** Day1 の段ごとの一言（`meta.changedNote`）。並びは教材のとおり。 */
function day1ChangedNotes(): string[] {
  const course = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as {
    lessons: { id: string; steps: { meta?: { changedNote?: string } }[] }[];
  };
  const lesson = course.lessons.find((one) => one.id === "rewrite_text");
  return (lesson?.steps ?? [])
    .map((step) => step.meta?.changedNote ?? "")
    .filter(Boolean)
    .map((one) => one.replace(/\s+/g, ""));
}

test.setTimeout(120_000);

test.describe("変わったところの一枚", () => {
  test("持ち帰る一言が、押さなくても見えている", async ({ page }) => {
    /*
      教材が持つ一言が、実際の画面まで届いているか。

      部品の検査と教材の検査は、それぞれの端しか見ていない。
      **つないでいるのは `StepRenderer` の1行**で、そこが落ちても
      どちらの検査も緑のまま——画面から一言が消えるだけになる。

      見る場所が変わった
      ------------------
      前は「変わったところを見る」の一枚の中の一言
      （`course/lessonPlan.ts` の `takeaway`）を見ていた。Day1 を
      4つの段に組み直したとき、結果は**代表的な変化**で出す形になり
      （`components/course/day1/Changes.tsx`）、一言は段ごとの
      `changedNote`（教材データ）が持つようになった。

      いまの seam はそちら。教材データから引いてくらべる——検査に
      書き写すと、教材を直したときに両方が同じ間違いで揃う。
    */
    await start(page);
    await runUntil(page, "change-note");

    const notes = day1ChangedNotes();
    expect(notes.length, "教材に段ごとの一言が無い").toBeGreaterThan(0);

    /*
      段を進めるたび、その段の一言が出ていること。1つ見て終わらない
      ——`StepRenderer` が最初の1回だけ渡していても通ってしまう。
    */
    const seen: string[] = [];
    for (let step = 0; step < 30 && seen.length < notes.length; step += 1) {
      if (await page.getByTestId("change-note").count()) {
        const text = (await page.getByTestId("change-note").innerText()).replace(
          /\s+/g,
          "",
        );
        const hit = notes.find((one) => text.includes(one));
        if (hit && !seen.includes(hit)) seen.push(hit);
      }
      if (!(await advance(page))) break;
    }

    expect(seen, `画面に出た一言: ${seen.join(" / ")}`).toEqual(notes);
  });

  test("差分・道のり・図が、押せば全部ある", async ({ page }) => {
    await startFlowLesson(page);
    await runUntil(page, "compare-more");

    await page.getByTestId("compare-more").click();

    /*
      一枚を開いて最初に読めるのは3節だけ——何を変えた？ / どう変わった？ /
      たとえば。前はここに1文ずつの差分と3本の全文まで積んでいて、
      開いた瞬間に赤青が画面を埋め、上の3節まで目が戻らなかった。

      **無くしたのではなく、もう一手の奥へ下げた**（`steps/Compare.tsx`）。
      だからこの検査も、押して辿れることを見る形に変える。
    */
    const sheet = page.getByTestId("changes-sheet");
    await expect(sheet).toContainText("何を変えた？");
    await expect(sheet).toContainText("どう変わった？");
    // 足した条件と、測って分かった変わりようが、その場に出ている
    await expect(page.getByTestId("added-condition")).toBeVisible();
    await expect(page.getByTestId("change-points")).toBeVisible();

    // 図は、この一枚の中でもう一手押した人にだけ
    await page.getByTestId("compare-figure-open").click();
    await expect(page.getByTestId("compare-figure")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("compare-figure")).toHaveCount(0);

    // 道のり（元・1回目・改善後の3つ）と、1文ずつの差分も同じ奥にある
    await page.getByTestId("full-compare-open").click();
    await expect(page.getByTestId("full-original")).toBeVisible();
    await expect(page.getByTestId("full-first")).toBeVisible();
    await expect(page.getByTestId("full-improved")).toBeVisible();
    await page.getByTestId("full-compare-mark").click();
    await expect(page.getByTestId("compare-diff")).toBeVisible();
  });

  test("文章を押すと、全文がもう一枚出る", async ({ page }) => {
    /*
      一枚の中の文章は3行で切ってある。**切った先を読むために
      一枚を送らせない**——押せば全文が出て、閉じれば元の続きから読める。
    */
    await startFlowLesson(page);
    await runUntil(page, "compare-more");
    await page.getByTestId("compare-more").click();
    // 3本の全文は、一枚の中でもう一手押した先（「全文を比べる」）
    await page.getByTestId("full-compare-open").click();

    await page.getByTestId("full-original").click();

    const full = page.getByTestId("full-text-sheet");
    await expect(full).toBeVisible();
    await expect(full).toContainText("元の文章");

    // 閉じても、下の2枚は開いたまま。Esc はいちばん上の一枚だけを閉じる
    await page.keyboard.press("Escape");
    await expect(full).toHaveCount(0);
    await expect(page.getByTestId("full-compare")).toBeVisible();
    await expect(page.getByTestId("changes-sheet")).toBeVisible();
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
    await startFlowLesson(page);
    await runUntil(page, "compare-more");
    await page.getByTestId("compare-more").click();

    const scrim = page.getByTestId("changes-scrim");
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
    await startFlowLesson(page);
    await runUntil(page, "observation-list");

    await page.getByTestId("result-more").click();

    const sheet = page.getByTestId("changes-sheet");
    await expect(sheet).toHaveAttribute("data-placement", "center");
    await expect(sheet).toContainText("ここを見て");
    /*
      言いかえの対応（`changes-swaps`）は、ここでは見ない。

      あれは `course/lessonPlan.ts` の `swaps` から出るもので、
      いま plan を持っているのは Day1 だけ。その Day1 は4つの段に
      組み直したとき、この画面を通らなくなった（代表的な変化を出す
      `day1/Changes.tsx` に変わった）。**つまり今どの教材からも
      出ない**——ここで見張ると、教材の都合で落ち続ける。

      骨格の教材に plan を足した日に、この行を戻すこと。
    */

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
    await startFlowLesson(page);
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
  /*
    **3回から1回へ。**

    前は技を1つずつ、使った場所で受け取っていた（`SkillGet`）。
    名前が付くのは使った直後がよい——そこは変えていない。変えたのは
    祝う回数のほうで、Day1 の中に受け取る画面が3回あり、そのたびに
    ポーが中央へ出て、紙が散って、押して戻る、を繰り返していた。

    いまは、使った場所では名前を言うだけ（解説カード）。受け取るのは
    自分の文章を仕上げたあとの1回で、そこで3つそろって出る
    （`components/course/day1/SkillRecap.tsx`）。
  */
  test("最後に3つまとめて出る", async ({ page }) => {
    await start(page);
    await runUntil(page, "skill-recap");

    // その日に持って帰るものの数。押す前に分かる
    await expect(page.getByTestId("skill-recap-count")).toHaveText("3 / 3");
    await expect(page.getByTestId("skill-recap-item")).toHaveCount(3);

    for (const name of ["プロンプト", "読者設定", "トーン設定"]) {
      await expect(page.getByTestId("skill-recap")).toContainText(name);
    }
  });

  test("説明は、1つにつき1行に収まる", async ({ page }) => {
    /*
      3つ並ぶので、1つが2行になるとそのぶん下が押し出される。
      いちばん低い持ち方（402×660）で押すものが画面の外へ出る。
    */
    await start(page);
    await runUntil(page, "skill-recap");

    const rows = await page.evaluate(() =>
      [
        ...document.querySelectorAll("[data-testid='skill-recap-body']"),
      ].map(
        (node) => {
          const step = parseFloat(getComputedStyle(node).lineHeight);
          return {
            text: node.textContent ?? "",
            lines: Math.round(node.getBoundingClientRect().height / step),
          };
        },
      ),
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.lines, `「${row.text}」が ${row.lines} 行`).toBeLessThanOrEqual(1);
    }
  });

  test("途中では、受け取る演出を出さない", async ({ page }) => {
    /*
      **ここが今回いちばん直したかったところ。** 名前を言う画面
      （「これがプロンプトです」）では、名前を言うだけで止まる。
      祝うのは最後の1回。
    */
    await start(page);
    await runUntil(page, "concept-card");

    await expect(page.getByTestId("skill-recap")).toHaveCount(0);
    // 台紙も出てこない。部品ごと消してある
    await expect(page.getByTestId("skill-stamp-card")).toHaveCount(0);
    // 名前そのものは、ちゃんと画面にある
    await expect(page.locator("main")).toContainText("プロンプト");
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
