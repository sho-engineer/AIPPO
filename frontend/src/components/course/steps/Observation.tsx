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
