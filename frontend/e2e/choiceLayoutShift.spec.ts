/**
 * 選択肢を選んでも、文字の位置がずれないこと。
 *
 * 何が起きていたか
 * ----------------
 * チェックの印を選択時にしか描画していなかった。選ぶと隣のテキスト列の
 * 実効幅が縮み、「自分がやることを知る」のような2〜3行になる札で
 * 折り返し位置が動いていた。
 *
 * なぜ E2E なのか
 * ---------------
 * 折り返しの位置は実際のフォント幅で決まるので、版面を持たない
 * jsdom では測れない。実機で、選ぶ前後の文字の位置そのものを見る。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";


async function openDiagnosisQuestion(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await expect(page.getByTestId("tab-bar")).toBeVisible();
  await page.getByRole("button", { name: "コース" }).first().click();
  await page.getByTestId("current-course-open").click();
  await page.getByTestId("lesson-diagnosis").first().click();
  await page.getByTestId("primary-action").click();
}

/**
 * 条件のタイル（`steps/Tiles.tsx`）が出るところまで進める。
 *
 * 診断の選択肢はラベルが短いので別の組み方（チップ）になる。
 * タイルの折り返しは、レッスンの中の「どう直しますか」まで
 * 行かないと確かめられない。
 */
async function openConditionTiles(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "はじめる" }).first().click();
  await page.getByTestId("continue-lesson").click();
  await expect(page.getByTestId("lesson-header")).toBeVisible();

  for (let step = 0; step < 25; step += 1) {
    if (await page.getByTestId("choice-tiles").isVisible().catch(() => false)) return;

    const primary = page.getByTestId("primary-action").first();
    if (!(await primary.count())) break;

    if (await primary.isDisabled().catch(() => true)) {
      const box = page.locator("textarea").first();
      if (await box.count()) {
        await box.fill("会議の日程について確認したいです。");
        continue;
      }
      const choice = page.locator("[aria-pressed]").first();
      if (await choice.count()) {
        await choice.click();
        continue;
      }
      break;
    }
    await primary.click();
    await page.waitForTimeout(150);
  }

  await expect(page.getByTestId("choice-tiles")).toBeVisible();
}

