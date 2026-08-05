/**
 * 画面に出す版と、リリースノートの版が食い違わないこと。
 *
 * 版は設定の「AIPPOについて」に出る。ベータでは、感想をもらったときに
 * **どの版の話なのか**を突き合わせるためにある。ここがずれていると、
 * 直したはずの不具合の報告が古い版のものに見え、追いかけ方を間違える。
 *
 * 実際、0.9.1 と 0.9.2 を出したあとも `0.9.0-beta.1` のままだった。
 * 版を上げるのはリリースの最後で、そのとき画面側は誰も見ないので、
 * 気づかないまま次の版が出る。人ではなく機械に見張らせる。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_VERSION } from "../src/content/ui";

/** リリースノートの見出しから版を取る。 */
function versionInReleaseNotes(): string {
  const notes = readFileSync(join(process.cwd(), "..", "RELEASE_NOTES.md"), "utf8");
  const found = notes.match(/^#\s+AIPPO\s+クローズドベータ\s+(\S+)/m);
  if (!found) throw new Error("RELEASE_NOTES.md の見出しから版を読めませんでした");
  return found[1];
}

describe("版の表示", () => {
  it("画面の版と、リリースノートの版が同じ", () => {
    expect(
      APP_VERSION,
      "設定画面の版が古いままです。`src/content/ui.ts` の APP_VERSION を直してください",
    ).toBe(versionInReleaseNotes());
  });

  it("完成したものに見える番号にしない", () => {
    // 1.0 と書くと、受け取った人は「完成したもの」として扱う
    expect(APP_VERSION.startsWith("0.")).toBe(true);
  });
});
