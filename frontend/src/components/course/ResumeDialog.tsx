/**
 * 途中まで進めた教材を、もう一度ひらいたときの一枚。
 *
 * 出す・出さないを決めるのはここではない（`course/resume.ts`）。
 * この部品は、渡されたら描くだけ。
 *
 * 3つ並べる順
 * -----------
 *     つづきから      … 押す人がいちばん多い。面で出す
 *     最初からやり直す … 消えるものがあるので、枠で1段下げる
 *     あとで          … 開くつもりが無かった人。文字だけ
 *
 * 消えるものを、押す前に言う
 * --------------------------
 * 「最初からやり直す」のすぐ下に置く。押したあとで確認をもう一枚
 * 重ねない——**同じことを二度聞かれる**と、読まずに押す癖が付く。
 * 言うのは2つで、消えるものと、消えないもの。後者が無いと、
 * 取った技まで消えると読まれる。
 *
 * 背景では閉じない
 * ----------------
 * 押し間違いで閉じると、**選ばないまま続きの画面に着く**。それは
 * 「つづきから」を選んだのと同じことになってしまう。閉じ方は
 * ×・「あとで」・Esc の3つ。
 */

import { useRef } from "react";

import { MoreSheet } from "./MoreSheet";
import { PrimaryButton } from "../aippo/PrimaryButton";
import { PoFace } from "../../po/PoAvatar";
import type { ResumeOffer } from "../../course/resume";

export interface ResumeDialogProps {
  offer: ResumeOffer;
  /** 「つづきから」。控えのまま続ける。 */
  onResume: () => void;
  /** 「最初からやり直す」。この教材の途中だけを消して、頭から。 */
  onRestart: () => void;
  /** 「あとで」「×」「Esc」。控えは触らず、来た画面へ戻る。 */
  onLater: () => void;
}

const TITLE_ID = "resume-dialog-title";
const DESCRIPTION_ID = "resume-dialog-description";

export function ResumeDialog({
  offer,
  onResume,
  onRestart,
  onLater,
}: ResumeDialogProps) {
  /*
    2回押されても、1回しか進まない。押すと画面が入れ替わるが、
    **指の2度目は入れ替わるより早い**ことがある。
  */
  const acted = useRef(false);
  const once = (run: () => void) => () => {
    if (acted.current) return;
    acted.current = true;
    run();
  };

  return (
    <MoreSheet
      title="つづきから始める？"
      labelledBy={TITLE_ID}
      describedBy={DESCRIPTION_ID}
      placement="center"
      dismissOnScrim={false}
      /*
        履歴を積まない。ここは**入る前の関所**で、開いて入った場所では
        ない。積むと、「戻る」で関所だけが閉じて、**選んでいない続きの
        画面**に着く。積まなければ、そのまま教材の外へ抜ける。
      */
      holdsBack={false}
      chromeless
      testId="resume-sheet"
      onClose={onLater}
    >
      <div className="px-1 pb-1 pt-2 text-center" data-testid="resume-dialog">
        {/*
          ポーは小さく。**主役は「どこまで進んでいるか」と、押す先**。
          ここで場所を取ると、低い持ち方で下の「あとで」が画面から出る。
        */}
        <div className="flex justify-center" data-testid="resume-po">
          <PoFace emotion="question" size="sm" />
        </div>

        <h2 id={TITLE_ID} className="mt-2 text-lg font-bold leading-7">
          つづきから始める？
        </h2>

        {/*
          どこまで進んでいるか。**教材データから作った文**をそのまま出す
          （`course/resume.ts`）。数を画面に書き写さない。
        */}
        <div id={DESCRIPTION_ID} className="mt-3 rounded-card bg-canvas px-4 py-3">
          <p className="text-sm font-bold leading-6" data-testid="resume-headline">
            {offer.headline}
          </p>
          {offer.lines.map((line) => (
            <p
              key={line}
              className="mt-0.5 text-[0.8125rem] leading-6 text-ink-muted"
              data-testid="resume-line"
            >
              {line}
            </p>
          ))}
        </div>

        {offer.canResume ? (
          <PrimaryButton
            testId="resume-continue"
            onClick={once(onResume)}
            className="mt-4 w-full"
          >
            つづきから
          </PrimaryButton>
        ) : (
          /*
            復元できない回。**「つづきから」を並べない。**

            押せない形で置くと、押せる場所を探し続けることになる。
            代わりに理由を1行。
          */
          <p
            className="mt-4 rounded-card bg-caution-soft px-4 py-3 text-xs
                       leading-6 text-caution"
            role="status"
            data-testid="resume-blocked"
          >
            {offer.blocked}
          </p>
        )}

        <PrimaryButton
          secondary
          testId="resume-restart"
          onClick={once(onRestart)}
          className="mt-2 w-full"
        >
          最初からやり直す
        </PrimaryButton>

        {/*
          消えるものを、押す前に言う。**押したあとに確認を重ねない。**
        */}
        <p
          className="mt-1.5 text-[0.6875rem] leading-5 text-ink-muted"
          data-testid="resume-reset-note"
        >
          今回の途中の回答・入力はリセットされます。
          <br />
          獲得済みのスキルや完了記録は残ります。
        </p>

        <button
          type="button"
          onClick={once(onLater)}
          data-testid="resume-later"
          className="mt-2 min-h-[2.75rem] w-full rounded-cta px-4 text-sm
                     font-bold text-brand-dark transition hover:bg-brand-soft"
        >
          あとで
        </button>
      </div>
    </MoreSheet>
  );
}
