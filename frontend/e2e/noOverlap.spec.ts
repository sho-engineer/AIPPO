/**
 * 押しても、文字が重ならないこと。
 *
 * なぜ要るか
 * ----------
 * 高さの検査（`stepFits`）は「1画面に収まっているか」しか見ない。
 * ページも枠も送れていないのに**要素どうしが重なっている**ずれは、
 * 高さを測るだけでは見つからない。実機の写しで崩れて見える画面が
 * 出たとき、数で裏を取る手段が無かった。
 *
 * どう見るか
 * ----------
 * 画面の中の**文字を持つ、いちばん内側の箱**を総当たりで突き合わせ、
 * 四角どうしが重なっていたら落とす。親子は重なって当然なので、
 * **どちらも相手を含まない**組だけを見る。
 *
 * 見えていない文字を数えない（ここで2回間違えた）
 * ----------------------------------------------
 * この検査を書いた最初の版は、実在しない重なりを2件「見つけた」。
 * **道具のほうが間違っていた。** 直したのは2つ。
 *
 *   ① 閉じた `<details>` の中身
 *      `content-visibility: hidden` の下にあり、
 *      `getBoundingClientRect()` は**畳む前の箱をそのまま返す**。
 *      閉じた「ここまでに答えた内容」の中身が 122px の箱を返し、
 *      下の見出しと重なっていることになっていた。
 *      → `checkVisibility()` に聞く。
 *
 *   ② 切り取られた行
 *      `line-clamp` は `overflow: hidden` で切るので、**切られて
 *      見えていない行も四角を返す**。固定の帯の下に潜っている行も同じ。
 *      → 祖先の切る箱と交差させて、**実際に描かれている四角**で見る。
 *
 *   ③ 章扉
 *      題は絵の上に `absolute inset-0`、「つづける」はさらにその上。
 *      **重ねることそのものが、この画面の作り**なので、総当たりでは
 *      必ず当たる。章扉は見ないことにした（重なっていることは
 *      `e2e/sectionTransition.spec.ts` が別に見張っている）。
 *
 * ①②は「画面に出ていないもの」を、③は「重なって正しいもの」を
 * 数えていた。重なりを数で見る道具は、**何が読めないことなのかを
 * 先に決められないと使いものにならない。**
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

    /*
      章扉は見ない。**そこの重なりは、わざと。**

      章扉は絵1枚の画面で、題は絵の上に `absolute inset-0` で置いて
      あり、「つづける」はさらにその上へ重ねてある——下に別の行を
      作ると、1枚の章扉ではなく「絵＋操作の行」に見えるため
      （`components/course/SectionTransition.tsx`）。

      つまりここでは、画面いっぱいの題と小さなボタンが必ず重なる。
      総当たりの検査はそれを「読めない」と読むが、実際は読める
      ——重ねることそのものが、この画面の作り。

      重なっていることは別の検査が見張っている
      （`e2e/sectionTransition.spec.ts` の「「つづける」が、絵の上に
      重なっている」）。見張りが無くなるわけではない。

      これで**3つ目**の取りこぼし。1つ目は閉じた `<details>`、2つ目は
      切り取られた行、そしてこれ。どれも「画面に出ていないもの」か
      「重なって正しいもの」を数えていた。
    */
    if (document.querySelector("[data-testid='section-transition']")) return [];

    /*
      **実際に描かれている四角**を返す。無ければ null。

      要素そのものの四角では足りない。`line-clamp` は
      `overflow: hidden` で切るので、**切られた行も四角は返す**
      ——切られて見えていない文字を「重なっている」と数えてしまう。
      固定の帯の下に潜っている行も同じ。

      祖先をたどって、切る箱（`overflow` が `visible` でないもの）の
      内側と交差させる。残った四角が、目に見えている部分。
    */
    const shown = (el: Element): DOMRect | null => {
      let box = el.getBoundingClientRect();
      let node: Element | null = el.parentElement;
      while (node) {
        const style = getComputedStyle(node);
        if (style.overflowX !== "visible" || style.overflowY !== "visible") {
          const clip = node.getBoundingClientRect();
          const left = Math.max(box.left, clip.left);
          const top = Math.max(box.top, clip.top);
          const right = Math.min(box.right, clip.right);
          const bottom = Math.min(box.bottom, clip.bottom);
          if (right <= left || bottom <= top) return null;
          box = new DOMRect(left, top, right - left, bottom - top);
        }
        node = node.parentElement;
      }
      return box;
    };

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
      /*
        **見えているかは `checkVisibility` で聞く。**

        `getComputedStyle` の `visibility` と `opacity` だけでは足りない。
        閉じた `<details>` の中身は `content-visibility: hidden` の下に
        あり、`getBoundingClientRect()` は**畳む前の箱をそのまま返す**
        ——実測で、閉じた「ここまでに答えた内容」の中身が 122px の箱を
        返し、その下の見出しと重なっていることになっていた。

        画面には出ていないので、これは重なりではない。最初にこの検査を
        書いたとき、それを2件「見つけた」と報告した。**道具のほうが
        間違っていた。**
      */
      if (!el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) {
        return false;
      }
      const box = shown(el);
      return box !== null && box.width > 4 && box.height > 4;
    });

    const found: { a: string; b: string; by: number }[] = [];
    for (let i = 0; i < leaves.length; i += 1) {
      for (let j = i + 1; j < leaves.length; j += 1) {
        const one = leaves[i];
        const two = leaves[j];
        if (one.contains(two) || two.contains(one)) continue;
        const a = shown(one);
        const b = shown(two);
        if (!a || !b) continue;
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
  test("Day1 のどの回でも重ならない", async ({ page }, testInfo) => {
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

  test("「自分で条件を追加」を押しても重ならない", async ({ page }, testInfo) => {
    /*
      実機の写しで崩れて見えた回。押すと、元の文の札が下の選択肢の上へ
      落ちてきているように見えた。

      **これは重なりではなかった。** 実寸では本文カード（y367→471）と
      選択肢（y483→727）が一切重なっていない。正体は
      `overflow-y-auto` の箱が縮むときに iPhone の Safari が描き直しを
      取りこぼし、**古い位置の文字が残る**こと。箱そのものをやめて
      直してある（`components/course/StepRenderer.tsx`）。

      ここでは、**やめたあとに本当の重なりが生まれていないこと**を見る。
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


