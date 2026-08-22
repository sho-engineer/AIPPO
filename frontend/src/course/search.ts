/**
 * 教材を探す。
 *
 * 一覧は縦一列の目次で、いまは9件しかない。だが「請求書」「議事録」の
 * ように**やりたいことの言葉**で来る人は、9件でも自分の用途に合う1本を
 * 見つけられない。題（「文章を書き直す」）と、その人の言葉
 * （「メールの下書き」）は一致しないため。
 *
 * サーバーへ問い合わせない理由
 * ----------------------------
 * 教材は `GET /api/v1/catalog/` で**全件が一度に**画面へ来ている。
 * 手元に全部あるのに1文字ごとに問い合わせるのは、遅くする以外の
 * 働きが無い。件数が増えて手元で回らなくなったら、そのとき移す。
 *
 * 何を探すか
 * ----------
 * 題だけでは足りない。ねらい（goal）、今日つくるもの、できるように
 * なること、そして**タグ**まで見る。タグは診断の推薦に使っている
 * 言葉で、「メール」「資料」のような用途の語が入っている。
 * ここを外すと、用途で探す人に一番効く手がかりを捨てることになる。
 *
 * 日本語の扱い
 * ------------
 * 分かち書きも語幹処理もしない。単純な部分一致にする。
 * 形態素解析を持ち込むと辞書が要り、それでも「請求書」と「見積書」は
 * 繋がらない。9件を絞るには部分一致で足りる。
 *
 * ひらがな・カタカナと大文字小文字だけは吸収する。「メール」と
 * 「めーる」で結果が変わると、打ち直すことになる。
 */

import type { Lesson } from "./types";

export const LESSON_CATEGORIES = [
  {
    id: "writing",
    label: "文章",
    terms: ["writing", "email", "rewrite", "文章", "メール"],
  },
  {
    id: "summary",
    label: "要約",
    terms: ["summarizing", "summary", "documents", "要約", "まとめ"],
  },
  {
    id: "organize",
    label: "整理",
    terms: ["organizing", "meeting", "research", "整理", "会議", "調べ"],
  },
  {
    id: "ideas",
    label: "アイデア",
    terms: ["ideas", "brainstorm", "アイデア", "発想"],
  },
  {
    id: "planning",
    label: "計画",
    terms: ["planning", "plan", "workflow", "recipe", "計画", "手順"],
  },
  { id: "image", label: "画像", terms: ["image", "画像"] },
] as const;

export type LessonCategoryId = (typeof LESSON_CATEGORIES)[number]["id"];

/**
 * 比べるための形にそろえる。
 *
 * - 大文字小文字（AI / ai）
 * - 全角と半角（ＡＩ / AI、１ / 1）
 * - カタカナ→ひらがな（メール / めーる）
 *
 * 濁点の分かれ方（NFC/NFD）も `normalize` が吸収する。外部から
 * 貼り付けた語が繋がらない、という形で効いてくる。
 */
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (kana) =>
      String.fromCharCode(kana.charCodeAt(0) - 0x60),
    );
}

/** その教材の、探す対象になる文字すべて。 */
function haystack(lesson: Lesson): string {
  return normalize(
    [
      lesson.title,
      lesson.goal,
      lesson.outcomeTitle ?? "",
      lesson.outcomeDescription ?? "",
      ...(lesson.learnedSkills ?? []),
      ...lesson.outcomes,
      // タグは診断の推薦に使う語。用途の言葉はここに入っている
      ...lesson.tags,
    ].join(" "),
  );
}

/**
 * 語で絞る。
 *
 * 空白で区切った語は**すべて**含むものだけを返す（AND）。
 * OR にすると、語を足すほど結果が増える。絞るつもりで打った人の
 * 期待と逆になる。
 *
 * 並び順は元のまま（番号順）。一致の強さで並べ替えない——
 * 9件の中で順番が入れ替わると、さっき見た位置に無くなる。
 */
export function searchLessons(lessons: Lesson[], query: string): Lesson[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return lessons;

  return lessons.filter((lesson) => {
    const target = haystack(lesson);
    return terms.every((term) => target.includes(term));
  });
}

/** 「何がしたい？」のカテゴリで絞る。タグは複数のカテゴリに属してよい。 */
export function filterLessonsByCategory(
  lessons: Lesson[],
  categoryId: LessonCategoryId | null,
): Lesson[] {
  if (categoryId === null) return lessons;
  const category = LESSON_CATEGORIES.find((entry) => entry.id === categoryId);
  if (!category) return lessons;

  return lessons.filter((lesson) => {
    const target = haystack(lesson);
    return category.terms.some((term) => target.includes(normalize(term)));
  });
}
