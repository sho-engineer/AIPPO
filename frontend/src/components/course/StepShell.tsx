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

import { IconCaution, IconCheck, type Icon } from "../Icons";
import { PoAvatar } from "../../po/PoAvatar";
import { LESSON_PHASES, type LessonPhase, type PoMessage } from "../../course/types";

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
  onBack?: () => void;
  /** 「今回はスキップ」など、主導線以外の逃げ道。 */
  secondary?: { label: string; onClick: () => void };
  busy?: boolean;
  children: ReactNode;
}

/**
 * 名前の付いた4段の帯。
 *
 * 済んだところはチェックで塗り、いまいるところだけ文字を濃くする。
 * 色だけで現在地を示さない（丸の大きさと文字の太さでも変える）。
 */
function PhaseStepper({ phase }: { phase: LessonPhase }) {
  const current = LESSON_PHASES.findIndex((entry) => entry.key === phase);

  return (
    <ol
      className="flex items-start"
      role="list"
      aria-label="レッスンの流れ"
      data-testid="phase-stepper"
    >
      {LESSON_PHASES.map((entry, index) => {
        const done = index < current;
        const here = index === current;
        return (
          <li key={entry.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              {/* 手前へつながる線。先頭だけ描かない */}
              <span
                aria-hidden="true"
                className={`h-0.5 flex-1 ${
                  index === 0 ? "bg-transparent" : done || here ? "bg-brand" : "bg-line"
                }`}
              />
              <span
                aria-hidden="true"
                className={`flex shrink-0 items-center justify-center rounded-full transition-all
                            ${
                              done
                                ? "h-5 w-5 bg-brand text-white"
                                : here
                                  ? "h-5 w-5 bg-brand ring-4 ring-brand-soft"
                                  : "h-3.5 w-3.5 bg-line"
                            }`}
              >
                {done && <IconCheck className="h-3 w-3" />}
              </span>
              <span
                aria-hidden="true"
                className={`h-0.5 flex-1 ${
                  index === LESSON_PHASES.length - 1
                    ? "bg-transparent"
                    : done
                      ? "bg-brand"
                      : "bg-line"
                }`}
              />
            </div>
            <span
              className={`mt-1.5 text-center text-[0.6875rem] leading-4 ${
                here ? "font-bold text-brand" : "text-ink-muted"
              }`}
            >
              {entry.label}
              {here && <span className="sr-only">（いまここ）</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
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
  onBack,
  secondary,
  busy = false,
  children,
}: StepShellProps) {
  /**
   * 出す点は最大7つ。
   * 20ステップぶん並べると1つ1つが潰れて、かえって進み具合が読めない。
   */
  const MAX_DOTS = 7;
  const half = Math.floor(MAX_DOTS / 2);
  const start = Math.max(
    0,
    Math.min(progress.current - 1 - half, progress.total - MAX_DOTS),
  );
  const shown = Math.min(MAX_DOTS, progress.total);
  const dots = Array.from({ length: shown }, (_, offset) => {
    const index = start + offset;
    return {
      index,
      last: offset === shown - 1,
      state:
        index < progress.current - 1
          ? ("done" as const)
          : index === progress.current - 1
            ? ("current" as const)
            : ("todo" as const),
    };
  });

  return (
    <div className="mx-auto max-w-2xl px-5 pb-40 pt-2 sm:pb-32">
      {/*
        区切りの名前が分かるなら、そちらを先に出す。
        点だけだと「あと何歩か」しか読めず、何をしている最中かは伝わらない。
      */}
      {phase && (
        <div className="mb-4">
          <PhaseStepper phase={phase} />
        </div>
      )}

      {/*
        進み具合は点でつないで見せる。
        棒グラフだと「あと何回か」が読めないが、点なら数えられる。
        数が多いレッスンでは点が潰れるので、現在地の前後だけ出す。

        区切りの帯を出しているときは、点の列は畳んで数字だけ残す。
        同じことを2段で言うと、どちらを見ればよいのか分からなくなる
        （それでも「あと何歩か」は数字で分かる）。
      */}
      <div
        role="progressbar"
        aria-label="レッスンの進み具合"
        aria-valuenow={progress.current}
        aria-valuemin={1}
        aria-valuemax={progress.total}
        aria-valuetext={`${progress.total}歩のうち${progress.current}歩目`}
        className={`flex items-center gap-1.5 ${
          phase ? "justify-end" : "justify-center"
        }`}
      >
        {!phase &&
          dots.map((dot) => (
          <span key={dot.index} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`block rounded-full transition-all ${
                dot.state === "done"
                  ? "h-2.5 w-2.5 bg-brand"
                  : dot.state === "current"
                    ? "h-3 w-3 bg-brand ring-4 ring-brand-soft"
                    : "h-2.5 w-2.5 bg-brand-line"
              }`}
            />
            {!dot.last && (
              <span aria-hidden="true" className="h-px w-4 bg-brand-line sm:w-6" />
            )}
            </span>
          ))}
        <span className="shrink-0 text-xs text-ink-muted">
          {progress.current} / {progress.total}
        </span>
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
                  className="shrink-0 rounded-full border border-brand-line px-3 py-1
                             text-xs text-brand-dark transition hover:bg-brand-soft"
                >
                  なおす
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {eyebrow && (
        <p className="mt-5 flex items-center gap-2 text-sm font-bold text-brand">
          <eyebrow.icon className="h-4 w-4 shrink-0" />
          {eyebrow.label}
        </p>
      )}
      <h1 className={`text-xl font-bold sm:text-2xl ${eyebrow ? "mt-1" : "mt-6"}`}>
        {title}
      </h1>
      {instruction && (
        <p className="mt-2 text-sm leading-7 text-ink-muted">{instruction}</p>
      )}

      {/*
        ステップが変わったことを、ごく短い動きで伝える。
        key にステップの見出しを渡し、変わるたびにやり直す。
        0.22 秒。これ以上長くすると、進むたびに待たされる。
      */}
      <div key={title} className="mt-6 animate-slide-in">
        {children}
      </div>

      <div className="mt-8 sm:mt-10">
        <PoAvatar po={po} compact />
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
            <p
              className="mb-2 text-xs text-caution"
              // 押せない理由は、押す前に読み上げへ届ける
              role="status"
            >
              {hintNearButton}
            </p>
          )}
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="shrink-0 rounded-full border border-brand-line px-4 py-3
                           text-sm text-brand-dark transition hover:bg-brand-soft"
              >
                もどる
              </button>
            )}
            <button
              type="button"
              data-testid="primary-action"
              onClick={onPrimary}
              disabled={primaryDisabled || busy}
              className="min-h-[3rem] flex-1 rounded-full bg-brand-grad px-6 py-3 text-base
                         font-bold text-white shadow-pop transition
                         hover:brightness-110 active:brightness-95
                         disabled:cursor-not-allowed disabled:bg-brand-line
                         disabled:bg-none disabled:text-ink-muted disabled:shadow-none"
            >
              {busy ? "送っています…" : primaryLabel}
            </button>
          </div>
          {secondary && (
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
