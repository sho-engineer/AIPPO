/**
 * 外部サービスへ出る前に、いた場所を覚えておく。
 *
 * なぜ要るか
 * ----------
 * Google で入るときは、画面ごと外へ出て戻ってくる。サーバーが戻す先は
 * アプリの入口（`/`）で、**どこから出て行ったかは渡していない**。
 *
 * いまも多くの場合は戻れている。`aippo:place`（app/session.ts）が
 * 「最後に見ていた画面」を持っていて、戻ってきたときに読み直すため。
 * ただしそれは**副作用として**そうなっているだけで、次の2つで崩れる。
 *
 *   1. 別のタブで AIPPO を開いていると、そちらが `place` を上書きする。
 *      戻ってきた側は、押したときとは違う画面へ着く
 *   2. 認証の途中でレッスンを閉じるなど、`place` が変わる操作が挟まると
 *      同じことが起きる
 *
 * だから**押した瞬間**の場所を別に控える。戻ってきたら、そちらを優先する。
 *
 * URL に載せない
 * --------------
 * 戻り先をサーバーへ渡して `?next=` で返す作りにはしない。渡した瞬間、
 * 「外部のURLへ飛ばされないか」を検証する責任が生まれる（オープン
 * リダイレクト）。いまはサーバーが `FRONTEND_URL` へ決め打ちで戻して
 * いるので、その心配が構造的に無い。**端末の中に置けば、外部のURLに
 * なりようがない。**
 *
 * 消えてよい
 * ----------
 * 保存に失敗しても、認証は止めない。戻り先が分からなければ
 * これまでどおり `place` に従う——少し違う画面に着くだけで、
 * 記録も入力も失われない。
 *
 * 古いものは使わない
 * ------------------
 * 認証の往復は長くても数分。何日も前の控えが残っていると、
 * 「久しぶりに開いたら、いつかの途中に飛ばされた」になる。
 */

import type { Place } from "../app/session";

const KEY = "aippo:auth-return";

/**
 * 控えが有効な時間。
 *
 * 30分。Google の同意画面で迷ったり、途中でメールを見に行ったりする
 * ぶんは足りる。それ以上かかったなら、もう別の用事をしている。
 */
const MAX_AGE_MS = 30 * 60 * 1000;

interface Saved {
  place: Place;
  at: number;
}

/**
 * この読み込みでの答えを覚えておく。
 *
 * 控えを読むのは**端末から消す**動きでもあるので、同じ読み込みの
 * 中で2回呼ばれると、2回目が空になる。React は開発時に
 * `useState` の初期化を2回走らせるので、実際にそうなった——
 * 1回目が消し、2回目が「控えは無い」と判断して、
 * **押した人が違う画面へ着いた**。
 *
 * 「1回の読み込みにつき1つの答え」にする。端末からはすぐ消えるので、
 * 次に開いたときはちゃんと空になる。
 */
let answered = false;
let answer: Place | null = null;

/**
 * 外部サービスへ出る直前に呼ぶ。
 *
 * 覚えたぶんも作り直す。消しておかないと、同じ画面で押し直した人の
 * 控えが、前の答えのまま返る。
 */
export function rememberReturn(place: Place): void {
  answered = false;
  answer = null;
  try {
    const saved: Saved = { place, at: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // 覚えられなくても認証は続けられる（place へ落ちるだけ）
  }
}

/**
 * 戻ってきたときに読む。**端末からは消す。**
 *
 * 残しておくと、次にアプリを開いたときにも同じ場所へ飛ばされる。
 * 「戻る」ためのものであって、「いつもの場所」ではない。
 *
 * 同じ読み込みの中で何度呼んでも、同じ答えを返す（上の理由）。
 */
export function takeReturn(): Place | null {
  if (answered) return answer;
  answered = true;
  answer = read();
  return answer;
}

function read(): Place | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const saved = JSON.parse(raw) as Saved;
    if (!saved?.place || typeof saved.at !== "number") return null;
    if (Date.now() - saved.at > MAX_AGE_MS) return null;
    if (typeof saved.place.screen !== "string") return null;
    if (typeof saved.place.lessonId !== "string") return null;
    return saved.place;
  } catch {
    return null;
  }
}

/** 控えを捨てる。認証をやめたときに呼ぶ。 */
export function forgetReturn(): void {
  answered = false;
  answer = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 消せなくても、30分で使われなくなる
  }
}
