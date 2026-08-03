import { describe, expect, it } from "vitest";

import { isBlocking, scanForSensitive } from "../src/lib/privacy";

/**
 * 送信前の確認（要件 §7）。
 *
 * 完全な判定は目指さない。目的は「気づかずに送ってしまう」のを
 * 減らすことで、検閲することではない。
 *
 * だから **見逃しより誤検知のほうが害が大きい**。
 * ふつうの文章で毎回警告が出るようになると、誰も読まなくなる。
 */

const kinds = (text: string) => scanForSensitive(text).map((finding) => finding.id);

describe("強く警告するもの（初期状態では送れない）", () => {
  it.each([
    ["APIキー", "設定は sk-abcdefghijklmnopqrstuvwx です"],
    ["AWSのキー", "AKIAIOSFODNN7EXAMPLE を使っています"],
    ["GitHubのトークン", "ghp_abcdefghijklmnopqrstuvwxyz012345"],
    ["パスワード", "パスワードは Hunter2024! です"],
    ["カード番号", "4111 1111 1111 1111 で払いました"],
  ])("%s は送信を止める", (_label, text) => {
    const findings = scanForSensitive(text);
    expect(findings.length).toBeGreaterThan(0);
    expect(isBlocking(findings)).toBe(true);
  });
});

describe("確認を促すもの（確認すれば送れる）", () => {
  it.each([
    ["メールアドレス", "連絡先は tanaka@example.co.jp です", "email"],
    ["電話番号", "電話は 03-1234-5678 です", "phone"],
    ["携帯番号", "090-1234-5678 にかけてください", "phone"],
    ["住所", "東京都千代田区丸の内1丁目1番地", "address"],
    ["社外秘の表現", "この資料は社外秘です", "confidential"],
  ])("%s は警告する", (_label, text, id) => {
    const findings = scanForSensitive(text);
    expect(findings.map((finding) => finding.id)).toContain(id);
    expect(isBlocking(findings)).toBe(false);
  });
});

describe("誤検知させない", () => {
  it.each([
    "先日の件ですが、対応を進めております。",
    "来週の火曜日までに提出します。",
    "売上は前年比110%でした。",
    "2026年8月3日の会議は10時からです。",
    "パスワードの管理方法について相談したいです。",
    "資料は3ページと10ページを見てください。",
  ])("ふつうの文章では出さない: %s", (text) => {
    expect(scanForSensitive(text)).toEqual([]);
  });

  it("空の入力では何も出さない", () => {
    expect(scanForSensitive("")).toEqual([]);
    expect(scanForSensitive("   ")).toEqual([]);
  });
});

describe("見つけた中身そのものは持たない", () => {
  it("結果に元の文字列が入っていない", () => {
    // 警告のために本文を持ち回ると、それはそれで危ない
    const secret = "tanaka@example.co.jp";
    const findings = scanForSensitive(`連絡先は ${secret} です`);

    for (const finding of findings) {
      expect(JSON.stringify(finding)).not.toContain(secret);
    }
  });
});

describe("複数見つかったとき", () => {
  it("強いものが1つでもあれば止める", () => {
    const findings = scanForSensitive(
      "連絡先は a@b.co.jp、パスワードは Hunter2024! です",
    );
    expect(kinds("連絡先は a@b.co.jp です")).toContain("email");
    expect(isBlocking(findings)).toBe(true);
  });
});
