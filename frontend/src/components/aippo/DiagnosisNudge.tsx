/**
 * ホームで1度だけ出す、「まずは診断を」の一枚。
 *
 * 出す・出さないを決めるのはここではない（`course/diagnosisNudge.ts`）。
 * この部品は、渡されたら描くだけ。
 *
 * 絵を置かない
 * ------------
 * ポーも図も置いていない。**この一枚で判断に要るのは4行だけ**——
 * 何の案内か・何が分かるか・どれくらいかかるか・押す先。絵を足すと、
 * 低い持ち方（iPhone の Safari で上下の帯が出た 320×568）でそのぶん
 * 下の「あとで」が画面から出る。印は、上のチェックの用紙ひとつで足りる。
 *
 * 1画面に収める
 * --------------
 * 320×568 でも送らずに全部見える高さに組んである。文字は縮めない
 * ——**読めなくなったら案内の用を成さない**ので、収まらない持ち方では
 * 一枚そのものが縦に送れる（`MoreSheet` の枠が持っている）。
 * 中にもう1つ送れる箱は作らない。
 *
 * 背景では閉じない
 * ----------------
 * 1人に1度しか出ない案内なので、指が外れただけで消えると、読む前に
 * 無くなった人にはもう出ない。閉じ方は×・「あとで」・Esc の3つ。
 */

import { useRef } from "react";

import { IconChecklist } from "../Icons";
import { MoreSheet } from "../course/MoreSheet";
import { PrimaryButton } from "./PrimaryButton";

export interface DiagnosisNudgeDialogProps {
  /** 「診断をはじめる」。閉じてから、診断の1問目へ。 */
  onStart: () => void;
  /** 「あとで」「×」「Esc」。閉じて、そのままホームを使う。 */
  onClose: () => void;
}

/** 読み上げが、一枚の名前として読む見出し。 */
const TITLE_ID = "diagnosis-nudge-title";
/** 読み上げが、名前のあとに続けて読む1文。 */
const DESCRIPTION_ID = "diagnosis-nudge-description";

export function DiagnosisNudgeDialog({
  onStart,
  onClose,
}: DiagnosisNudgeDialogProps) {
  /*
    2回押されても、1回しか出さない。

    押すと一枚が閉じて画面が入れ替わるが、**指の2度目は閉じるより
    早い**ことがある。そのまま2回進むと履歴に同じ行き先が2つ積まれ、
    診断から「戻る」を押した人が、もう一度診断に着く。

    `state` ではなく `ref`。同じ描画の中で2回押されたときは、
    書き換えた `state` がまだ読めない。
  */
  const starting = useRef(false);

  return (
    <MoreSheet
      /*
        読み上げ用の名前。画面に出ている見出しと同じ言葉にする
        ——別の言葉にすると、目で読む人と耳で聞く人が違う案内を
        受け取ることになる。
      */
      title="まずは、AI活用診断をやってみよう！"
      labelledBy={TITLE_ID}
      describedBy={DESCRIPTION_ID}
      placement="center"
      dismissOnScrim={false}
      chromeless
      testId="diagnosis-nudge-sheet"
      onClose={onClose}
    >
      <div className="px-1 pb-1 pt-3 text-center" data-testid="diagnosis-nudge">
        {/*
          印は小さく。**主役は見出しと開始ボタン**なので、ここで場所を
          取らせない。丸い地の中に線画1つ、48px。
        */}
        <span
          aria-hidden="true"
          className="mx-auto flex h-12 w-12 items-center justify-center
                     rounded-full bg-brand-soft"
        >
          <IconChecklist className="h-6 w-6 text-brand" />
        </span>

        <p className="mt-3 text-sm font-bold leading-5 text-brand">
          AIPPOへようこそ
        </p>

        {/*
          見出し。**画面に出ているこれが、そのまま一枚の名前になる**
          （`labelledBy`）。読み上げ用の見出しを別に立てると、同じ言葉が
          2つ並ぶ——目で読む人には1つ、耳で聞く人には2つになる。
        */}
        <h2 id={TITLE_ID} className="mt-1.5 text-xl font-bold leading-8">
          まずは、AI活用診断を
          <br />
          やってみよう！
        </h2>

        <p
          id={DESCRIPTION_ID}
          className="mt-2.5 text-sm leading-6 text-ink-muted"
        >
          5つの質問で、今の得意と
          <br />
          次に伸ばす力が分かります。
        </p>

        {/*
          押す前に決める材料。**「正解・不正解なし」をここに置く**のは、
          診断を開く前にいちばん出てくる不安がそれだから。
        */}
        <p
          className="mt-2 text-xs leading-5 text-ink-muted"
          data-testid="diagnosis-nudge-meta"
        >
          約1分 ・ 全5問 ・ 正解・不正解なし
        </p>

        <PrimaryButton
          testId="diagnosis-nudge-start"
          onClick={() => {
            if (starting.current) return;
            starting.current = true;
            onStart();
          }}
          className="mt-5 w-full"
        >
          診断をはじめる
        </PrimaryButton>

        {/*
          降りる道。**進む道のすぐ下に、同じ大きさの当たり判定で置く。**
          小さくすると「間違えて押すもの」に見え、任意のはずの診断が
          事実上の必須になる。
        */}
        <button
          type="button"
          onClick={onClose}
          data-testid="diagnosis-nudge-later"
          className="mt-1 min-h-[2.75rem] w-full rounded-cta px-4 text-sm font-bold
                     text-brand-dark transition hover:bg-brand-soft"
        >
          あとで
        </button>
      </div>
    </MoreSheet>
  );
}
