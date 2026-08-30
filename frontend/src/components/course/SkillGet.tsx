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
 * 大きくしない
 * ------------
 * 大人が仕事の合間に使う画面なので、紙吹雪も光る枠も合わない。
 * 帯が1度すべり出て、短い文が付くくらいで足りる。派手にすると、
 * 集めることが目的に見えてくる（憲章の「Game要素を学習より前面に
 * 出しすぎない」）。
 *
 * 出したまま残す
 * --------------
 * `StepDone` と違って**消さない**。あちらは押した直後の手応えで、
 * 残ると次の操作の邪魔になる。こちらは解説カードの見出しそのもので、
 * 消えると何の説明を読んでいるのか分からなくなる。動きだけを1度出す。
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
}

export function SkillGet({ name, summary }: SkillGetProps) {
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
    <div
      data-testid="skill-get"
      role="status"
      className="mb-4 rounded-card border border-brand-line bg-brand-soft/50 px-4 py-3"
      style={{
        transition: `opacity ${MOTION.normal}ms ${EASING}, transform ${MOTION.normal}ms ${EASING}`,
        opacity: arrived ? 1 : 0,
        transform: arrived ? "translateY(0)" : "translateY(6px)",
      }}
    >
      <p className="flex items-center gap-1.5 text-xs font-bold text-brand">
        <IconSparkle className="h-3.5 w-3.5 shrink-0" />
        新しいAI技
      </p>
      <p className="mt-1 text-base font-bold leading-7" data-testid="skill-get-name">
        {name}
      </p>
      {summary && (
        <p className="mt-0.5 text-sm leading-6 text-ink-muted">{summary}</p>
      )}
    </div>
  );
}
