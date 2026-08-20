/**
 * 「あとで見返すもの」の控え。
 *
 * 飛ばした解説、やらずに通り過ぎた自分の課題、うまく行かなかった回。
 * それらを覚えておいて、あとで**復習の回**を組み立てられるようにする。
 *
 * いまは復習の回そのものは作っていない。ここで作っているのは、
 * 作るときに要るものを**取りこぼさない**ための置き場。
 * 記録は起きた時点でしか取れないので、後回しにすると
 * 「復習を作りたくなった日から先の分しか無い」ことになる。
 *
 * サーバーにも送っている。ではなぜ端末にも持つのか
 * ------------------------------------------------
 * サーバーへ送っているのは**数えるため**の学習イベントで、
 * 個人を特定しない形で集計している（誰が何を飛ばしたかは引けない）。
 * 復習は「あなたが飛ばしたもの」を出す機能なので、本人の端末に
 * 本人のぶんだけ持つ。預ける先を増やさずに済む。
 *
 * 置き場は他の学習記録と同じ localStorage。学習データの削除
 * （設定 → 学習データ・プライバシー）で、まとめて消える。
 */

/** 見返す理由。増やすときは、復習の回の作り方も一緒に決める。 */
export type ReviewReason =
  //: 解説を読まずに飛ばした
  | "concept_skipped"
  //: 自分の課題をやらずに通り過ぎた
  | "real_task_skipped"
  //: AIがうまく動かず、結果を見られなかった
  | "generation_failed";

export interface ReviewItem {
  lessonId: string;
  stepId: string;
  reason: ReviewReason;
  /** いつ起きたか。古いものから消せるようにする。 */
  at: string;
}

const STORAGE_KEY = "aippo:review";

/** 覚えておく上限。増やし続けると、復習が「積み残しの山」になる。 */
const LIMIT = 50;

export function loadReviewItems(): ReviewItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // 形の合わないものは黙って捨てる。1件壊れても残りは使える
    return parsed.filter(
      (item): item is ReviewItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ReviewItem).lessonId === "string" &&
        typeof (item as ReviewItem).stepId === "string",
    );
  } catch {
    return [];
  }
}

/**
 * 1件覚える。
 *
 * 同じ回を何度も飛ばしても1件にする。3回飛ばしたことより、
 * 「そこを飛ばした」という事実のほうが復習には要る。
 */
export function rememberForReview(item: Omit<ReviewItem, "at">): void {
  try {
    const current = loadReviewItems().filter(
      (entry) => !(entry.lessonId === item.lessonId && entry.stepId === item.stepId),
    );
    const next = [...current, { ...item, at: new Date().toISOString() }].slice(-LIMIT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 書けなくても学習は続く（プライベートモードなど）
  }
}

/**
 * 見返し終えたので、控えから外す。
 *
 * 復習の回を作るときに呼ぶ。呼ばないと、一度見返したものが
 * いつまでも「見返すもの」に残る。
 */
export function forgetForReview(lessonId: string, stepId: string): void {
  try {
    const next = loadReviewItems().filter(
      (entry) => !(entry.lessonId === lessonId && entry.stepId === stepId),
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 消せなくても、次に書くときに上書きされる
  }
}

/** そのレッスンで見返すもの。復習の回を組み立てるときに使う。 */
export function reviewItemsFor(lessonId: string): ReviewItem[] {
  return loadReviewItems().filter((entry) => entry.lessonId === lessonId);
}
