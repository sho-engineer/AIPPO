/**
 * ルートの vercel.json が、実際に呼ぶURLを正しい行き先へ振り分けること。
 *
 * ここを間違えると、ビルドもデプロイも成功したまま画面だけ404になる。
 * ログにも何も出ないので、原因にたどり着くのに時間がかかる。
 *
 * 実際に一度やった: `source` を `/api/:path*`（path-to-regexp 記法）で
 * 書いた版をデプロイしたところ、`/health/ready` は 200 なのに
 * `/`・`/admin/`・`/api/v1/catalog/` が揃って404になった。
 * 通ったものだけスラッシュで終わっていないので、末尾スラッシュの
 * 取りこぼしが疑わしいが、Vercel 上での実際の展開結果は確認できていない。
 * そこで、記法を素の正規表現に寄せた（`(.*)`。Vercel の Services の
 * 公式例もこの形）。
 *
 * このテストは `source` を**正規表現として**読んで判定する。
 * いま入っているのは全て素の正規表現なので、その範囲では実物と一致する。
 * path-to-regexp 記法（`:path*` など）に書き換えると、このテストの
 * 解釈と Vercel の解釈がずれる。書き換えるなら実機で確かめること。
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(process.cwd(), "..");

type Rewrite = {
  source: string;
  destination: { service: string } | string;
};

function rewrites(): Rewrite[] {
  const config = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8"));
  return config.rewrites;
}

/** vercel.json の並び順どおりに、最初に当たった行き先を返す。 */
function serviceFor(path: string): string {
  for (const rule of rewrites()) {
    if (new RegExp(`^${rule.source}$`).test(path)) {
      return typeof rule.destination === "string"
        ? rule.destination
        : rule.destination.service;
    }
  }
  return "(どこにも当たらない=404)";
}

/** src/api/*.ts に直書きされている `${apiBaseUrl()}/...` のパスを集める。 */
function apiPathsInSource(): string[] {
  const dir = join(process.cwd(), "src", "api");
  const found = new Set<string>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".ts")) continue;
    const source = readFileSync(join(dir, name), "utf8");
    for (const [, path] of source.matchAll(/\$\{apiBaseUrl\(\)\}(\/[^\s`"']*)/g)) {
      // `${...}` を含む動的な部分は、その手前までを見れば行き先は決まる。
      found.add(path.split("$")[0]);
    }
  }
  return [...found];
}

describe("vercel.json のルーティング", () => {
  it("画面のコードが実際に呼ぶAPIが、全てバックエンドへ行く", () => {
    const paths = apiPathsInSource();
    // 集められていなければテストが素通りしてしまうので、まず件数を確かめる。
    expect(paths.length).toBeGreaterThan(3);

    for (const path of paths) {
      expect(serviceFor(path), `${path} の行き先`).toBe("backend");
    }
  });

  it.each([
    // 末尾スラッシュ付き——ここが以前に取りこぼされていた
    ["/api/v1/catalog/", "backend"],
    ["/api/v1/ai/generate/", "backend"],
    ["/admin/", "backend"],
    // 末尾スラッシュ無し
    ["/health/live", "backend"],
    ["/health/ready", "backend"],
    ["/healthz", "backend"],
    ["/readyz", "backend"],
    // 管理画面のCSSは whitenoise が /static/ で配る
    ["/static/admin/css/base.css", "backend"],
    // 画面側
    ["/", "frontend"],
    ["/assets/index-DeaB7cEv.js", "frontend"],
    ["/favicon.png", "frontend"],
  ])("%s は %s へ行く", (path, expected) => {
    expect(serviceFor(path)).toBe(expected);
  });

  it("Django の全ルートがバックエンドへ届く", () => {
    const urls = readFileSync(join(REPO_ROOT, "backend", "config", "urls.py"), "utf8");
    const declared = [...urls.matchAll(/^\s*path\(\s*"([^"]*)"/gm)].map(([, p]) => `/${p}`);

    // urls.py を読めていなければ意味が無いので、件数を確かめてから回す。
    expect(declared.length).toBeGreaterThan(10);

    for (const path of declared) {
      expect(serviceFor(path), `urls.py の ${path} の行き先`).toBe("backend");
    }
  });
});
