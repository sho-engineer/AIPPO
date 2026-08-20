/**
 * 自分のプロンプト帳。
 *
 * レッスンの後半で、自分の仕事のことをAIに頼む。そのとき組み立てた
 * 「こう伝えます」を取っておく。次に同じことをしたくなったとき、
 * 一から思い出さずに済む。
 *
 * いまは完了画面に「今回の成果物」とコピーボタンがあるだけで、
 * **押さずに閉じた人には何も残らない**。学んだことを持ち帰れるのが
 * このアプリの報酬（点数ではなく、できるようになったこと）なので、
 * 持ち帰りをコピーボタン1回に賭けない。
 *
 * 本文は入れない
 * --------------
 * 保存するのは**指示だけ**。「上司向けに、分かりやすく、短めに」までで、
 * そのとき直した文章そのものは入れない。理由は2つ。
 *
 *   1. 指示は次も使えるが、そのときの文章は一度きり。混ぜると、
 *      使い回せる形にならない
 *   2. 仕事の文章を、下書き（aippo:draft:）とは別の場所へもう1つ
 *      増やすことになる。置き場は少ないほうがよい
 *
 * サーバーへは送らない。この帳面は端末の中だけにある。
 * 学習データの削除（設定）で、まとめて消える。
 */

export interface PromptCard {
  /** 「読む相手」「表現」など。専門用語を使わない。 */
  label: string;
  value: string;
}

export interface SavedPrompt {
  /** 保存した時刻から作る。同じレッスンを何度やっても別の1件になる。 */
  id: string;
  lessonId: string;
  lessonTitle: string;
  /** 組み立てた条件。 */
  cards: PromptCard[];
  /** そのまま貼って使える形にした指示。**本文は含まない。** */
  text: string;
  at: string;
}

const STORAGE_KEY = "aippo:prompts";

/**
 * 取っておく数の上限。
 *
 * 増やし続けると、探すのに読み下すことになる。帳面は「すぐ見つかる」
 * ことに意味があるので、古いものから落とす。
 */
const LIMIT = 30;

export function loadPrompts(): SavedPrompt[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // 形の合わない行は捨てる。1件壊れても残りは使える
    return parsed.filter(
      (item): item is SavedPrompt =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as SavedPrompt).id === "string" &&
        typeof (item as SavedPrompt).text === "string",
    );
  } catch {
    return [];
  }
}

/**
 * 1件しまう。新しいものが先頭に来る。
 *
 * 同じレッスンで**同じ指示**になったときは、増やさずに日付だけ新しくする。
 * 一字一句同じものが並ぶと、どれが最新か分からなくなる。
 */
export function savePrompt(entry: Omit<SavedPrompt, "id" | "at">): SavedPrompt {
  const saved: SavedPrompt = {
    ...entry,
    id: `${entry.lessonId}-${Date.now()}`,
    at: new Date().toISOString(),
  };

  try {
    const current = loadPrompts().filter(
      (item) => !(item.lessonId === entry.lessonId && item.text === entry.text),
    );
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([saved, ...current].slice(0, LIMIT)),
    );
  } catch {
    // 書けなくても学習は続く（プライベートモードなど）
  }
  return saved;
}

export function removePrompt(id: string): void {
  try {
    const next = loadPrompts().filter((item) => item.id !== id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 消せなくても、次に書くときに上書きされる
  }
}