test.describe("選択肢のレイアウト", () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("選ぶ前後で、文字の位置と折り返しが変わらない", async ({ page }) => {
    await openDiagnosisQuestion(page);

    const choice = page.locator("[aria-pressed]").first();
    await expect(choice).toBeVisible();

    /*
      測る前に、入ってくる動きが終わるのを待つ。

      設問は横から差し込まれる（course/motion.ts の slide-in。
      translateX 16px → 0）。動いている最中に測ると、**選ぶ前だけが
      16px までずれた値**になり、選んだあと（動き終わり）と比べて
      「ずれた」と誤って読める。実際にそうなった——選ぶ前が
      87〜91 とばらつき、選んだあとは必ず 83 だった。

      待つのは Web Animations の終わりそのもの。時間で待つと、
      遅い環境で足りなくなる。
    */
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          /*
            終わらない動きは待たない。ポーは呼吸するようにずっと浮いて
            いる（float / twinkle。iterations は Infinity）ので、
            全部を待つとここで永久に止まる。
          */
          .filter((animation) => {
            const timing = animation.effect?.getTiming();
            return timing?.iterations !== Infinity;
          })
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );

    /*
      文字の入っている span を、**組み方に依らず**拾って測る。

      以前はクラス名（span.min-w-0.flex-1）で指していたが、札を縦積みに
      した際にクラスが変わり、テストだけが黙って何も見つけられなくなった。
      見た目の直しでテストが落ちるのは正しいが、**指し先を見失って
      落ちる**のは検査になっていない。中身の有無で拾う。
    */
    const measure = () =>
      page.evaluate(() => {
        /*
          札の中の**文字だけ**を測る。

          要素ごと測ると、チップの組み方（ボタン直下にアイコンと文字が
          並ぶ）でアイコンの矩形まで拾い、行数が水増しされる。
          テキストノードを1つずつ Range で囲って、行の上端の種類を数える。

          クラス名では指さない。札を縦積みにした日や、ラベルが短くて
          別の組み方に切り替わった日に、テストだけが黙って
          何も見つけられなくなる。
        */
        const box = (card: Element) => {
          const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
          const rects: DOMRect[] = [];
          let node = walker.nextNode();
          while (node) {
            if (node.textContent?.trim()) {
              const range = document.createRange();
              range.selectNodeContents(node);
              rects.push(
                ...Array.from(range.getClientRects()).filter(
                  (rect) => rect.width > 1 && rect.height > 1,
                ),
              );
            }
            node = walker.nextNode();
          }
          if (!rects.length) return null;

          const tops = rects.map((rect) => Math.round(rect.top));
          return {
            x: Math.min(...rects.map((rect) => rect.left)),
            width:
              Math.max(...rects.map((rect) => rect.right)) -
              Math.min(...rects.map((rect) => rect.left)),
            height:
              Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...tops),
            lines: new Set(tops).size,
            text: card.textContent?.trim() ?? "",
          };
        };

        const card = document.querySelector("[aria-pressed]");
        return card ? box(card) : null;
      });

    const before = await measure();
    expect(before, "選択肢の文字が見つからない").not.toBeNull();

    await choice.click();
    // 選択の見た目（枠・地の色）が変わりきるのを待つ
    await expect(choice).toHaveAttribute("aria-pressed", "true");

    const after = await measure();
    expect(after, "選択後に文字が見つからない").not.toBeNull();

    /*
      許すのは 2px まで。選ぶと文字が太字（font-bold）にもなるので、
      フォントのヒンティングでサブピクセル単位のずれは起きる
      ——直したいのはそこではない。以前の不具合は、チェックの印が
      無いところに急に現れて文字の幅が 20px 以上縮む、という
      折り返し位置そのものが変わる規模のもの。
    */
    const TOLERANCE_PX = 2;
    expect(
      Math.abs(after!.x - before!.x),
      `選ぶと文字の開始位置が動いた: ${before!.x} → ${after!.x}`,
    ).toBeLessThan(TOLERANCE_PX);
    expect(
      Math.abs(after!.width - before!.width),
      `選ぶと文字の幅が変わった: ${before!.width} → ${after!.width}`,
    ).toBeLessThan(TOLERANCE_PX);
    expect(
      after!.height,
      `選ぶと行数（高さ）が変わった: ${before!.height} → ${after!.height}`,
    ).toBe(before!.height);
  });

  for (const width of [375, 390]) {
    test(`幅${width}で、選択肢が2行に折り返さない`, async ({ page }) => {
      /*
        以前は**文字が長いから**折り返していると思われていたが、実測すると
        原因は札の幅の配り方だった。375px の2列で、絵と印を横に並べたぶん
        文字に残るのが 61px しかなく、「もっと短く」（5字）でも2行、
        「自分で条件を追加」（8字）は3行になっていた。

        縦積みにして文字が札の幅いっぱいを使えるようにしてある。
        ここでは**実際の行ボックスの数**を数える——高さから推測すると、
        行間の設定を変えたときに気づけない。
      */
      await page.setViewportSize({ width, height: 900 });
      await openDiagnosisQuestion(page);

      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => {
              const timing = animation.effect?.getTiming();
              return timing?.iterations !== Infinity;
            })
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );

      const wrapped = await       page.evaluate(() => {
        /*
          札の中の**文字だけ**を測る。

          要素ごと測ると、チップの組み方（ボタン直下にアイコンと文字が
          並ぶ）でアイコンの矩形まで拾い、行数が水増しされる。
          テキストノードを1つずつ Range で囲って、行の上端の種類を数える。

          クラス名では指さない。札を縦積みにした日や、ラベルが短くて
          別の組み方に切り替わった日に、テストだけが黙って
          何も見つけられなくなる。
        */
        const box = (card: Element) => {
          const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
          const rects: DOMRect[] = [];
          let node = walker.nextNode();
          while (node) {
            if (node.textContent?.trim()) {
              const range = document.createRange();
              range.selectNodeContents(node);
              rects.push(
                ...Array.from(range.getClientRects()).filter(
                  (rect) => rect.width > 1 && rect.height > 1,
                ),
              );
            }
            node = walker.nextNode();
          }
          if (!rects.length) return null;

          const tops = rects.map((rect) => Math.round(rect.top));
          return {
            x: Math.min(...rects.map((rect) => rect.left)),
            width:
              Math.max(...rects.map((rect) => rect.right)) -
              Math.min(...rects.map((rect) => rect.left)),
            height:
              Math.max(...rects.map((rect) => rect.bottom)) - Math.min(...tops),
            lines: new Set(tops).size,
            text: card.textContent?.trim() ?? "",
          };
        };

        const rows: { text: string; lines: number }[] = [];
        for (const card of document.querySelectorAll("[aria-pressed]")) {
          const measured = box(card);
          if (measured && measured.lines > 1) {
            rows.push({ text: measured.text, lines: measured.lines });
          }
        }
        return rows;
      });

      expect(
        wrapped,
        `折り返している選択肢: ${wrapped.map((r) => `${r.text}(${r.lines}行)`).join(", ")}`,
      ).toEqual([]);
    });
  }

  for (const width of [375, 390]) {
    test(`幅${width}で、条件のタイルが2行に折り返さない`, async ({ page }) => {
      /*
        タイル（`steps/Tiles.tsx`）は診断とは別の組み方。診断の選択肢は
        ラベルが短くなったぶんチップ表示に切り替わったので、**タイルは
        診断を見ているだけでは通らない**。ここで別に押さえる。

        直す前は、絵と印を横に並べたぶん文字に残る幅が 61px しかなく、
        「もっと短く」（5字）でも2行になっていた。
      */
      await page.setViewportSize({ width, height: 900 });
      await openConditionTiles(page);

      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => {
              const timing = animation.effect?.getTiming();
              return timing?.iterations !== Infinity;
            })
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );

      const wrapped = await page.evaluate(() => {
        const box = (card: Element) => {
          const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
          const rects: DOMRect[] = [];
          let node = walker.nextNode();
          while (node) {
            if (node.textContent?.trim()) {
              const range = document.createRange();
              range.selectNodeContents(node);
              rects.push(
                ...Array.from(range.getClientRects()).filter(
                  (rect) => rect.width > 1 && rect.height > 1,
                ),
              );
            }
            node = walker.nextNode();
          }
          if (!rects.length) return null;
          const tops = rects.map((rect) => Math.round(rect.top));
          return { lines: new Set(tops).size, text: card.textContent?.trim() ?? "" };
        };

        const rows: { text: string; lines: number }[] = [];
        const tiles = document.querySelector('[data-testid="choice-tiles"]');
        for (const card of tiles?.querySelectorAll("[aria-pressed]") ?? []) {
          const measured = box(card);
          if (measured && measured.lines > 1) {
            rows.push({ text: measured.text, lines: measured.lines });
          }
        }
        return rows;
      });

      expect(
        wrapped,
        `折り返しているタイル: ${wrapped.map((r) => `${r.text}(${r.lines}行)`).join(", ")}`,
      ).toEqual([]);
    });
  }
});
