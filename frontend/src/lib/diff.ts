/**
 * 元の文章と直した文章の、変わったところを出す（要件 §6.9）。
 *
 * 「どこが変わったか」が見えないと、条件を変えた効果が分からない。
 * 出力を並べて置くだけでは、初心者は違いを追えない。
 *
 * 日本語には単語の切れ目が無いので、英語のような単語単位の比較は
 * 使えない。**文単位**（句点・改行・読点で切る）で比べる。
 * 文字単位まで細かくすると、ほとんどの文が「変わった」になって
 * かえって読めなくなる。
 */

export type DiffKind = "same" | "added" | "removed";

export interface DiffPart {
  kind: DiffKind;
  text: string;
}

/** 句点・改行で切る。区切り文字は前の文にくっつける。 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。．！？\n])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * 最長共通部分列（LCS）で並べる。
 *
 * 文の数はせいぜい数十なので、素直な O(n×m) で足りる。
 */
export function diffSentences(before: string, after: string): DiffPart[] {
  const a = splitSentences(before);
  const b = splitSentences(after);

  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      parts.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      parts.push({ kind: "removed", text: a[i] });
      i++;
    } else {
      parts.push({ kind: "added", text: b[j] });
      j++;
    }
  }
  while (i < a.length) parts.push({ kind: "removed", text: a[i++] });
  while (j < b.length) parts.push({ kind: "added", text: b[j++] });

  return parts;
}

/** ほとんど変わっていないなら、差分表示より並べて見せるほうが読みやすい。 */
export function isMostlyUnchanged(parts: DiffPart[]): boolean {
  const changed = parts.filter((part) => part.kind !== "same").length;
  return parts.length > 0 && changed / parts.length < 0.1;
}
