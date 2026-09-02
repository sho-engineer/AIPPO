/**
 * 送信中のようす。
 *
 * 待っているあいだ、何が起きているのかを出しておく。
 * 無言で止まると、壊れたのか待てばよいのかが分からない。
 *
 * 主役はポー
 * ----------
 * 前はここに囲いのある面を置き、その中に文・帯・返ってくる形の
 * 骨組みを積んでいた。ポーは上（`PoHero`）に別に居るので、**待って
 * いるあいだの画面に「考えている人」が2人いる**——上で考え中の顔を
 * している子と、下で回っている枠。
 *
 * いま出すのは点3つだけにする。「考え中」はポーの吹き出しが言い、
 * 表情（`thinking`）も出ている。ここが言うことはもう無い。
 *
 * 偽の進捗は出さない
 * ------------------
 * 帯をやめた理由でもある。幅を伸ばすと「何割終わった」と読めるが、
 * AI がどこまで進んだかはこちらに分からない。分かるふりをしない。
 */

import { prefersReducedMotion } from "../../../course/motion";

/** 点の数。3つ。増やしても「待っている」以上のことは言わない。 */
const DOTS = [0, 1, 2];

export function GeneratingCard({
  message,
  busy,
  failed = false,
}: {
  message: string;
  busy: boolean;
  /** 失敗して止まっているか。理由の文はここには出さない（下のボタンのそば） */
  failed?: boolean;
}) {
  /*
    動きを止めている人には、点を動かさずに置く。**消さない**——
    点が3つ並んでいること自体が「待っている」の合図になる。
  */
  const quiet = prefersReducedMotion();

  return (
    <div
      data-testid="generating-card"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5"
    >
      {/*
        いま何をしている最中かは、読み上げにも届ける。
        目には点が伝えるが、点は読み上げられない。
      */}
      <p className="sr-only" role="status">
        {message}
      </p>

      <div
        className="flex items-center gap-2"
        data-testid="generating-dots"
        data-busy={busy ? "true" : "false"}
        aria-hidden="true"
      >
        {DOTS.map((index) => (
          <span
            key={index}
            className={`block h-2.5 w-2.5 rounded-full ${
              failed ? "bg-line" : "bg-brand"
            } ${busy && !quiet ? "animate-nudge" : ""}`}
            style={busy && !quiet ? { animationDelay: `${index * 160}ms` } : undefined}
          />
        ))}
      </div>

      {/*
        待っている理由を、ごく短く1行。ポーの吹き出しが同じことを
        言っている回では、こちらは出さない（骨格が空文字を渡す）。
      */}
      {message && (
        <p className="text-center text-sm leading-6 text-ink-muted">{message}</p>
      )}
    </div>
  );
}
