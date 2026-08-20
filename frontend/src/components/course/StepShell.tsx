/**
 * どのステップでも共通の枠。
 *
 * 置き方の決まり:
 * - 進み具合を上に。あとどれくらいかが分からないと不安になる
 * - 入力済みの内容は**小さなサマリーカード**にたたむ（要件 §6.4）。
 *   全部の欄を出しっぱなしにすると、いま何を聞かれているのか分からなくなる
 * - 次にやることは**画面下に固定**（要件 §6.11）。
 *   スマートフォンでは、入力欄とボタンが同時に見えることが大事
 * - ポーは入力の邪魔をしない。狭いときは小さくする
 */

import type { ReactNode } from "react";

import {
  IconBulb,
  IconCaution,
  IconRefresh,
  IconSparkle,
  type Icon,
} from "../Icons";
import { PoHero } from "../aippo/PoHero";
import { PrimaryButton } from "../aippo/PrimaryButton";
import { LessonProgress } from "./LessonProgress";
import { StepTransition } from "./StepTransition";
import type { LessonPhase, PoMessage } from "../../course/types";

export interface StepShellProps {
  title: string;
  /** 見出しの上に小さく出す肩書き（「Lesson 1」など）。 */
  eyebrow?: { icon: Icon; label: string };
  instruction?: string;
  progress: { current: number; total: number };
  /**
   * いまどの区切りか。
   *
   * 分かるときは、点の目盛りより先にこちらを出す。
   * 「19歩のうち11歩目」より「いま『自分で試す』のところ」のほうが、
   * 何をしている最中かがすぐ分かる。
   */
  phase?: LessonPhase;
  po: PoMessage;
  summary: { stepId: string; label: string; value: string }[];
  onEditSummary: (stepId: string) => void;
  /** 次にやること。ここだけがユーザーの行き先（憲章 原則 I）。 */
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  /** ボタンの近くに出す理由。禁止ではなく案内（要件 §6.6）。 */
  hintNearButton?: string | null;
  /**
   * 失敗したことを伝える文。
   *
   * ステップの種類に関係なく、**必ずここに出す**。
   * 種類ごとの本文の中だけに置くと、置き忘れた画面で
   * 「押したのに何も起きない」ように見える（実際に起きた）。
   */
  error?: string | null;
  /** 「今回はスキップ」など、主導線以外の逃げ道。 */
  secondary?: { label: string; onClick: () => void };
  /**
   * 逃げ道を、主導線と同じ大きさのボタンで並べるか。
   *
   * ふだんは細い文字のままにする。逃げ道が主導線と同じ大きさで並ぶと、
   * どちらを押せばよいのか決められなくなる。
   * 終わったあとの画面だけは別で、「次へ行く」と「もう一度やる」は
   * どちらも正しい行き先なので、対等に並べる。
   */
  secondaryProminent?: boolean;
  busy?: boolean;
  /** ポーを出すか。本文が同じことを言う画面では下げる。 */
  showPo?: boolean;
  children: ReactNode;
}

