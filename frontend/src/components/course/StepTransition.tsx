/**
 * ステップが入れ替わるときの動き。
 *
 * 目的は動きを見せることではない。**進んだと感じさせる**こと。
 * 瞬間で差し替わると、押した結果として画面が変わったのか、
 * もともとそうだったのかが読み取れない。
 *
 * 向きに意味を持たせる
 * --------------------
 * 進むときは左から入り、戻るときは右から入る。紙をめくる向きと同じで、
 * 「いま戻った」ことが文字を読まなくても分かる。向きを固定すると、
 * 戻ったのに進んだように見えて、迷子になる。
 *
 * 動きを減らす設定のとき
 * ----------------------
 * 位置は動かさず、透明度だけにする（index.css が秒数をほぼ0にするので、
 * 実質は即時の差し替えになる）。動かないと意味が消える作りにはしていない
 * ——どのステップかは見出しと進み具合が示す。
 *
 * なぜ useLayoutEffect なのか
 * ---------------------------
 * ここは `useEffect` で書いてあって、**1コマも動いていなかった**。
 *
 * `useEffect` はブラウザが描いた**あと**に走る。だから
 *
 *     1. 新しいステップが、いきなり完成形（透明度1・ずれ0）で描かれる
 *     2. そのあと effect が走って「隠れた状態」に戻そうとする
 *     3. 次のコマで requestAnimationFrame が「出た状態」に戻す
 *
 * となり、隠れた状態が画面に出ないまま行って帰る。transition は
 * 動く先が無いので、何も起きない。属性（data-direction）だけは
 * 正しく変わるので、**検査は通り、目には何も映らない**という
 * いちばん見つけにくい形になっていた。
 *
 * `useLayoutEffect` は描く**前**に走るので、隠れた状態がちゃんと
 * 1コマ描かれる。そこから transition が始まる。
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { EASING, MOTION } from "../../course/motion";

export interface StepTransitionProps {
  /** これが変わったら、入れ替わったとみなす。 */
  stepKey: string;
  children: ReactNode;
}

export function StepTransition({ stepKey, children }: StepTransitionProps) {
  const [shown, setShown] = useState(false);
  /*
    どちらへ動いたか。

    ステップの並び順を知らないので、鍵の変化だけでは向きが決められない。
    代わりに「前に出した鍵をもう一度見た＝戻った」とみなす。
    行きつ戻りつしても、直前の1つを覚えていれば足りる。
  */
  const seen = useRef<string[]>([]);
  const [back, setBack] = useState(false);

  useLayoutEffect(() => {
    const index = seen.current.indexOf(stepKey);
    if (index >= 0) {
      setBack(true);
      seen.current = seen.current.slice(0, index + 1);
    } else {
      setBack(false);
      seen.current.push(stepKey);
      // 覚えるのは直近だけ。長いレッスンでも増え続けないようにする
      if (seen.current.length > 24) seen.current.shift();
    }

    setShown(false);
    // 次の描画で「入り」を始める。同じ描画で切り替えると動きが出ない
    const raf = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(raf);
  }, [stepKey]);

  const offset = back ? -12 : 12;

  return (
    <div
      data-testid="step-transition"
      data-direction={back ? "back" : "forward"}
      /*
        高さをそのまま下へ渡す。

        この包みが自分の高さを持ってしまうと、中の回が「残りいっぱい」を
        取れなくなる（`flex-1` の当てにする相手がここで途切れる）。
        AIの結果のように**長さの決まらないもの**を、残りの高さに
        収める回があるので、ここは素通しにする。
      */
      className="flex min-h-0 flex-1 flex-col"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateX(0)" : `translateX(${offset}px)`,
        transition: `opacity ${MOTION.normal}ms ${EASING}, transform ${MOTION.normal}ms ${EASING}`,
      }}
    >
      {children}
    </div>
  );
}
