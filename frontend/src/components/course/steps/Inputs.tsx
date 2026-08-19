/**
 * 利用者が答えるところ。
 *
 * 選ぶ・書く・答え合わせをする——入力を受け取る3つをまとめてある。
 * 見せるだけの部品（結果や解説）とは別のファイルにする。直したい理由が
 * 違うので、混ぜると探す範囲が広くなる。
 *
 * 共通の決まり:
 * - 空欄から始めさせない（要件 §6.2）。選択肢か例文を先に出す
 * - 「その他」を選んだときだけ自由入力欄を出す（要件 §6.3）
 * - 文字数を出す。短すぎるときは、止めずに提案する（要件 §6.6）
 * - 色だけで状態を表さない（要件 §6.12）。文字と記号を必ず添える
 */

import { useEffect, useId, useRef, useState } from "react";

import { IconCheck } from "../../Icons";
import { isFreeValue } from "../../../course/engine";
import { optionIcon } from "../../../course/presentation";
import type { LessonStep, StepOption } from "../../../course/types";

// --------------------------------------------------------------- 選択肢

interface ChoiceProps {
  step: LessonStep;
  value: string;
  onChange: (value: string) => void;
  multiple?: boolean;
}

/**
 * 選択肢。
 *
 * 複数選ぶときは、値をカンマでつないだ1つの文字列にする。
 * 保存と復元を単純にしたいので、値はすべて文字列で持つと決めている。
 */
export function ChoiceStep({ step, value, onChange, multiple = false }: ChoiceProps) {
  const options = step.options ?? [];
  const selected = multiple ? value.split(",").filter(Boolean) : [value];
  const free = options.find((option) => option.free);
  const isFree = !multiple && isFreeValue(step, value);
  const [showFree, setShowFree] = useState(isFree);
  const freeInputId = useId();

  useEffect(() => setShowFree(isFree), [isFree]);

  const toggle = (option: StepOption) => {
    if (option.free) {
      setShowFree(true);
      onChange("");
      return;
    }
    setShowFree(false);
    if (!multiple) {
      onChange(option.value);
      return;
    }
    const next = selected.includes(option.value)
      ? selected.filter((entry) => entry !== option.value)
      : [...selected, option.value];
    onChange(next.join(","));
  };

  return (
    <div>
      <ul className="flex flex-wrap gap-2" role="list">
        {options.map((option) => {
          const active = option.free
            ? showFree
            : selected.includes(option.value);
          const Glyph = optionIcon(option.icon);
          return (
            <li key={option.label}>
              <button
                type="button"
                onClick={() => toggle(option)}
                aria-pressed={active}
                className={`chip flex min-h-[2.75rem] items-center gap-2 text-sm ${
                  active ? "chip-on" : "chip-off"
                }`}
              >
                {/* 選ばれていることを色だけで示さない */}
                {active && <IconCheck className="h-3.5 w-3.5 shrink-0" />}
                {Glyph && !active && <Glyph className="h-4 w-4 shrink-0 text-brand" />}
                {option.label}
              </button>
            </li>
          );
        })}
      </ul>

      {free && showFree && (
        <div className="mt-4">
          <label htmlFor={freeInputId} className="text-sm font-bold">
            {step.title}（自分で書く）
          </label>
          <input
            id={freeInputId}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={step.placeholder ?? "例）取引先の担当者"}
            className="mt-2 w-full rounded-card border border-line px-4 py-3 text-base"
          />
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------- 文章入力

interface TextProps {
  step: LessonStep;
  value: string;
  onChange: (value: string) => void;
  /** 用途の選択で選ばれた例文。「例文を使う」で入る。 */
  sampleText?: string;
  onHint?: () => void;
  hintsLeft?: number;
}

export function TextStep({
  step,
  value,
  onChange,
  sampleText,
  onHint,
  hintsLeft = 0,
}: TextProps) {
  const inputId = useId();
  const max = step.validationRules?.maxLength ?? 5000;
  const textarea = useRef<HTMLTextAreaElement>(null);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text.slice(0, max));
    } catch {
      // 権限が無い環境もある。使えないだけで、手で貼れば済む
      textarea.current?.focus();
    }
  };

  return (
    <div>
      {/* 空の入力欄だけを出さない（要件 §6.2） */}
      <div className="flex flex-wrap gap-2">
        {sampleText && (
          <button
            type="button"
            onClick={() => onChange(sampleText)}
            className="chip chip-off min-h-[2.75rem] text-sm"
          >
            用意された例文を使う
          </button>
        )}
        <button
          type="button"
          onClick={paste}
          className="chip chip-off min-h-[2.75rem] text-sm"
        >
          貼り付ける
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="chip chip-off min-h-[2.75rem] text-sm"
          >
            消して自分で書く
          </button>
        )}
      </div>

      <label htmlFor={inputId} className="mt-4 block text-sm font-bold">
        {step.title}
      </label>
      <textarea
        id={inputId}
        ref={textarea}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, max))}
        placeholder={step.placeholder}
        rows={6}
        className="mt-2 w-full rounded-card border border-line px-4 py-3 text-base leading-7"
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          {value.length} / {max} 文字
        </p>
        {onHint && hintsLeft > 0 && (
          <button
            type="button"
            onClick={onHint}
            className="text-xs text-brand-dark underline transition hover:text-brand"
          >
            ヒントを見る
          </button>
        )}
      </div>

      {step.example && (
        <p className="mt-3 rounded-card bg-brand-soft px-4 py-3 text-xs leading-6">
          <span className="font-bold">例）</span>
          {step.example}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------- 固定問題

interface QuizProps {
  step: LessonStep;
  value: string;
  onChange: (value: string) => void;
  /** 答え合わせを出すか。 */
  revealed: boolean;
}

/**
 * AI を使わない確認問題（Lesson 7）。
 *
 * 間違いを責めない。選び直せるようにして、理由を必ず添える。
 */
export function QuizStep({ step, value, onChange, revealed }: QuizProps) {
  const meta = (step.meta ?? {}) as { answer?: string[]; explanation?: string };
  const multiple = step.type === "multi_choice";

  return (
    <div>
      <ChoiceStep step={step} value={value} onChange={onChange} multiple={multiple} />

      {revealed && meta.explanation && (
        <div
          data-testid="quiz-explanation"
          className="mt-5 rounded-card bg-brand-soft px-4 py-3 text-sm leading-7"
        >
          <p className="font-bold text-brand-dark">こたえ</p>
          <p className="mt-1">{meta.explanation}</p>
        </div>
      )}
    </div>
  );
}
