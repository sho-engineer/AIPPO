/**
 * Lesson Spec の検査。
 *
 *     npm run validate:lessons
 *
 * 何を見るか
 * ----------
 * Spec（`content/lessons/*.yaml`）そのものの形と、**実装との食い違い**。
 * Spec は実装の正本ではない（正本は catalog.ts → seed_catalog.json → DB）
 * ので、ここでいちばん効くのは後者——設計書だけが古くなるのを止める。
 *
 * Error と Warning
 * ----------------
 * **機械で確かめられることだけ Error。** 1件でもあれば CI を止める。
 *
 * 「目標が2つのテーマに見える」「この技名は既存と意味が近い」のような、
 * 読んで判断することは Warning にする。Error にすると、判断を機械に
 * 委ねたことになり、通すために言葉を削る方向へ力が働く——決まりを
 * 守るためのものが、決まりを骨抜きにする。
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { parse } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const LESSONS = join(ROOT, "content/lessons");
const REGISTRY = join(ROOT, "content/skill-registry.yaml");

/** 状態の値。意味は docs/aippo/lesson-status-rule.md */
const STATUSES = ["draft", "review", "coming_soon", "published", "paused"];
/** AI技の使われ方。 */
const USAGES = ["new", "review", "application"];
/** 各章に要る8項目。1つでも欠けると、作る人が何を書くか決められない */
const SECTION_FIELDS = [
  "name",
  "user_goal",
  "user_action",
  "ai_action",
  "expected_output",
  "user_notices",
  "learning_takeaway",
  "next_action",
];
/** AIへの指示に要るもの。 */
const PROMPT_FIELDS = [
  "user_input",
  "system_instruction",
  "output_format",
  "expected_behavior",
  "failure_handling",
];

const errors = [];
const warnings = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

const filled = (value) => typeof value === "string" && value.trim().length > 0;

/** 同梱の教材データ。**実装の正本**をそのまま読む。 */
async function loadCatalog() {
  const out = join(ROOT, "frontend/node_modules/.cache/aippo-catalog.mjs");
  await build({
    entryPoints: [join(ROOT, "frontend/src/course/catalog.ts")],
    bundle: true,
    format: "esm",
    outfile: out,
    logLevel: "silent",
  });
  return import(`${out}?t=${Date.now()}`);
}

function loadRegistry() {
  if (!existsSync(REGISTRY)) {
    fail("skill-registry", "content/skill-registry.yaml が無い");
    return { skills: [] };
  }
  const registry = parse(readFileSync(REGISTRY, "utf8")) ?? {};
  const skills = Array.isArray(registry.skills) ? registry.skills : [];

  const byId = new Map();
  const byLabel = new Map();
  for (const skill of skills) {
    if (!filled(skill.id)) {
      fail("skill-registry", "id の無い技がある");
      continue;
    }
    if (byId.has(skill.id)) fail("skill-registry", `id が重複: ${skill.id}`);
    byId.set(skill.id, skill);

    if (!filled(skill.label)) fail("skill-registry", `${skill.id}: label が空`);
    if (!filled(skill.description)) {
      fail("skill-registry", `${skill.id}: description が空`);
    }
    /*
      同じ技を別IDで二重登録しない。**完全一致だけ Error。**
      「意味が近い」は下の Warning で報せる——近さは機械には決められない。
    */
    if (filled(skill.label)) {
      if (byLabel.has(skill.label)) {
        fail(
          "skill-registry",
          `label が重複: 「${skill.label}」（${byLabel.get(skill.label)} と ${skill.id}）`,
        );
      }
      byLabel.set(skill.label, skill.id);
    }
  }

  /*
    意味の近い技。**判断は人に残す。**
    片方がもう片方を含む名前（「出力形式の指定」と「形式指定」など）は、
    分けて持つ理由があることもあるので、止めずに報せるだけにする。
  */
  const labels = [...byLabel.keys()];
  for (let a = 0; a < labels.length; a += 1) {
    for (let b = a + 1; b < labels.length; b += 1) {
      if (labels[a].includes(labels[b]) || labels[b].includes(labels[a])) {
        warn(
          "skill-registry",
          `名前が近い: 「${labels[a]}」と「${labels[b]}」——同じ技なら1つにまとめる`,
        );
      }
    }
  }

  return { skills, byId };
}

