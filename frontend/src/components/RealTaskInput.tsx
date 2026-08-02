/**
 * 自分の実際の文章で試す（AIPPO 開発概要 §10 Step 7）。
 *
 * 用意されたサンプルだけで終わらせず、自分の文章で再実行させる。
 * ここが MVP の提供価値「自分の成果物を完成させる」に直結する。
 *
 * 空のときは実行させず、代わりに「用意された例文で試す」を出す。
 * 行き止まりを作らないため（憲章 原則 I）。
 */

import { ERRORS, LIMITS, SAFETY } from "../content/ui";

export type RealTaskInputProps = {
  value: string;
  onChange: (text: string) => void;
  onUseSample: () => void;
  disabled?: boolean;
};

export function RealTaskInput({
  value,
  onChange,
  onUseSample,
  disabled = false,
}: RealTaskInputProps) {
  const overLimit = value.length > LIMITS.maxUserInputLength;

  return (
    <div data-testid="real-task-input">
      <h2 className="text-base font-bold">
        次は、実際に使いたい文章で試してみましょう
      </h2>

      <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        {SAFETY.beforeInput}
      </p>

      <label htmlFor="real-task" className="mt-4 block text-sm font-bold">
        あなたの文章
      </label>
      <textarea
        id="real-task"
        value={value}
        disabled={disabled}
        rows={6}
        placeholder="ここに、実際に直したい文章を貼り付けてください。"
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-neutral-300 p-3 text-sm
                   leading-6 disabled:bg-neutral-100"
      />
      <p className="mt-1 text-right text-xs text-neutral-600">
        {value.length} / {LIMITS.maxUserInputLength}
      </p>
      {overLimit ? (
        <p className="text-xs text-red-700" role="alert">
          {ERRORS.tooLong(LIMITS.maxUserInputLength)}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onUseSample}
        disabled={disabled}
        className="mt-3 text-xs text-neutral-600 underline"
      >
        思いつかないので、用意された例文で試す
      </button>
    </div>
  );
}
