/**
 * 「再送は60秒後にできます 00:59」。
 *
 * なぜ数字で出すか
 * ----------------
 * 「しばらく待ってください」だけだと、待つべきなのか壊れているのかが
 * 分からない。分からないから押し直す。押し直しても断られるので、
 * 今度は「壊れている」と受け取られる。**残りが見えていれば待てる。**
 *
 * 秒数はサーバーが決める
 * ----------------------
 * ここに 60 と書き写さない。書き写すと、サーバー側の設定を変えた日に
 * 画面だけが古い数字を出し続ける。成功したときは応答の `retry_after`、
 * 断られたときは `Retry-After` ヘッダを、そのまま受け取って数える。
 *
 * これは飾り
 * ----------
 * 押せなくするのは親切のためであって、守りではない。手元でいくらでも
 * 外せるので、**実際に止めているのはサーバー**
 * （apps/accounts/throttle.py の間隔）。ここが外れても送りつけは成立しない。
 */

import { useEffect, useState } from "react";

export interface ResendCountdownProps {
  /** 数え始める秒数。0以下なら何も出さない。 */
  seconds: number;
  /** 0になったとき。押せる状態へ戻すために使う。 */
  onFinished?: () => void;
}

/** 秒を mm:ss にする。読み上げにも同じ形で渡す。 */
export function formatRemaining(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function ResendCountdown({ seconds, onFinished }: ResendCountdownProps) {
  const [remaining, setRemaining] = useState(seconds);

  // 渡された秒数が変わったら数え直す（もう一度断られたとき）
  useEffect(() => setRemaining(seconds), [seconds]);

  useEffect(() => {
    if (remaining <= 0) return;

    const timer = window.setInterval(() => {
      setRemaining((left) => {
        const next = left - 1;
        if (next <= 0) {
          window.clearInterval(timer);
          onFinished?.();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
    // onFinished は毎回作り直されることがあるので依存に入れない。
    // 入れると1秒ごとに数え直しが起きる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining > 0]);

  if (remaining <= 0) return null;

  return (
    <p
      className="mt-2 text-xs leading-6 text-ink-muted"
      data-testid="resend-countdown"
      /*
        1秒ごとに読み上げさせない。変化を追わせたい情報ではなく、
        「いま待ちの状態」であることが分かれば足りる。
      */
      aria-live="off"
    >
      再送は{remaining}秒後にできます{" "}
      <span className="tabular-nums">{formatRemaining(remaining)}</span>
    </p>
  );
}