function loadSpecs() {
  if (!existsSync(LESSONS)) {
    fail("lessons", "content/lessons/ が無い");
    return [];
  }
  return readdirSync(LESSONS)
    .filter((name) => name.endsWith(".yaml") && !name.startsWith("_"))
    .sort()
    .map((name) => ({
      file: `content/lessons/${name}`,
      spec: parse(readFileSync(join(LESSONS, name), "utf8")) ?? {},
    }));
}

function checkSpec({ file, spec }, registry, catalog, seen) {
  const at = spec.id ? `${file}(${spec.id})` : file;

  // ---------------------------------------------------------- 基本
  if (!filled(spec.id)) fail(at, "id が無い");
  else if (seen.ids.has(spec.id)) fail(at, `id が重複: ${spec.id}`);
  else seen.ids.add(spec.id);

  if (typeof spec.day !== "number") fail(at, "day が数字でない");
  else if (seen.days.has(spec.day)) fail(at, `day が重複: ${spec.day}`);
  else seen.days.add(spec.day);

  if (!filled(spec.slug)) fail(at, "slug が無い");
  else if (seen.slugs.has(spec.slug)) fail(at, `slug が重複: ${spec.slug}`);
  else seen.slugs.add(spec.slug);

  if (!filled(spec.title)) fail(at, "title が無い");
  if (!filled(spec.learning_goal)) fail(at, "learning_goal が無い");
  if (!STATUSES.includes(spec.status)) {
    fail(at, `status が定義外: ${spec.status}（${STATUSES.join(" / ")}）`);
  }

  /*
    目標が1つか。**読んで決めることなので Warning。**
    「〜し、〜できる」のように2つ並んでいたら報せる。
  */
  if (filled(spec.learning_goal) && /、.*(かつ|そして|また)/.test(spec.learning_goal)) {
    warn(at, "learning_goal が2つのことを言っているように見える");
  }
  if (filled(spec.learning_goal) && spec.learning_goal.length > 60) {
    warn(at, `learning_goal が ${spec.learning_goal.length}字。1つに絞れているか`);
  }

  // ---------------------------------------------------------- AI技
  const skills = Array.isArray(spec.ai_skills) ? spec.ai_skills : [];
  if (skills.length < 1 || skills.length > 3) {
    fail(at, `ai_skills が ${skills.length} 個（1〜3個）`);
  }
  const usedIds = new Set();
  for (const skill of skills) {
    if (!filled(skill?.id)) {
      fail(at, "ai_skills に id の無いものがある");
      continue;
    }
    if (usedIds.has(skill.id)) fail(at, `同じ技を2回: ${skill.id}`);
    usedIds.add(skill.id);

    if (!registry.byId?.has(skill.id)) {
      fail(at, `技が台帳に無い: ${skill.id}（content/skill-registry.yaml）`);
    }
    if (!USAGES.includes(skill.usage)) {
      fail(at, `${skill.id}: usage が定義外（${USAGES.join(" / ")}）`);
    }

    /*
      台帳の `first_introduced` と、Spec の `usage` が食い違わないこと。
      初出だと言っている技を `review` にしたり、その逆をしたりすると、
      どちらが本当か分からなくなる。
    */
    const known = registry.byId?.get(skill.id);
    if (known && skill.usage === "new" && known.first_introduced && known.first_introduced !== spec.id) {
      fail(
        at,
        `${skill.id} は台帳では ${known.first_introduced} が初出。ここで new にはできない`,
      );
    }
    if (known && skill.usage === "new" && !known.first_introduced) {
      warn(at, `${skill.id}: 台帳の first_introduced が空。${spec.id} を書き込む`);
    }
    if (known && skill.usage !== "new" && known.first_introduced === spec.id) {
      fail(at, `${skill.id} は台帳でこの Lesson が初出。usage は new`);
    }
  }

  // ---------------------------------------------------------- 章立て
  const sections = Array.isArray(spec.sections) ? spec.sections : [];
  if (sections.length === 0) fail(at, "sections が空");
  else if (sections.length < 3 || sections.length > 4) {
    warn(at, `sections が ${sections.length} 章（原則3〜4章）`);
  }
  const sectionIds = new Set();
  for (const [index, section] of sections.entries()) {
    const where = `${at} section[${index}]`;
    if (!filled(section?.id)) fail(where, "id が無い");
    else if (sectionIds.has(section.id)) fail(where, `id が重複: ${section.id}`);
    else sectionIds.add(section.id);

    for (const field of SECTION_FIELDS) {
      if (!filled(section?.[field])) fail(where, `${field} が空`);
    }
    if (filled(section?.user_action) && section.user_action.length > 80) {
      warn(where, `user_action が ${section.user_action.length}字。短くできないか`);
    }
  }

  // ------------------------------------------------------ AIへの指示
  const prompts = Array.isArray(spec.prompts) ? spec.prompts : [];
  if (prompts.length === 0) fail(at, "prompts が空");
  for (const [index, prompt] of prompts.entries()) {
    const where = `${at} prompt[${index}]`;
    if (!filled(prompt?.id)) fail(where, "id が無い");
    if (typeof prompt?.version !== "number") fail(where, "version が数字でない");
    for (const field of PROMPT_FIELDS) {
      if (!filled(prompt?.[field])) fail(where, `${field} が空`);
    }
    /*
      作業宣言を書かせない（`docs/aippo/ai-generation-policy.md`）。
      指示の中にその言い回しが混ざっていたら止める。
    */
    const DECLARATIONS = ["承知しました", "以下のように", "ご要望に合わせて", "まとめると以下"];
    for (const word of DECLARATIONS) {
      if ((prompt?.system_instruction ?? "").includes(word)) {
        fail(where, `作業宣言を書かせている: 「${word}」`);
      }
    }
  }

  // ---------------------------------------------------------- 画像
  const assets = spec.assets ?? {};
  const paths = [
    assets.lesson_overview,
    assets.completion_visual,
    ...(assets.section_intros ?? []),
    ...(assets.concept_visuals ?? []),
    ...(assets.compare_visuals ?? []),
  ].filter((one) => typeof one === "string" && one.length > 0);
  for (const path of paths) {
    const onDisk = join(ROOT, "frontend/public", path.replace(/^\//, ""));
    if (!existsSync(onDisk)) fail(at, `画像が無い: ${path}`);
  }
  if (paths.length > 6) {
    warn(at, `画像が ${paths.length} 枚。情報が増えるだけの絵が無いか`);
  }

  // ------------------------------------------------------ リリース
  const release = spec.release ?? {};
  if (spec.status === "published") {
    if (release.qa_status !== "passed") {
      fail(at, "published なのに release.qa_status が passed でない");
    }
    if (!filled(release.reviewed_by)) fail(at, "published なのに reviewed_by が無い");
    if (!filled(release.reviewed_at)) fail(at, "published なのに reviewed_at が無い");
  }

  // -------------------------------------------------- 実装との食い違い
  checkAgainstCatalog(at, spec, registry, catalog);
}

/**
 * Spec と、実際に動いている教材データのつき合わせ。
 *
 * **ここがこの検査のいちばんの仕事。** Spec だけを直して実装を忘れる、
 * あるいはその逆が、いちばん起きやすくていちばん気づきにくい。
 */
function checkAgainstCatalog(at, spec, registry, catalog) {
  if (!filled(spec.implementation_id)) {
    fail(at, "implementation_id が無い（catalog.ts の Lesson.id）");
    return;
  }
  const lesson = catalog.COURSE.lessons.find((one) => one.id === spec.implementation_id);
  if (!lesson) {
    fail(at, `実装が見つからない: ${spec.implementation_id}`);
    return;
  }

  if (lesson.title !== spec.title) {
    fail(at, `title が実装と違う: Spec「${spec.title}」/ 実装「${lesson.title}」`);
  }
  if (lesson.number !== spec.day) {
    fail(at, `day が実装と違う: Spec ${spec.day} / 実装 ${lesson.number}`);
  }
  if (lesson.estimatedMinutes !== spec.estimated_minutes) {
    warn(
      at,
      `estimated_minutes が実装と違う: Spec ${spec.estimated_minutes} / 実装 ${lesson.estimatedMinutes}`,
    );
  }

  /*
    公開状態。**Spec と実装がずれていたら止める。**
    Spec で published と書いてあるのに実装が近日公開のままだと、
    「公開したつもり」で終わる。
  */
  const open = lesson.availability !== "coming_soon";
  if (spec.status === "published" && !open) {
    fail(at, "Spec は published だが、実装は coming_soon のまま");
  }
  if (spec.status === "coming_soon" && open) {
    fail(at, "Spec は coming_soon だが、実装は開いている");
  }
  if ((spec.status === "draft" || spec.status === "paused") && open) {
    fail(at, `Spec は ${spec.status} だが、実装は開いている`);
  }

  /*
    技の名前。実装が学習者へ見せる名前（`learnedSkills`）と、
    台帳の `label` がそろっていること。
  */
  const fromRegistry = (spec.ai_skills ?? [])
    .map((one) => registry.byId?.get(one.id)?.label)
    .filter(Boolean);
  const fromLesson = lesson.learnedSkills ?? [];
  if (fromLesson.length > 0 && fromRegistry.length > 0) {
    const missing = fromRegistry.filter((label) => !fromLesson.includes(label));
    if (missing.length > 0) {
      fail(
        at,
        `台帳の名前が実装に無い: ${missing.join(" / ")}（実装: ${fromLesson.join(" / ")}）`,
      );
    }
  }

  // 章扉の数と、Spec の章数
  const covers = lesson.steps.filter((step) => step.type === "section_transition").length;
  if (covers > 0 && covers !== (spec.sections ?? []).length) {
    fail(at, `章扉 ${covers} 枚に対して、Spec の章は ${(spec.sections ?? []).length} 章`);
  }
  if (covers === 0 && (spec.sections ?? []).length > 0) {
    warn(at, "実装に章扉が無い（骨格のまま）。Spec の章立ては設計上のもの");
  }
}

/**
 * 未公開の教材が、どこからも始められないこと。
 *
 * 画面ごとの判定は E2E（`e2e/releaseGate.spec.ts`）が見る。ここで
 * 見るのは**教材データの側**——進捗の分母や自動で次へ行く道に、
 * 閉じた教材が混ざっていないか。
 */
function checkReleaseScope(catalog) {
  const at = "release-scope";
  const { COURSE } = catalog;
  const open = COURSE.lessons.filter((one) => one.availability !== "coming_soon");

  if (open.length === 0) fail(at, "開いている教材が1本も無い");

  /*
    進捗の分母。**閉じた教材を混ぜない。**
    混ぜると、始めようのないもので割ることになり、どれだけやっても
    終わらない画面になる。
  */
  const denominator = open.filter((one) => one.usesAi);
  if (denominator.length === 0) {
    fail(at, "進捗の分母になる教材（usesAi）が1本も無い");
  }

  /* 診断のおすすめが、閉じた教材を指していないこと */
  const first = catalog.COURSE.lessons.find((one) => one.id === "rewrite_text");
  if (first && first.availability === "coming_soon") {
    fail(at, "Day1 が閉じている。第1リリースでは開いている必要がある");
  }
  return { open: open.map((one) => one.id) };
}

async function main() {
  const registry = loadRegistry();
  const specs = loadSpecs();
  if (specs.length === 0) fail("lessons", "Spec が1本も無い");

  const catalog = await loadCatalog();
  const seen = { ids: new Set(), days: new Set(), slugs: new Set() };
  for (const entry of specs) checkSpec(entry, registry, catalog, seen);
  const scope = checkReleaseScope(catalog);

  console.log(`Lesson Spec ${specs.length}本 / AI技 ${registry.skills.length}件`);
  console.log(`開いている教材: ${scope.open.join(", ")}`);

  for (const line of warnings) console.log(`  WARN  ${line}`);
  for (const line of errors) console.error(`  ERROR ${line}`);

  console.log(
    `\n${errors.length} error / ${warnings.length} warning`,
  );
  if (errors.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
