/**
 * 「ホームへ戻る」を、画面の奥から呼べるようにする。
 *
 * なぜコンテキストか
 * ------------------
 * ロゴは共通の帯（`AppShell` の `AppHeader`）の中にあり、その帯は
 * 10枚の画面から呼ばれている。行き先を props で渡すと、**10か所すべてに
 * 同じ引数を足す**ことになり、次に画面が増えたときも足し忘れが起きる。
 * 帯が欲しいのは「ホームへ行く方法」ひとつだけなので、上から配る。
 *
 * リンクにしない
 * --------------
 * `<a href="/">` は使えない。このアプリに URL ルーターは無く、
 * 画面は `history.pushState` と端末の控え（`aippo:place`）で決まる。
 * リンクにすると**ページごと読み込み直し**になり、進行中の下書きの
 * 復元からやり直すことになる——押した人から見れば、一瞬止まって
 * 同じ画面に戻ったように見える。
 *
 * 無くても壊れない
 * ----------------
 * 包まずに使ったとき（部品だけを出す検査など）は `null` を返す。
 * そのときロゴは押せないただの絵になる。**押せないボタンを出すより、
 * ボタンでないほうがよい。**
 */

import { createContext, useContext, type ReactNode } from "react";

const GoHome = createContext<(() => void) | null>(null);

export function GoHomeProvider({
  goHome,
  children,
}: {
  goHome: () => void;
  children: ReactNode;
}) {
  return <GoHome.Provider value={goHome}>{children}</GoHome.Provider>;
}

/** ホームへ戻る方法。包まれていなければ null。 */
export function useGoHome(): (() => void) | null {
  return useContext(GoHome);
}