export function StepShell({
  title,
  eyebrow,
  instruction,
  progress,
  phase,
  po,
  summary,
  onEditSummary,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  hintNearButton,
  error,
  secondary,
  secondaryProminent = false,
  busy = false,
  showPo = true,
  children,
}: StepShellProps) {
  return (
    <div className="mx-auto max-w-2xl px-5 pb-40 pt-2 sm:pb-32">
      {/*
        進み具合は細い帯ひとつ。

        前は「区切りの帯（4段）」「丸の列（最大7つ）」「数字」の3つで
        同じことを言っていた。3段あると、どれを見れば「あと何回か」が
        分かるのか決められず、結局どれも読まれない。上が説明で埋まって
        本文が下へ押し出される問題もあった。

        phase は受け取るが、ここでは描かない。区切りの名前は
        見出しと本文で伝わる（読み上げ向けに data 属性で残す）。
      */}
      <div className="pt-1" data-phase={phase ?? undefined}>
        <LessonProgress current={progress.current} total={progress.total} />
      </div>

      {/* 入力済みの内容。折りたたんでおく（要件 §6.4） */}
      {summary.length > 0 && (
        <details className="mt-4 rounded-card border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-xs font-bold text-ink-muted">
            ここまでに答えた内容（{summary.length}件）
          </summary>
          <ul className="mt-3 space-y-2">
            {summary.map((entry) => (
              <li
                key={entry.stepId}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="min-w-0">
                  <span className="text-ink-muted">{entry.label}：</span>
                  <span className="break-words font-bold">
                    {entry.value.length > 40
                      ? `${entry.value.slice(0, 40)}…`
                      : entry.value}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onEditSummary(entry.stepId)}
                  className="shrink-0 rounded-badge border border-line px-3 py-1
                             text-xs text-brand-dark transition hover:bg-brand-soft"
                >
                  なおす
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/*
        見出し・説明・ポーを、ひとかたまりで上に置く。

        前はポーを画面のいちばん下（ボタンのすぐ上）に置いていた。
        案内役の言葉は**読み始める前**に要るもので、読み終えた後に
        出てきても遅い。支給デザインも6枚とも、ポーは見出しの右にいる。
      */}
      <div className="mt-4">
        <PoHero
          eyebrow={
            eyebrow && (
              <span className="flex items-center gap-1.5 text-sm font-bold text-brand">
                <eyebrow.icon className="h-4 w-4 shrink-0" />
                {eyebrow.label}
              </span>
            )
          }
          title={title}
          description={instruction}
          message={showPo ? po.message : undefined}
          emotion={po.emotion}
          compact={!eyebrow}
        />
      </div>

      {/*
        ステップが入れ替わったことを、短い動きで伝える。

        向きに意味を持たせてある（進むと左から、戻ると右から）。
        紙をめくる向きと同じで、「いま戻った」ことが文字を読まなくても
        分かる。秒数と加減速は course/motion.ts にまとめてある。
      */}
      <div className="mt-6">
        <StepTransition stepKey={title}>{children}</StepTransition>
      </div>

      {/*
        次にやること。画面の下に固定する。
        safe-area を足さないと、iPhone のホームバーに隠れる。
      */}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95
                   px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
      >
        <div className="mx-auto max-w-2xl">
          {error && (
            <p
              role="alert"
              data-testid="step-error"
              className="mb-2 flex items-start gap-1.5 rounded-card bg-caution-soft px-3 py-2 text-xs leading-5 text-caution"
            >
              <IconCaution className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          {hintNearButton && (
            /*
              押せない理由。**注意の色で常時出さない。**

              まだ選んでいないだけの人に、開いた瞬間からオレンジの警告が
              出ていると、何か間違えたのかと読む。ここは禁止ではなく
              案内なので、ふだんの文字色で電球を添えるだけにする。
              色を使うのは、本当に失敗したとき（error）だけ。
            */
            <p
              className="mb-2 flex items-start gap-1.5 text-xs leading-5 text-ink-muted"
              // 押せない理由は、押す前に読み上げへ届ける
              role="status"
            >
              <IconBulb className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <span>{hintNearButton}</span>
            </p>
          )}
          {/*
            戻る道はヘッダーの「←」1本にした。

            前はここにも「もどる」があり、上の「レッスン一覧へ」と合わせて
            戻る手段が上下に散っていた。行き先が違うもの（1歩戻る／出る）が
            離れて置かれていると、どちらがどこへ行くのか押すまで分からない。

            ここは「次にやること」だけにする。画面の下に1つだけ置くから、
            迷わず押せる（憲章 原則 I）。
          */}
          {/*
            進むボタン。幅いっぱい・56px。支給デザイン6枚とも、
            下端にあるのはこの1つだけ。
          */}
          <div className={secondaryProminent ? "flex items-stretch gap-3" : ""}>
            <PrimaryButton
              testId="primary-action"
              onClick={onPrimary}
              disabled={primaryDisabled || busy}
              icon={busy ? undefined : <IconSparkle className="h-5 w-5 shrink-0" />}
              className={secondaryProminent ? "flex-1" : ""}
            >
              {busy ? "送っています…" : primaryLabel}
            </PrimaryButton>

            {secondary && secondaryProminent && (
              <PrimaryButton
                secondary
                onClick={secondary.onClick}
                icon={<IconRefresh className="h-5 w-5 shrink-0" />}
                className="flex-1"
              >
                {secondary.label}
              </PrimaryButton>
            )}
          </div>

          {secondary && !secondaryProminent && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="mt-2 w-full py-2 text-xs text-ink-muted underline
                         transition hover:text-ink"
            >
              {secondary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
