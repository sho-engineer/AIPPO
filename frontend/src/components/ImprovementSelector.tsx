/**
 * 改善の方向を選ぶ（AIPPO 開発概要 §10 Step 6）。
 *
 * 選べるのは1つだけ。ポーが伝える改善点も一度に一つ（§8）。
 */

export interface Improvement {
  id: string;
  label: string;
  instruction: string;
}

export type ImprovementSelectorProps = {
  improvements: readonly Improvement[];
  selectedId: string | null;
  onSelect: (improvement: Improvement) => void;
  disabled?: boolean;
};

export function ImprovementSelector({
  improvements,
  selectedId,
  onSelect,
  disabled = false,
}: ImprovementSelectorProps) {
  return (
    <div data-testid="improvement-selector">
      <h2 className="text-base font-bold">どこを直したいですか？</h2>
      <p className="mt-1 text-xs text-neutral-600">一つだけ選んでください。</p>

      <ul className="mt-4 grid gap-2" role="list">
        {improvements.map((improvement) => {
          const isSelected = selectedId === improvement.id;
          return (
            <li key={improvement.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => onSelect(improvement)}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                  isSelected
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 bg-white hover:border-neutral-500",
                  disabled ? "cursor-not-allowed opacity-50" : "",
                ].join(" ")}
              >
                {improvement.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
