/**
 * いまコードにある教材を JSON へ書き出す。
 *
 * 骨格を Python へ移したあと、「1文字も変わっていない」ことを
 * 突き合わせるための正解データを作るためだけの道具。
 * esbuild で TypeScript をその場で1枚に束ねてから読み込む。
 */
import { build } from "esbuild";
import { writeFileSync } from "node:fs";

const result = await build({
  entryPoints: ["src/course/catalog.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  // 画面の部品を引き込まないよう、絵だけは空にする
  external: ["react"],
});

const code = result.outputFiles[0].text;
const module = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

writeFileSync("catalog-snapshot.json", JSON.stringify(module.COURSE, null, 2) + "\n");
console.log("lessons", module.COURSE.lessons.length);
console.log("steps", module.COURSE.lessons.map((l) => `${l.id}:${l.steps.length}`).join(" "));
