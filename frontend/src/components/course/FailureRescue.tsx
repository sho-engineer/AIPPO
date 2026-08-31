/**
 * うまくいかなかったときに、次にできることを並べる。
 *
 * 前は違った
 * ----------
 * 出るのは「もう一度おくる」1本だけだった。回線が落ちただけなら
 * それで直る。だが**同じ頼み方ではまた同じになる**とき——AI が元の
 * 文章をそのまま返した、頼んだ長さを無視した——押し直しても同じ
 * ところへ戻る。3回押して同じ画面を見た人は、そこでやめる。
 *
 * ここで出す言葉
 * --------------
 * 「不正解」「失敗しました」「入力が正しくありません」は使わない。
 * 起きたのは AI の出力のばらつきで、**書いた人のせいではない**。
 *
 * 評価されたと感じた人は、次から自由入力を避けて例文だけを押すように
 * なる——「自分の仕事で使えるようになる」という目的から、いちばん
 * 遠いところへ行く。
 *
 * どれを出すか
 * ------------
 * 決めるのは `course/rescue.ts`。**押せない道は出さない**——例文を
 * 持たない回に「例文で試す」を出すと、押しても何も起きず、
 * 行き止まりが1つ増えるだけになる。
 */

import { IconChevronRight } from "../Icons";
import { PrimaryButton } from "../aippo/PrimaryButton";
import { PoAvatar } from "../../po/PoAvatar";
import { RESCUE_LEAD, rescueTitle, type RescuePath } from "../../course/rescue";
import type { AiRequestError } from "../../api/ai";
import type { PoMessage } from "../../course/types";

export interface FailureRescueProps {
  kind: AiRequestError["kind"];
  paths: RescuePath[];
  onChoose: (path: RescuePath) => void;
  /** そのときのポーの言葉。困っている人の隣にいる、という以上のことはしない。 */
  po: PoMessage;
}

export function FailureRescue({ kind, paths, onChoose, po }: FailureRescueProps) {
  const [first, ...rest] = paths;

  return (
    <section
      className="rounded-panel border border-line bg-surface p-5 text-center shadow-card"
      data-testid="failure-rescue"
      aria-labelledby="failure-rescue-heading"
    >
      <h2 id="failure-rescue-heading" className="text-lg font-bold leading-7">
        {rescueTitle(kind)}
      </h2>
      <p className="mt-2 text-sm leading-6 text-ink-muted">{RESCUE_LEAD}</p>

      <div className="mt-4 flex justify-center">
        <PoAvatar po={po} />
      </div>

      {/*
        いちばん確実に成功へ着く道を主ボタンにする。詰まっている人には
        「どれを押せばいいか」まで決めて渡す。残りは同じ重さで下に並べる
        ——隠さない。隠すと、その人にとっての正解が見えないまま終わる。
      */}
      <div className="mt-6 space-y-3">
        {first && (
          <PrimaryButton
            testId={`rescue-${first.id}`}
            onClick={() => onChoose(first)}
            trailing={<IconChevronRight className="h-5 w-5 shrink-0" />}
          >
            {first.label}
          </PrimaryButton>
        )}
        {rest.map((path) => (
          <button
            key={path.id}
            type="button"
            data-testid={`rescue-${path.id}`}
            onClick={() => onChoose(path)}
            className="w-full rounded-card border border-line px-4 py-3 text-sm
                       font-bold text-ink transition hover:bg-canvas
                       focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {path.label}
          </button>
        ))}
      </div>
    </section>
  );
}
