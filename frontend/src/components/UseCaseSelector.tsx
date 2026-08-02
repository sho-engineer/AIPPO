/**
 * 用途を選ぶ（AIPPO 開発概要 §10 Step 1）。
 *
 * 選ぶと例文が入り、次のステップへ進む。
 * 自由入力はここでは求めない（憲章 原則 I）。
 */

export interface UseCase {
  id: string;
  label: string;
  sampleText: string;
}

export type UseCaseSelectorProps = {
  useCases: readonly UseCase[];
  selectedId: string | null;
  onSelect: (useCase: UseCase) => void;
};

export function UseCaseSelector({
  useCases,
  selectedId,
  onSelect,
}: UseCaseSelectorProps) {
  return (
    <div data-testid="use-case-selector">
      <h2 className="text-base font-bold">
        どの文章を分かりやすくしたいですか？
      </h2>

      <ul className="mt-4 grid gap-2" role="list">
        {useCases.map((useCase) => {
          const isSelected = selectedId === useCase.id;
          return (
            <li key={useCase.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(useCase)}
                className={[
                  "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                  isSelected
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 bg-white hover:border-neutral-500",
                ].join(" ")}
              >
                {useCase.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
