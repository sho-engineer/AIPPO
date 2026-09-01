/**
 * 「Day1 終了！」の瞬間。
 *
 * なぜ要るか
 * ----------
 * 完了画面には「Lesson 1 完了」という文字はあったが、**Day が
 * 終わった瞬間**が無かった。できるようになったこと・成果物・
 * スタンプ・次の行き先が縦に並ぶだけで、読み終えた感じで終わる。
 * 19歩かけて1つできるようになった日の締めくくりとしては弱い。
 *
 * 完了画面の上に重ねる
 * --------------------
 * 押させてから出す形（完了 → 押す → 祝う）は採らない。最後の CTA を
 * 押した直後に、もう1回押させることになる。完了画面が描かれたら
 * そのまま重ね、閉じれば完了画面がそのまま残る（行き止まりにしない）。
 *
 * 初回だけ
 * --------
 * やり直すたびに祝われると、祝いが安くなる。判定は「この画面を出す
 * 時点で、その教材が既に終わったことになっていたか」で足りる。
 *
 * 待たせない
 * ----------
 * 段階的に出すが、**0ms の時点から閉じられる**。演出が終わるまで
 * 操作できない画面にはしない。Esc・背景・× のどれでも抜けられる。
 *
 * 動きを減らす設定のとき
 * ----------------------
 * 段階を全部飛ばして、最初から最終形を出す。粒は出さない。
 * CSS の一括停止（index.css）では、遅らせて出すものは**出ないまま
 * 消える**ことがあるので、ここは自分で見る。
 */

import { useEffect, useRef, useState } from "react";

import { PoFace } from "../../po/PoAvatar";
import { prefersReducedMotion } from "../../course/motion";
import { playSuccessSound } from "../../course/sound";
import { EVENTS, track } from "../../lib/analytics";
import { IconCheck, IconChevronRight, IconSparkle } from "../Icons";

/**
 * 出る順番（ms）。
 *
 * 全部で 0.9 秒。これ以上伸ばすと、祝いではなく待ち時間になる。
 * 粒は 400ms から 0.8 秒で消える。
 */
const STEPS = {
  po: 100,
  title: 250,
  particles: 400,
  skill: 550,
  progress: 700,
  cta: 900,
} as const;

/** 散る粒。12片。増やすと、祝いではなく演出そのものが目的に見える。 */
const SPREAD = [-40, -31, -22, -13, -5, 3, 11, 20, 29, 37, 44, 50];

export interface DayCompleteProps {
  /** 何日目か。教材データの `lesson.number`。 */
  day: number;
  /** その日にできるようになったこと。1〜2行。 */
  outcome: string;
  /** 覚えたAI技。無ければその段ごと出さない。 */
  skill?: string;
  /** 終えた数と、始められる教材の数。 */
  done: number;
  total: number;
  /** 次のレッスンへ。無ければボタンを出さない（コース完走）。 */
  onNext?: () => void;
  /** コースの道のりへ戻る。 */
  onBackToCourse: () => void;
  /** 閉じる。完了画面がそのまま残る。 */
  onClose: () => void;
}

