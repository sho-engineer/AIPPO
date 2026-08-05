/**
 * ポーの絵が、2つの置き場所で食い違わないこと。
 *
 * いまポーの絵は2か所にある。
 *
 *   public/poe/       … タイトル画面、エラー画面（PoeAvatar）
 *   public/assets/po/ … レッスン、コース一覧（PoAvatar）
 *
 * 同じ8枚を2か所に置いているので、差し替えるときに
 * 片方だけ直すと、画面によって別の絵が出る。
 *
 * その状態は、差し替えた本人からは見えにくい。直したほうの画面を開いて
 * 「差し替わった」と確認して終わるためで、気づくのは別の画面を開いた
 * 誰かになる。ここで機械に見張らせる。
 *
 * 本筋は1系統へまとめること。まとめたら、このテストは消してよい。
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const POE = join(process.cwd(), "public", "poe");
const PO = join(process.cwd(), "public", "assets", "po");

/** ポーの表示状態8つ。 */
const EMOTIONS = [
  "neutral",
  "question",
  "thinking",
  "talking",
  "hint",
  "warning",
  "celebrate",
  "blink",
] as const;

function digest(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function images(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".webp"))
    .sort();
}

describe("ポーの絵", () => {
  it("8つの表情が、どちらの置き場所にもある", () => {
    const expected = EMOTIONS.map((emotion) => `${emotion}.webp`).sort();

    expect(images(POE)).toEqual(expected);
    expect(images(PO)).toEqual(expected);
  });

  it("2つの置き場所で同じ絵になっている", () => {
    for (const emotion of EMOTIONS) {
      expect(
        digest(join(PO, `${emotion}.webp`)),
        `${emotion} が2か所で違う。片方だけ差し替えると、` +
          `画面によって別の絵が出る（public/poe/README.md 参照）`,
      ).toBe(digest(join(POE, `${emotion}.webp`)));
    }
  });
});
