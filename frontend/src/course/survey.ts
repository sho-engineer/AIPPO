/**
 * アンケートを、同じレッスンで二度聞かないための覚え書き。
 *
 * 答えた人にも、断った人にも、二度目は出さない。
 * 繰り返し聞かれるのは、断りにくさだけが増えて答えが歪む。
 *
 * 置き場は端末（localStorage）。サーバーに持たせると、
 * 「まだ聞いていないか」を知るためだけに毎回問い合わせることになる。
 * 端末を変えたらもう一度出るが、聞きすぎるより聞き逃すほうが無害。
 *
 * localStorage が使えない設定でも、読み書きで落ちないようにする。
 * ここで落とすと、終わった直後の画面が真っ白になる。
 */

const KEY = "aippo:survey";

function load(): Record<string, true> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    // 壊れた中身を読み込んで、あとの `in` で落ちないようにする
    return parsed && typeof parsed === "object" ? (parsed as Record<string, true>) : {};
  } catch {
    return {};
  }
}

/** そのレッスンで、すでに答えたか断ったか。 */
export function alreadyAsked(lessonId: string): boolean {
  return lessonId in load();
}

/** 答えた、または断ったことを覚える。 */
export function rememberAsked(lessonId: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...load(), [lessonId]: true }));
  } catch {
    // 保存できなくても、その回の表示はもう終わっている
  }
}

/** テスト用。端末の覚え書きを消す。 */
export function resetAsked(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 消せなくても困らない
  }
}
