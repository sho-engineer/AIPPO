/**
 * 全体図の絵を書き出す。
 *
 *     node scripts/teaching-images/render.mjs day1_overview
 *
 * 出るのは PNG。WebP への変換は to-webp.py が受け持つ
 * （Chromium の canvas は可逆にしても VP8X の器へ入れてしまい、
 * 教材の絵が揃えている VP8L にならない）。
 *
 * public/ をそのまま配る小さなサーバーを立てる。書体もポーも
 * **アプリが使っているものをそのまま**読ませたいので、写しを作らない。
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, "../../public");
/*
  書体の宣言は public/ ではなく src/styles/ にある（Vite が束ねる）。
  版下からは素の `<link>` で読むので、ここだけ別に配る。
  写しを作らないのは、アプリと違う書体で焼いてしまわないため。
*/
const FONT_CSS = resolve(HERE, "../../src/styles/fonts.css");
const OUT = resolve(HERE, "out");

const day = process.argv[2] ?? "day1_overview";
const PORT = 4331;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/** `..` で外へ出られないようにしてから、その根の下だけを見る。 */
function safeJoin(root, urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const full = join(root, rel);
  return full.startsWith(root) ? full : null;
}

const server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  // 版下と控えはこのフォルダから、それ以外は public/ から
  const root = path === "/overview.html" || path === "/overviews.json" ? HERE : PUBLIC;
  const file =
    path === "/fonts.css" ? FONT_CSS : safeJoin(root, path === "/" ? "/overview.html" : path);

  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});

await new Promise((ok) => server.listen(PORT, "127.0.0.1", ok));

const browser = await chromium.launch({
  // 用意されているブラウザを使う（この環境では取りに行けない）
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 700, height: 700 }, deviceScaleFactor: 2 });

const problems = [];
page.on("requestfailed", (r) => {
  if (r.url().endsWith("/favicon.ico")) return;
  problems.push(`${r.url()} :: ${r.failure()?.errorText}`);
});
page.on("pageerror", (e) => problems.push(String(e)));
page.on("response", (r) => {
  if (r.status() < 400) return;
  if (r.url().endsWith("/favicon.ico")) return;
  problems.push(`${r.status()} ${r.url()}`);
});
page.on("console", (m) => {
  if (m.type() !== "error") return;
  /*
    「Failed to load resource」だけの行は捨てる。どの URL かが入って
    いないので直しようがなく、favicon を取りに行った音で毎回出る。
    本物の 404 は上の `response` が URL 付きで拾う。
  */
  if (m.text().startsWith("Failed to load resource")) return;
  problems.push(m.text());
});

await page.goto(`http://127.0.0.1:${PORT}/overview.html?day=${day}`, {
  waitUntil: "networkidle",
});
// 版下が書体を待ってから立てる印。待たずに撮ると代替書体で焼ける
await page.waitForSelector("#board[data-ready]");

mkdirSync(OUT, { recursive: true });
const out = join(OUT, `${day}.png`);
await page.locator("#board").screenshot({ path: out });

await browser.close();
server.close();

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
/*
  支給された絵の日は、ここで出た PNG は**試し刷り**。よく似ているが
  配信されているものではない（同じ文言を読ませているので似て当然）。
  取り違えないように言っておく。
*/
const facts = JSON.parse(readFileSync(join(HERE, "overviews.json"), "utf8"));
if (facts.images?.[day]?.source === "supplied") {
  console.log(`${out}
${day} は支給された絵。いま出たのは試し刷りで、配信されているものではない。
置き換えるつもりなら to-webp.py に --force が要る。`);
} else {
  console.log(`${out}\n次: python3 scripts/teaching-images/to-webp.py ${day}`);
}