export function DayComplete({
  day,
  outcome,
  skill,
  done,
  total,
  onNext,
  onBackToCourse,
  onClose,
}: DayCompleteProps) {
  const quiet = prefersReducedMotion();
  /** どこまで出したか。動きを減らす設定なら、最初から全部。 */
  const [at, setAt] = useState(quiet ? STEPS.cta : 0);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    track(EVENTS.dayCompleted, { amount: day });
    playSuccessSound("day");
  }, [day]);

  useEffect(() => {
    if (quiet) return;
    const timers = Object.values(STEPS).map((delay) =>
      window.setTimeout(() => setAt((now) => Math.max(now, delay)), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [quiet]);

  /*
    Esc で閉じる。フォーカスは中へ移す。

    重ねた画面の外へタブで出ていけると、下の完了画面のボタンを
    押せてしまい、どちらの画面にいるのか分からなくなる。
  */
  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** その段まで来たか。 */
  const shown = (delay: number) => at >= delay;

  /** 現れ方。動きを減らす設定なら、動かさずそのまま出す。 */
  const reveal = (delay: number) => ({
    opacity: shown(delay) ? 1 : 0,
    transform: shown(delay) ? "none" : "translateY(8px)",
    transition: quiet ? "none" : "opacity 260ms ease-out, transform 260ms ease-out",
  });

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-5"
      data-testid="day-complete"
    >
      {/*
        下の完了画面を薄く沈める。**消さない。**
        何の上に重なっているのかが見えていないと、閉じた先が
        分からないまま押すことになる。

        ぼかしは掛けない。端末によっては重く、閉じるたびに引っかかる。
      */}
      <button
        type="button"
        aria-label="閉じる"
        data-testid="day-complete-scrim"
        onClick={onClose}
        className="absolute inset-0 bg-ink/45"
        style={{
          opacity: at > 0 || quiet ? 1 : 0,
          transition: quiet ? "none" : "opacity 200ms ease-out",
        }}
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-complete-title"
        tabIndex={-1}
        className="relative w-full max-w-sm rounded-panel bg-surface px-6 pb-6 pt-16
                   shadow-dialog outline-none"
      >
        {/*
          ポーは面の上へ出す。中に収めると、ただのカードの中の絵になる。
          「上から出てきた」と見えるほうが、瞬間として残る。
        */}
        <div
          className="pointer-events-none absolute -top-14 left-1/2 -translate-x-1/2"
          style={{
            opacity: shown(STEPS.po) ? 1 : 0,
            transform: shown(STEPS.po)
              ? "translateX(-50%) scale(1)"
              : "translateX(-50%) scale(0.92) translateY(10px)",
            transition: quiet
              ? "none"
              : "opacity 240ms ease-out, transform 240ms cubic-bezier(0.34, 1.4, 0.64, 1)",
          }}
        >
          <PoFace emotion="celebrate" size="celebration" animate={false} />
        </div>

        {/* 粒。飾りなので読み上げには出さない */}
        {!quiet && shown(STEPS.particles) && (
          <div
            aria-hidden="true"
            data-testid="day-complete-particles"
            className="pointer-events-none absolute inset-x-0 top-0 h-24 overflow-hidden"
          >
            {SPREAD.map((offset, index) => (
              <span
                key={offset}
                className="absolute left-1/2 top-2 block h-1.5 w-1.5 rounded-[1px] bg-brand"
                style={{
                  backgroundColor:
                    index % 3 === 0 ? "var(--joy, #B8425A)" : undefined,
                  animation: "confetti 800ms ease-out forwards",
                  animationDelay: `${index * 18}ms`,
                  ["--confetti-x" as string]: `${offset * 2.4}px`,
                }}
              />
            ))}
          </div>
        )}

        <div className="text-center" style={reveal(STEPS.title)}>
          <h2
            id="day-complete-title"
            className="text-2xl font-bold"
            data-testid="day-complete-title"
            role="status"
          >
            Day{day} 終了！
          </h2>
          <p className="mt-2 text-sm leading-7 text-ink-muted">{outcome}</p>
        </div>

        {skill && (
          <div
            className="mt-5 flex items-center gap-3 rounded-card border border-brand-line
                       bg-brand-soft/50 px-4 py-3"
            style={reveal(STEPS.skill)}
            data-testid="day-complete-skill"
          >
            <IconSparkle className="h-5 w-5 shrink-0 text-brand" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-brand">覚えたAI技</span>
              <span className="block text-sm font-bold leading-6">{skill}</span>
            </span>
            <IconCheck className="h-5 w-5 shrink-0 text-brand" />
          </div>
        )}

        {/*
          進み具合。**線の伸びだけで伝えない。**
          動きを止めている人にも分かるよう、数を文字で添える。
        */}
        <div className="mt-5" style={reveal(STEPS.progress)}>
          <div className="flex items-baseline justify-between text-xs text-ink-muted">
            <span>コースの進み具合</span>
            <span className="font-bold tabular-nums text-ink">
              {done} / {total}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-line"
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label="コースの進み具合"
            data-testid="day-complete-progress"
          >
            <div
              className="h-full rounded-full bg-brand"
              style={{
                width: shown(STEPS.progress)
                  ? `${total > 0 ? (done / total) * 100 : 0}%`
                  : "0%",
                transition: quiet ? "none" : "width 520ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            />
          </div>
        </div>

        <div className="mt-6 space-y-2" style={reveal(STEPS.cta)}>
          {onNext && (
            <button
              type="button"
              data-testid="day-complete-next"
              onClick={() => {
                track(EVENTS.dayCompleteNextClicked, { amount: day });
                onNext();
              }}
              className="flex min-h-[3rem] w-full items-center justify-center gap-1.5
                         rounded-cta bg-brand px-6 text-base font-bold text-white
                         shadow-cta transition active:scale-[0.98] hover:brightness-110"
            >
              次のレッスンへ
              <IconChevronRight className="h-5 w-5 shrink-0" />
            </button>
          )}
          <button
            type="button"
            data-testid="day-complete-back"
            onClick={onBackToCourse}
            className="min-h-[2.75rem] w-full rounded-cta px-6 text-sm font-bold
                       text-brand-dark transition hover:bg-brand-soft"
          >
            コースに戻る
          </button>
        </div>

        {/*
          閉じる。演出の途中でも押せる。
          背景と Esc でも閉じられるが、指で押せる的も必ず1つ置く。
        */}
        <button
          type="button"
          aria-label="閉じて完了画面を見る"
          data-testid="day-complete-close"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center
                     rounded-full text-ink-muted transition hover:bg-brand-soft"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
