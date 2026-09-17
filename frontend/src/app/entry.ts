/**
 * 開いたとき、どの画面から始めるか。
 *
 * 入口は3つある。
 *
 *     WELCOME          はじめて来た人。名乗りと、始め方3つ
 *     DIAGNOSIS_INTRO  始めた直後の1度だけ。診断への案内
 *     （それ以外）      覚えていた場所か、ホーム
 *
 * 決め方を画面から切り離してある理由
 * ----------------------------------
 * 条件が6つある（ログインの確認・登録した人かどうか・ゲストとして
 * 始めたか・案内を見たか・学んだ跡・覚えていた場所）。これを
 * `App.tsx` の描画の中で組むと、**どの条件がどの画面を出しているのか
 * が読めなくなる**。素の関数にしておけば、1行ずつ確かめられる
 * （`tests/entry.test.ts`）。
 *
 * 待つ。ただし時間では待たない
 * ----------------------------
 * 揃う前に決めると、**ようこそを一瞬出してからホームへ飛ぶ**か、
 * その逆になる。かといってタイマーで待つと、全員がその秒数だけ
 * 白い画面を見る。待つのは `me` の1往復ぶんだけで、届いた瞬間に決める。
 *
 * 分からないときは「初めての人」にしない
 * --------------------------------------
 * `me` が読めなかった・保存が読めなかった、を初回と読むと、**もう
 * 使っている人がようこそへ流される**——押す先は「ゲストではじめる」
 * しかなく、そこから進んだ先は自分の記録が消えたように見える。
 * 読めないものがあるときは、覚えていた場所（無ければホーム）へ倒す。
 */

import type { Screen } from "./screens";

export interface EntryFacts {
  /** ログインの確認が、まだ終わっていない。 */
  authLoading: boolean;
  /** 登録して入っているか。 */
  signedIn: boolean;
  /**
   * サーバーが数えている、その人の学習量。
   *
   * 登録した人だけ届く。届く前は `null`——**0 と区別する**。
   * 0 は「登録したが、まだ何もしていない」で、行き先が変わる。
   */
  serverHistory: number | null;
  /** ゲストとして始めた跡が、この端末に残っているか。 */
  guestStarted: boolean;
  /** 診断への案内を、もう見せたか。 */
  guideSeen: boolean;
  /** この端末に、学んだ跡が残っているか。 */
  deviceHistory: boolean;
  /** 覚えていた場所。無ければ `null`。 */
  saved: Screen | null;
}

export type Entry =
  /** まだ決められない。**何も描かない。** */
  | { kind: "pending" }
  | { kind: "screen"; screen: Screen };

const HOME: Entry = { kind: "screen", screen: "HOME" };

/**
 * 覚えていた場所へ戻す。
 *
 * 入口の2枚（ようこそ・案内）は**覚えていた場所として使わない**。
 * あの2枚は「1度だけ通る」ところなので、そこへ戻すと毎回同じ入口を
 * くぐり直すことになる。
 */
function resume(saved: Screen | null): Entry {
  if (!saved || saved === "WELCOME" || saved === "DIAGNOSIS_INTRO") return HOME;
  return { kind: "screen", screen: saved };
}

export function decideEntry(facts: EntryFacts): Entry {
  // ログインの確認が終わるまでは決めない
  if (facts.authLoading) return { kind: "pending" };

  if (facts.signedIn) {
    /*
      登録した人。学習量が届くまで決めない——届く前の `null` を 0 と
      読むと、**もう学んでいる人に診断の案内が出る**。
    */
    if (facts.serverHistory === null) return { kind: "pending" };
    /*
      案内を見たか、何か学んでいれば、いつもの場所へ。
      どちらも無い人（登録した初日）だけ、案内へ通す。
    */
    if (facts.guideSeen || facts.serverHistory > 0 || facts.deviceHistory) {
      return resume(facts.saved);
    }
    return { kind: "screen", screen: "DIAGNOSIS_INTRO" };
  }

  /*
    ゲスト。**始めた跡が無ければ、ようこそ。**

    「跡」は、ゲストで始めるボタンを押したこと（`markGuestStarted`）。
    学んだ跡のほうで代用しない——押しただけで何も学んでいない人が
    毎回ようこそへ戻され、そのたびに始め方を選び直すことになる。
  */
  if (!facts.guestStarted) {
    /*
      ただし、前から使っている人は通す。ゲストの印はこの機能と一緒に
      入ったもので、それ以前から居る人は持っていない——**持っていない
      ことを「初めて」と読むと、続きがある人がようこそへ流される。**
    */
    if (facts.deviceHistory || facts.guideSeen || facts.saved) {
      return resume(facts.saved);
    }
    return { kind: "screen", screen: "WELCOME" };
  }

  // 始めたばかりで、案内も見ていない人へ
  if (!facts.guideSeen && !facts.deviceHistory) {
    return { kind: "screen", screen: "DIAGNOSIS_INTRO" };
  }

  return resume(facts.saved);
}
