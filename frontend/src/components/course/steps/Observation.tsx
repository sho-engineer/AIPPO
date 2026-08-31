/**
 * 観察の一覧。
 *
 * AIの結果のどこが変わったのかを、項目に分けて自分で確かめる画面。
 */

import type { LessonStep, StepOption } from "../../../course/types";

// ------------------------------------------------------------- 観察の一覧

/**
 * 「どこが変わったと思いますか」。
 *
 * チップではなく**縦のチェック一覧**にする。
 * 複数選べることが形で分かるし、上から順に読み比べられる。
 * 正誤は付けない。「よく分からない」も同じ見た目で並べる。
 */
export function ObservationList({
  step,
  value,
  onChange,
}: {
  step: LessonStep;
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = value.split(",").filter(Boolean);

  const toggle = (option: StepOption) => {
    const next = selected.includes(option.value)
      ? selected.filter((entry) => entry !== option.value)
      : [...selected, option.value];
    onChange(next.join(","));
  };

  return (
    <ul className="space-y-2" role="list" data-testid="observation-list">
      {(step.options ?? []).map((option) => {
        const active = selected.includes(option.value);
        return (
          <li key={option.value}>
            <button
              type="button"
              onClick={() => toggle(option)}
              aria-pressed={active}
              className={`flex w-full items-center gap-3 rounded-card border px-4 py-3
                          text-left text-sm transition ${
                            active
                              ? "border-brand bg-brand-soft"
                              : "border-line bg-surface hover:border-brand-line"
                          }`}
            >
              {/* 選ばれていることを色だけで表さない */}
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center
                            rounded border text-xs font-bold ${
                              active
                                ? "border-brand bg-brand text-white"
                                : "border-brand-line bg-surface text-transparent"
                            }`}
              >
                ✓
              </span>
              {option.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * うまくいかなかった人にだけ、その場で理由を聞く。
 *
 * なぜ要るか
 * ----------
 * 結果の直後の問いを2択（「うん」「まだ微妙」）に減らすと画面は軽く
 * なるが、**何に気づいたかが測れなくなる**。前は5つの選択肢がその
 * 役目を持っていた。
 *
 * 全員に聞き直すと元の重さに戻るので、**困っている人にだけ**聞く。
 * 進んでいる人の画面は軽いまま、詰まっている人の情報は残る。
 *
 * 答えなくても進める。ここで止めると、理由を選べない人が
 * 行き止まりになる。
 */
export function ObservationReason({
  reasons,
  value,
  onChange,
}: {
  reasons: StepOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (reasons.length === 0) return null;

  return (
    <div className="mt-4" data-testid="observation-reason">
      <p className="text-xs font-bold text-ink-muted">どこが？（任意）</p>
      <ul className="mt-2 flex flex-wrap gap-2" role="list">
        {reasons.map((reason) => {
          const active = value === reason.value;
          return (
            <li key={reason.value}>
              <button
                type="button"
                onClick={() => onChange(active ? "" : reason.value)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  active
                    ? "border-brand bg-brand-soft text-brand-dark"
                    : "border-line bg-surface hover:border-brand-line"
                }`}
              >
                {reason.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
