/**
 * 「AI技 GET」の帯。
 *
 * なぜ要るか
 * ----------
 * 技の名前を受け取る場面が、どこにも無かった。技は完了画面の
 * `LessonAwardCard` で初めて数として出るだけで、**覚えた瞬間**が
 * 画面に無い。解説カードは「〜とは」という説明文で始まるので、
 * 読んだ人は「説明を読んだ」としか思わない。
 *
 * 順番を直したのは前の作業（体験 → 変化 → 気づき → 名前）。
 * ここでやるのは、その**名前を渡すところ**を1つの出来事にすること。
 *
 * 帯ではなく、その画面の主役にする
 * --------------------------------
 * 前は解説カードの上に細い帯として置いていた。**取った瞬間が、
 * 説明の前置き**になっていて、名前を受け取った感じが残らない。
 *
 * いまは技を持つ回だけ、画面の真ん中に大きく置く。押すのは「覚えた」
 * ひとつだけで、解説の本文はその下に1〜2行だけ添える（教材データの
 * `card.body` はもともと1行）。
 *
 * 大きくしない
 * ------------
 * 大人が仕事の合間に使う画面なので、紙吹雪も光る枠も合わない。
 * 1度すべり出て、余白を広く取るだけで足りる。派手にすると、
 * 集めることが目的に見えてくる（憲章の「Game要素を学習より前面に
 * 出しすぎない」）。
 *
 * 出したまま残す
 * --------------
 * `StepDone` と違って**消さない**。あちらは押した直後の手応えで、
 * 残ると次の操作の邪魔になる。こちらはこの画面そのもの。
 *
 * 読み上げ
 * --------
 * 色と動きだけで伝えると、見えない人には何も起きていないのと同じ。
 * 文字として読める形にしておく。
 */

import { useEffect, useState } from "react";

import { IconSparkle } from "../Icons";
import { EASING, MOTION } from "../../course/motion";
import { playSuccessSound } from "../../course/sound";

export interface SkillGetProps {
  /** 技の名前。一般的な用語を使う（AIPPO だけの造語にしない）。 */
  name: string;
  /** ひとことの説明。無ければ名前だけ出す。 */
  summary?: string;
  /** 解説の本文。技を受け取ったすぐ下に、1〜2行だけ添える。 */
  detail?: string;
}

export function SkillGet({ name, summary, detail }: SkillGetProps) {
  /*
    出てくる動きは1度だけ。描き直しのたびに滑り直すと、
    同じ技を何度も取ったように見える。
  */
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    setArrived(false);
    const timer = window.setTimeout(() => setArrived(true), 30);
    // 音は既定では鳴らない。設定で入れた人にだけ届く
    playSuccessSound("skill");
    return () => window.clearTimeout(timer);
  }, [name]);

  return (
    /*
      余白を広く取る。**この画面には他に何も置かない。**

      `justify-center` で縦の真ん中へ。上にはポーが「覚えた？」と
      言っていて、下には「覚えた」のボタンしかない。
    */
    <div
      data-testid="skill-get"
      role="status"
      className="flex min-h-0 flex-1 flex-col items-center justify-center
                 px-2 text-center"
      style={{
        transition: `opacity ${MOTION.normal}ms ${EASING}, transform ${MOTION.normal}ms ${EASING}`,
        opacity: arrived ? 1 : 0,
        transform: arrived ? "translateY(0)" : "translateY(8px)",
      }}
    >
      <p className="flex items-center gap-1.5 text-sm font-bold text-brand">
        <IconSparkle className="h-4 w-4 shrink-0" />
        AI技 GET
      </p>
      <p
        className="mt-2 text-2xl font-bold leading-9"
        data-testid="skill-get-name"
      >
        {name}
      </p>
      {summary && (
        <p className="mt-1 text-sm leading-6 text-ink-muted">{summary}</p>
      )}
      {/*
        解説の本文。**囲わない。** 面に入れると、取った瞬間より
        「読むもの」のほうが重く見える。
      */}
      {detail && (
        <p
          className="mt-5 max-w-xs text-sm leading-7 text-ink-muted"
          data-testid="skill-get-detail"
        >
          {detail}
        </p>
      )}
    </div>
  );
}
