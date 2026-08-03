/**
 * 選択肢の一覧。
 *
 * 憲章 原則 I により、初期状態で自由入力を求めず、まず選択肢を出す。
 * 診断・用途選択・改善方向の3か所で使い回す。
 */

export interface Choice {
  value: string;
  label: string;
}

export type ChoiceListProps = {
  name: string;
  choices: readonly Choice[];
  selected?: string | null;
  onSelect: (value: string) => void;
  disabled?: boolean;
};

export function ChoiceList({
  name,
  choices,
  selected = null,
  onSelect,
  disabled = false,
}: ChoiceListProps) {
  return (
    <ul className="mt-4 grid gap-2" role="list">
      {choices.map((choice) => {
        const isSelected = selected === choice.value;
        return (
          <li key={choice.value}>
            <button
              type="button"
              name={name}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => onSelect(choice.value)}
              className={[
                "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                isSelected
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-surface hover:border-brand",
                disabled ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              {choice.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
