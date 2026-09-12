/**
 * いまAIへ送る指示を、**組み上がっていく形で**見せる。
 *
 * なぜ要るか
 * ----------
 * Day1 でいちばん持ち帰ってほしいのは「条件を足すと結果が変わる」で、
 * そのためには**自分が足したことが見えている**必要がある。前は
 * 選んだ札が青くなるだけで、AIへ何を伝えたのかは画面のどこにも
 * 出ていなかった——選んだ、待った、結果が変わった、で終わる。
 *
 * ここに出すのは、いま送る指示そのもの。読む人を選べば2行目が、
 * 伝え方を選べば3行目が生える。**行が増えるのを見ること**が、
 * プロンプトを組み立てるという体験になる。
 *
 * まだ選んでいない行
 * ------------------
 * 薄く、点線で置いておく。消しておくと、あと何が足せるのかが
 * 分からない——足りないのではなく「これから足すところ」だと見せる。
 * 場所も先に取ってあるので、選んだ瞬間に下が押し出されない。
 */

import { IconCheck } from "../../Icons";

export interface InstructionLine {
  /** 何の行か（「読む人」）。 */
  label: string;
  /** 選んだ言葉。まだなら空。 */
  value: string;
  /** まだのときに出す、うすい見本。 */
  hint: string;
}

export interface InstructionProps {
  /** 1行目。この回のあいだ動かない。 */
  purpose: string;
  lines: InstructionLine[];
}

export function Instruction({ purpose, lines }: InstructionProps) {
  return (
    <section
      className="rounded-card border border-brand-line bg-brand-soft/50 px-3.5 py-2
                 [@media(min-height:700px)]:py-3"
      data-testid="current-instruction"
    >
      {/*
        低い持ち方では、見出しを畳む。**中身のほうを残す。**

        402×660 でこの画面に渡せる高さに、5つの選択肢とこの札の
        両方は入らない（実測で 25px 足りない）。「現在の指示」という
        見出しは、下に並ぶ3行を見れば要らない——目的・読む人・
        伝え方が、そのまま指示の形で並んでいる。
      */}
      <h2 className="hidden text-xs font-bold leading-5 text-ink-muted [@media(min-height:700px)]:block">
        現在の指示
      </h2>
      <ul className="space-y-1 [@media(min-height:700px)]:mt-2 [@media(min-height:700px)]:space-y-1.5" role="list">
        {/*
          1行目は目的。**選ばせない**ので、最初から入っている印を付ける。
        */}
        <li className="flex items-start gap-2 text-sm leading-6">
          <IconCheck className="mt-1.5 h-3 w-3 shrink-0 text-brand" aria-hidden="true" />
          <span className="min-w-0 font-bold text-brand-dark">{purpose}</span>
        </li>
        {lines.map((line) => (
          <li
            key={line.label}
            data-testid="instruction-line"
            data-filled={line.value ? "true" : "false"}
            className="flex items-start gap-2 text-sm leading-6"
          >
            {/*
              印は、埋まった行にだけ。まだの行は「＋」で、
              **これから足すところ**だと分かる形にする。
            */}
            <span
              aria-hidden="true"
              className={`mt-1.5 flex h-3 w-3 shrink-0 items-center justify-center ${
                line.value ? "text-brand" : "text-ink-muted"
              }`}
            >
              {line.value ? <IconCheck className="h-3 w-3" /> : "＋"}
            </span>
            <span
              className={`min-w-0 ${
                line.value ? "font-bold text-brand-dark" : "text-ink-muted"
              }`}
            >
              {line.value ? `${line.value}に合わせてください` : line.hint}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
