/**
 * 「戻る」の行き先を、画面ではなく**直前の状態**にする。
 *
 * 何が起きていたか
 * ----------------
 * このアプリは画面（TOP / HOME / LESSON …）を `history` に積んでいる
 * （`App.tsx`）。一枚（`MoreSheet`）は積んでいないので、開いている
 * 最中に端末の「戻る」を押すと、**一枚は無視されて画面ごと**前へ
 * 移った。閉じたいだけの人が、レッスンの外まで出される。
 *
 * 帯の「←」でも同じことが起きていた。あちらは `api.goBack()` を直に
 * 呼んでいて、戻る単位が教材のステップしか無かった。
 *
 * どう直したか
 * ------------
 * 一枚が開くとき、**画面はそのままの履歴をもう1つ積む**。押された
 * 「戻る」はその1つを消費し、こちらは一枚を閉じるだけで済む。
 * `App` の側は同じ画面を読み直すので、見た目は動かない。
 *
 * ×やEscで閉じたときは、積んだ1つを自分で戻して数を合わせる。
 * 合わせないと、閉じたあとの「戻る」が1回空振りする。
 *
 * 入れ子も同じ仕組みで済む。奥の一枚が後から積まれるので、
 * 「戻る」は奥から順に閉じる。
 *
 * 画面の状態は触らない
 * --------------------
 * 閉じるだけで、背面には何もしない。選んだ札・図の切り替え・送った
 * 位置は、そもそも背面の画面が持ったままなので、閉じれば元の姿に
 * 戻る。ここで復元しようとすると、**復元し忘れたものだけが消える**
 * 作りになる。
 */

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export interface BackStack {
  /** 開いているあいだ、戻るを横取りする。返り値を呼ぶと取り下げる。 */
  push: (close: () => void) => () => void;
  /** いちばん奥を1つ閉じる。何も無ければ false（＝ふつうに戻ってよい）。 */
  closeTop: () => boolean;
}

interface Layer {
  close: () => void;
}

const Context = createContext<BackStack | null>(null);

/** 積んだ履歴を見分ける印。`App` の画面の状態に足すだけにする。 */
const MARK = "aippoOverlay";

function markOf(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)[MARK];
  return typeof value === "number" ? value : null;
}

let seq = 0;

/**
 * 積み場を1つ作る。
 *
 * 履歴に積むのは、**開いている一枚が何枚あっても1つだけ**
 * ----------------------------------------------------
 * 一枚ごとに1つ積む形にしたら、開いた直後に履歴がずれた。原因は
 * `MoreSheet` が開いた直後に一度**組み直される**こと（外して付け直す
 * 動きが1回入る）。素直に書くと
 *
 *     積む → 外す（`history.back()`）→ また積む
 *
 * となり、真ん中の `history.back()` は**あとから届く**ので、3つ目の
 * 積みと前後して履歴の数が合わなくなる。「戻る」1回で2枚とも閉じる、
 * という形で出た。
 *
 * いまは「1枚でも開いていれば履歴を1つ持つ」という状態だけを保つ。
 * 組み直しでは枚数が 1 → 0 → 1 と動くが、**その場では何もせず**
 * 次の細切れの処理で数えるので、結局1つのまま動かない。
 *
 * 中身は ref に持つ。state にすると、積むたびに画面全体が描き直されて
 * ——一枚を開いた瞬間に背面が作り直され、送った位置が頭へ戻る。
 */
export function useBackStack(): BackStack {
  const layers = useRef<Layer[]>([]);
  /** いま履歴に持っている1つ。持っていなければ null */
  const held = useRef<number | null>(null);
  /** 自分で戻したぶん。その `popstate` は一枚を閉じる合図ではない */
  const consuming = useRef(0);
  /** 数え直しを1回だけ予約する */
  const queued = useRef(false);

  const sync = useRef(() => {});
  sync.current = () => {
    queued.current = false;
    const open = layers.current.length > 0;

    if (open && held.current === null) {
      seq += 1;
      held.current = seq;
      /*
        画面の状態はそのまま持っていく。`App` の `popstate` は
        これを読んで同じ画面を組み直すので、見た目は動かない。
      */
      const base =
        window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : {};
      window.history.pushState({ ...base, [MARK]: held.current }, "");
      return;
    }

    if (!open && held.current !== null) {
      /*
        **いま居る履歴が自分のものか**を確かめてから戻す。確かめずに
        戻すと、画面ごと移った拍子に一枚が消えた場合（答えを直しに
        問いへ戻るなど）に、余分に1つ戻ってレッスンの外まで出る。
      */
      if (markOf(window.history.state) === held.current) {
        consuming.current += 1;
        window.history.back();
      }
      held.current = null;
    }
  };

  const schedule = useRef(() => {
    if (queued.current) return;
    queued.current = true;
    queueMicrotask(() => sync.current());
  });

  useEffect(() => {
    const onPop = () => {
      if (consuming.current > 0) {
        consuming.current -= 1;
        return;
      }
      /* 押された「戻る」が、持っていた1つを消した */
      held.current = null;
      const top = layers.current.pop();
      if (top) top.close();
      /* まだ開いているものがあれば、次の「戻る」のために持ち直す */
      schedule.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return useMemo(
    () => ({
      push(close) {
        const layer: Layer = { close };
        layers.current.push(layer);
        schedule.current();
        return () => {
          layers.current = layers.current.filter((one) => one !== layer);
          schedule.current();
        };
      },
      closeTop() {
        const top = layers.current[layers.current.length - 1];
        if (!top) return false;
        top.close();
        return true;
      },
    }),
    [],
  );
}

export function BackStackProvider({
  stack,
  children,
}: {
  stack: BackStack;
  children: ReactNode;
}) {
  return <Context.Provider value={stack}>{children}</Context.Provider>;
}

/**
 * 開いているあいだ、「戻る」で自分が閉じる。
 *
 * 積み場が無いところ（レッスンの外で使う一枚）では何もしない。
 * 呼ぶ側が場所を気にせず済むように、無いことを許す。
 */
export function useCloseOnBack(close: () => void): void {
  const stack = useContext(Context);
  /*
    最新の閉じ方を ref で持つ。`close` は描き直すたびに別物になるので、
    そのまま積むと**積んだ時点の古い閉じ方**が呼ばれる。
  */
  const latest = useRef(close);
  latest.current = close;

  /*
    **描く前に積む。**

    ふつうの `useEffect` だと、積むのは画面に出たあと。開いた直後に
    「戻る」を押されると、まだ積めていない履歴を消費してしまい、
    一枚ではなく画面ごと戻る。`useLayoutEffect` なら、一枚が見える
    ときにはもう積み終わっている。
  */
  useLayoutEffect(() => {
    if (!stack) return;
    return stack.push(() => latest.current());
  }, [stack]);
}
