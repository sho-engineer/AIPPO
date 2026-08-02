/**
 * 穴埋め形式で条件を追加する（AIPPO 開発概要 §10 Step 2-3）。
 *
 * この文章を、【誰向け】に、【どのような表現】で、【どれくらいの長さ】にしてください。
 *
 * - 各項目はまず選択肢を出す。自由入力も併せて許可する（憲章 原則 I）
 * - 未入力があるときは、不足している項目を **1つだけ** 示す
 */

import { ERRORS, LIMITS } from "../content/ui";

export interface FillInField {
  key: string;
  label: string;
  placeholder: string;
  options: string[];
  required: boolean;
}

export type FillInFormProps = {
  fields: readonly FillInField[];
  values: Record<string, string>;
  sourceText: string;
  onChangeSourceText: (text: string) => void;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
};

/** 最初に見つかった未入力の必須項目。すべて埋まっていれば null。 */
export function firstMissingField(
  fields: readonly FillInField[],
  values: Record<string, string>,
): FillInField | null {
  return fields.find((f) => f.required && !values[f.key]?.trim()) ?? null;
}

export function FillInForm({
  fields,
  values,
  sourceText,
  onChangeSourceText,
  onChange,
  disabled = false,
}: FillInFormProps) {
  const overLimit = sourceText.length > LIMITS.maxUserInputLength;

  return (
    <div data-testid="fill-in-form">
      <label htmlFor="source-text" className="block text-sm font-bold">
        分かりやすくしたい文章
      </label>
      <textarea
        id="source-text"
        value={sourceText}
        disabled={disabled}
        rows={5}
        onChange={(e) => onChangeSourceText(e.target.value)}
        className="mt-2 w-full rounded-xl border border-neutral-300 p-3 text-sm
                   leading-6 disabled:bg-neutral-100"
      />
      <p className="mt-1 text-right text-xs text-neutral-600">
        {sourceText.length} / {LIMITS.maxUserInputLength}
      </p>
      {overLimit ? (
        <p className="text-xs text-red-700" role="alert">
          {ERRORS.tooLong(LIMITS.maxUserInputLength)}
        </p>
      ) : null}

      <p className="mt-6 text-sm leading-7">
        この文章を、
        <br />
        <span className="font-bold">【誰向け】</span>に、
        <span className="font-bold">【どのような表現】</span>で、
        <span className="font-bold">【どれくらいの長さ】</span>にしてください。
      </p>

      <div className="mt-4 grid gap-6">
        {fields.map((field) => (
          <fieldset key={field.key}>
            <legend className="text-sm font-bold">{field.label}</legend>

            <ul className="mt-2 flex flex-wrap gap-2" role="list">
              {field.options.map((option) => {
                const isSelected = values[field.key] === option;
                return (
                  <li key={option}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      disabled={disabled}
                      onClick={() => onChange(field.key, option)}
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs transition",
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white"
                          : "border-neutral-300 bg-white hover:border-neutral-500",
                      ].join(" ")}
                    >
                      {option}
                    </button>
                  </li>
                );
              })}
            </ul>

            <input
              type="text"
              aria-label={`${field.label}（自分で書く）`}
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              disabled={disabled}
              onChange={(e) => onChange(field.key, e.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2
                         text-sm disabled:bg-neutral-100"
            />
          </fieldset>
        ))}
      </div>
    </div>
  );
}
