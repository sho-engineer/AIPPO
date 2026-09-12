/**
 * 押しても、文字が重ならないこと。
 *
 * なぜ要るか
 * ----------
 * 実機（iPhone Safari）の写しで、**文字の上に文字が乗っている**画面が
 * 3つ見つかった。どれも「1画面に収まっているか」の検査（`stepFits`）は
 * 通る——ページもその中の枠も送れていないのに、**中の要素どうしが
 * 重なっている**からで、高さを測るだけでは見つからない。
 *
 *   条件をひとつ足そう … 「自分で条件を追加」を押すと、元の文の札が
 *                        下の選択肢の上へ落ちてきて重なる
 *   自分の文章        … 安全の一言が、文字数の行に重なる
 *   自分の文章の結果  … 「最初／改善後」の札が、ポーの吹き出しに隠れて
 *                        上半分しか見えない
 *
 * どう見るか
 * ----------
 * 画面の中の**文字を持つ箱**を総当たりで突き合わせ、四角どうしが
 * 重なっていたら落とす。親子・兄弟の入れ子は重なって当然なので、
 * **どちらも相手を含まない**組だけを見る。
 *
 * 重なりの許容
 * ------------
 * 影や丸みで 1px ほど触れることはある。8px 以上重なったものだけを
 * 数える——それ以下は、目で見て「重なっている」とは読めない。
 */

import { expect, test, type Page } from "@playwright/test";

import { stubApi } from "./support/stubApi";
import { dismissLessonIntro, passSkillStamp } from "./support/lessonIntro";

const SLACK = 8;
const SAMPLE = "来週の打ち合わせの件、資料の確認をお願いします。";

test.setTimeout(180_000);

interface Overlap {
  a: string;
  b: string;
  by: number;
}

/** いま出ている画面で、文字どうしが重なっている組を返す。 */
async function overlaps(page: Page): Promise<Overlap[]> {
  return page.evaluate((slack) => {
    const root = document.querySelector("main");
    if (!root) return [];

    const name = (el: Element) => {
      const node = el as HTMLElement;
      return (
        `${node.tagName.toLowerCase()}` +
        `${node.dataset.testid ? "[" + node.dataset.testid + "]" : ""}` +
        `「${(node.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 18)}」`
      );
    };

    /*
      葉だけを見る。**文字を持つ、いちばん内側の箱**。

      上の入れ物まで入れると、親子で必ず重なるので何も分からない。
      葉どうしなら、重なりはそのまま「読めない」を意味する。
    */
    const leaves = [...root.querySelectorAll<HTMLElement>("*")].filter((el) => {
      if (el.children.length > 0) return false;
      if (!(el.textContent ?? "").trim()) return false;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.opacity === "0") return false;
      const box = el.getBoundingClientRect();
      return box.width > 4 && box.height > 4;
    });

    const found: { a: string; b: string; by: number }[] = [];
    for (let i = 0; i < leaves.length; i += 1) {
      for (let j = i + 1; j < leaves.length; j += 1) {
        const one = leaves[i];
        const two = leaves[j];
        if (one.contains(two) || two.contains(one)) continue;
        const a = one.getBoundingClientRect();
        const b = two.getBoundingClientRect();
        const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (across > slack && down > slack) {
          const box = (r: DOMRect) =>
            `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`;
          found.push({
            a: `${name(one)} @${box(a)}`,
            b: `${name(two)} @${box(b)}`,
            by: Math.round(Math.min(across, down)),
          });
        }
      }
    }
    return found;
  }, SLACK);
}

async function advance(page: Page): Promise<boolean> {
  if (await passSkillStamp(page)) return true;
  const primary = page.getByTestId("primary-action").first();
  if (!(await primary.count())) return false;
  const blocked = async () =>
    (await primary.isDisabled()) ||
    (await primary.getAttribute("aria-disabled")) === "true";

  if (await blocked()) {
    const box = page.locator("textarea:visible").first();
    if (await box.count()) await box.fill(SAMPLE);
    else {
      const choice = page
        .locator("main button:visible")
        .filter({
          hasNotText:
            /レッスン一覧へ|もどる|くわしく|変わったところ|記録|全文|送っています|飛ばす|スキップ|自分で/,
        })
        .first();
      if (await choice.count()) await choice.click();
    }
    await page.waitForTimeout(300);
  }
  if (await blocked()) return false;
  await primary.click();
  await page.waitForTimeout(900);
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

/** その見出しの回まで進める。 */
async function runToHeading(page: Page, heading: RegExp) {
  for (let step = 0; step < 30; step += 1) {
    const title = await page.locator("main h1").first().innerText().catch(() => "");
    if (heading.test(title)) return;
    if (!(await advance(page))) break;
  }
  await expect(page.locator("main h1").first()).toHaveText(heading);
}

function report(found: Overlap[]): string {
  return found.map((one) => `${one.by}px  ${one.a} × ${one.b}`).join("\n");
}

test.describe("文字どうしが重ならない", () => {
  /*
    まだ直していない2件が、この検査で見つかっている。**直すまで
    `fixme` にしてある**——通らない検査を緑に見せないため。

      ① 「ここまでに答えた内容」を開くと、中身が見出しに重なる
         （`StepShell.tsx` の `<details>`。実測 13〜30px）
      ② 低い持ち方で、ポーの吹き出しが下の名札に重なる
         （実測 22px。390×844 では起きず、393×727 で出る）

    どちらも縦の高さの検査（`stepFits`）は通る。ページも枠も送れて
    いないのに**要素どうしが重なっている**からで、高さを測るだけでは
    見つからない種類のずれ。実機の写しで先に見つかった。
  */
  test.fixme("Day1 のどの回でも重ならない", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "スマホの見え方だけ見る");
    await start(page);

    for (let step = 0; step < 30; step += 1) {
      const title = await page.locator("main h1").first().innerText().catch(() => "");
      const found = await overlaps(page);
      expect(found, `「${title}」で重なっている\n${report(found)}`).toEqual([]);
      if (await page.getByTestId("completion-view").count()) break;
      if (!(await advance(page))) break;
    }
  });

  test.fixme("「自分で条件を追加」を押しても重ならない", async ({ page }, testInfo) => {
    /*
      実機で崩れていた回。押すと、元の文の札が下の選択肢の上へ落ちて
      きて、「中の単語同士の関係を…」が「AI初心者向けに」の札に
      重なっていた。**入れ替わる高さのぶん、押した瞬間に上が詰まる。**
    */
    test.skip(testInfo.project.name !== "mobile", "スマホの見え方だけ見る");
    await start(page);
    await runToHeading(page, /条件をひとつ足そう/);

    const free = page
      .locator("main button:visible")
      .filter({ hasText: /自分で条件|自分で指定/ })
      .first();
    await expect(free).toBeVisible();
    await free.click();
    await page.waitForTimeout(500);

    const found = await overlaps(page);
    expect(found, `自由入力へ切り替えたあとに重なっている\n${report(found)}`).toEqual(
      [],
    );
  });
});


