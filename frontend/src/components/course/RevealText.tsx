/**
 * AIが書いた文章を、少しずつ見せる。
 *
 * 全文がいきなり出ると、返ってきたことに気づかないまま読み始めることに
 * なる。書かれていく様子が見えると、**自分が頼んだ結果だ**という繋がりが
 * 残る。待った時間にも意味が付く。
 *
 * ただしチャット画面にはしない
 * ----------------------------
 * 1文字ずつ打ち出す見せ方は、会話しているように見える。このアプリは
 * AIと雑談する場所ではなく、教材の結果を受け取る場所なので、
 * **行ごとに薄く現れる**程度に留める。
 *
 * 文字は最初から置いておく
 * ------------------------
 * 出す・出さないで切り替えると、読み上げが途中の状態を読んでしまい、
 * 文章の選択やコピーもできない。文字は最初から DOM にあり、
 * 変えるのは見え方（透明度）だけにする。
 *
 * 動きを減らす設定のときは、最初から全部見えている状態にする。
 */

import { useEffect, useState } from "react";

import { EASING, MOTION, prefersReducedMotion } from "../../course/motion";

/** 1行ずつずらす間隔。長い文章でも待たせすぎない程度。 */
const STAGGER_MS = 70;

export interface RevealTextProps {
  text: string;
  /** これが変わったら、もう一度出し直す。実行回数などを渡す。 */
  trigger?: string | number;
  className?: string;
  /**
   * 呼び出し側の目印。
   *
   * 見せ方を変えても、テストやE2Eの指し先は変えない。
   * 別の要素へ移すと、同じものを指しているのに落ちる。
   */
  testId?: string;
}

export function RevealText({ text, trigger, className, testId }: RevealTextProps) {
  const lines = text.split("\n");
  const [shown, setShown] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(true);
      return;
    }
    setShown(false);
    const raf = window.requestAnimationFrame(() => setShown(true));
    return () => window.cancelAnimationFrame(raf);
  }, [trigger, text]);

  return (
    <p className={className} data-testid={testId ?? "reveal-text"}>
      {lines.map((line, index) => (
        <span
          key={`${index}-${line}`}
          style={{
            opacity: shown ? 1 : 0,
            transition: `opacity ${MOTION.normal}ms ${EASING}`,
            transitionDelay: shown ? `${index * STAGGER_MS}ms` : "0ms",
          }}
        >
          {line}
          {index < lines.length - 1 && "\n"}
        </span>
      ))}
    </p>
  );
}
