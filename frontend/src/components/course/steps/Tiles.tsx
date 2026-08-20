/**
 * 大きめのタイルから1つ選ぶ画面。
 *
 * 条件を足すときと、自分の課題の始め方を選ぶとき。どちらも
 * 「並んだ札から1枚選ぶ」形なので、同じファイルに置く。
 * 文字だけの選択肢（Inputs の ChoiceStep）と違い、絵と説明を添えて
 * 大きく出す——選んだ先で何が起きるかが、押す前に読める。
 */

import { useEffect, useId, useState } from "react";

import { IconBadge } from "../../AppShell";
import {
  IconCheckCircle,
  IconDocument,
  IconPaste,
  IconPencil,
  IconSkip,
  IconSparkle,
} from "../../Icons";
import { isFreeValue } from "../../../course/engine";
import { optionIcon, optionTone } from "../../../course/presentation";
import type { LessonStep } from "../../../course/types";

// --------------------------------------------------------- 条件のタイル

/** 条件は2列のタイルで並べる。横に流すより一覧しやすい。 */
export function ChoiceTiles({
  step,
  value,
  onChange,
}: {
  step: LessonStep;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = step.options ?? [];
  const free = options.find((option) => option.free);
  const isFree = isFreeValue(step, value);
  const [showFree, setShowFree] = useState(isFree);
  const inputId = useId();

  useEffect(() => setShowFree(isFree), [isFree]);

  return (
    <div>
      {/*
        絵を添えて色を散らす。6つを同じ見た目で並べると、
        どれも同じに見えて選ぶ手が止まる。
        選んだことは、枠・地色・右のチェックの3つで示す（色だけにしない）。
      */}
      <ul
        /*
          2列。1列にすると6つで画面1枚ぶんの高さになり、
          「どれがあるか」を見るのにスクロールが要る。
        */
        className="grid grid-cols-2 gap-2.5"
        role="list"
        data-testid="choice-tiles"
      >
        {options.map((option) => {
          const active = option.free ? showFree : value === option.value;
          return (
            <li key={option.label}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (option.free) {
                    setShowFree(true);
                    onChange("");
                    return;
                  }
                  setShowFree(false);
                  onChange(option.value);
                }}
                className={`flex h-full min-h-[3.5rem] w-full items-center gap-2.5
                            rounded-card border px-3 py-3 text-sm transition
                            active:scale-[0.99]
                            ${
                              active
                                ? "border-brand bg-brand-soft/70 font-bold text-brand-dark"
                                : "border-line bg-surface shadow-card hover:border-brand-line"
                            }`}
              >
                <IconBadge
                  icon={optionIcon(option.icon) ?? IconSparkle}
                  tone={optionTone(option.icon)}
                  size="sm"
                />
                <span className="min-w-0 flex-1 text-left leading-6">{option.label}</span>
                {active && (
                  <IconCheckCircle className="h-5 w-5 shrink-0 text-brand" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {free && showFree && (
        <div className="mt-4">
          <label htmlFor={inputId} className="text-sm font-bold">
            自分で条件を書く
          </label>
          <input
            id={inputId}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="例）専門用語を使わないで"
            className="mt-2 w-full rounded-card border border-line px-4 py-3 text-base"
          />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------- 自分の課題の始め方

/** 4つのタイル。何から始めるかを選ばせる（要件 §9）。 */
export function StartChoiceTiles({
  onPick,
  onSkip,
}: {
  onPick: (value: string) => void;
  onSkip: () => void;
}) {
  // 絵は線画にそろえる。絵文字だと端末ごとに絵柄が変わり、
  // 4つ並べたときに大きさも色もばらつく（components/Icons.tsx）。
  const tiles = [
    { value: "自分で入力する", label: "自分で入力する", Icon: IconPencil },
    { value: "貼り付ける", label: "貼り付ける", Icon: IconPaste },
    { value: "別のサンプルを試す", label: "別のサンプルを試す", Icon: IconDocument },
  ];

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="list">
      {tiles.map((tile) => (
        <li key={tile.value}>
          <button
            type="button"
            onClick={() => onPick(tile.value)}
            className="flex min-h-[6rem] w-full flex-col items-center justify-center gap-2
                       rounded-card border border-line bg-surface px-3 py-4 text-xs
                       leading-5 transition hover:border-brand hover:bg-brand-soft"
          >
            <tile.Icon className="h-6 w-6 text-brand" />
            {tile.label}
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={onSkip}
          className="flex min-h-[6rem] w-full flex-col items-center justify-center gap-2
                     rounded-card border border-dashed border-line bg-canvas px-3 py-4
                     text-xs leading-5 text-ink-muted transition hover:border-brand-line"
        >
          <IconSkip className="h-6 w-6" />
          今回はスキップ
        </button>
      </li>
    </ul>
  );
}
