/**
 * 並んだものから1つ選ぶ画面。
 *
 * 条件を足すときと、自分の課題の始め方を選ぶとき。どちらも
 * 「並んだものから1つ選ぶ」形なので、同じファイルに置く。
 *
 * どちらも、以前は2列のカードだった。淡色の器つきの絵を載せ、白い面に
 * 影を落として、高さを揃えて——**選択肢が、今日の1本と同じ重さの
 * 部品として並ぶ**ことになっていた。ここで人がすることは
 * 「読んで、1つ押す」だけなので、字が読めて押せれば足りる。
 */

import { useEffect, useId, useState } from "react";

import {
  IconCheckCircle,
  IconChevronRight,
  IconDocument,
  IconPaste,
  IconPencil,
  IconSkip,
} from "../../Icons";
import { isFreeValue } from "../../../course/engine";
import type { LessonStep } from "../../../course/types";

// --------------------------------------------------------- 条件のタイル

/**
 * 条件を1つ選ぶ。
 *
 * 札（chip）で並べる
 * ------------------
 * 札にすると、字の長さのぶんだけ幅を取り、6つで2〜3行に収まる。
 * 絵も外した——6つに6色の器を配ると、色のほうが先に目に入る。
 *
 * 選んだことは、枠・地色・左のチェックの3つで示す（色だけにしない）。
 * チェックの場所は選ぶ前から確保する。以前は選択時にしか描画して
 * おらず、選ぶたびに隣の文字の実効幅が縮んで折り返しが動いていた
 * （`aippo/ChoiceButton.tsx` と同じ不具合）。
 *
 * 「自分で書く」は、札の中に混ぜない
 * ----------------------------------
 * 用意した条件と同じ列に並べると、6つのうち1つだけ**押した先が
 * 違うもの**が混ざる。押すと入力欄が開くので、選んだつもりの人は
 * そこで止まる。並びの外に、小さな二次操作として置く。
 */
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
  const ready = options.filter((option) => !option.free);
  const isFree = isFreeValue(step, value);
  const [showFree, setShowFree] = useState(isFree);
  /*
    いま押されたばかりの札。跳ねる動きを、押した1枚にだけ返すため。

    「選ばれている札」（value）ではなく「押した札」を覚える。
    画面に戻ってきたときや、下書きから復元したときに、選択済みの札が
    ひとりでに跳ねると、触ってもいないのに何かが起きたように見える。
  */
  const [popped, setPopped] = useState<string | null>(null);
  const inputId = useId();

  useEffect(() => setShowFree(isFree), [isFree]);

  return (
    <div>
      <ul className="flex flex-wrap gap-2" role="list" data-testid="choice-tiles">
        {ready.map((option) => {
          const active = !showFree && value === option.value;
          return (
            <li key={option.label}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setShowFree(false);
                  setPopped(option.value);
                  onChange(option.value);
                }}
                /* 指で押せる高さ（44px）は、札でも下回らない */
                className={`choice-tap flex min-h-[2.75rem] items-center gap-1.5
                            rounded-badge border px-3.5 py-2 text-sm leading-6
                            transition
                            ${popped === option.value ? "animate-choice-pop" : ""}
                            ${
                              active
                                ? "border-brand bg-brand-soft/70 font-bold text-brand-dark"
                                : "border-line bg-surface hover:border-brand-line"
                            }`}
              >
                <IconCheckCircle
                  className={`h-4 w-4 shrink-0 text-brand transition-opacity
                              ${active ? "opacity-100" : "opacity-0"}`}
                />
                {option.label}
              </button>
            </li>
          );
        })}
      </ul>

      {free && !showFree && (
        <button
          type="button"
          aria-pressed={false}
          data-testid="choice-free"
          onClick={() => {
            setShowFree(true);
            onChange("");
          }}
          /* 当たり判定を広げる（py と -my を同じだけ。見た目は変わらない） */
          className="-my-1 mt-3 py-1 text-xs font-bold text-brand-dark underline
                     transition hover:text-brand"
        >
          {free.label}
        </button>
      )}

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
          {/* 戻る道を必ず置く。開いたら最後、では行き止まりになる */}
          <button
            type="button"
            onClick={() => {
              setShowFree(false);
              onChange("");
            }}
            className="-my-1 mt-3 py-1 text-xs font-bold text-brand-dark underline
                       transition hover:text-brand"
          >
            用意された条件から選ぶ
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------- 自分の課題の始め方

/**
 * 何から始めるかを選ばせる（要件 §9）。
 *
 * 縦に並べる。前は2列×2段の 96px 角のカードで、4枚で画面の
 * 半分ほどを占めていた。**3つの入り方と1つの見送り**という中身は
 * 一列に並ぶもので、格子に置く理由が無い。
 *
 * 「今回はスキップ」は同じ列に置かない。他の3つは「やる」の話で、
 * これだけが「やらない」の話。同じ形で4枚目に並べると、4択のうちの
 * 1つとして目に入る。
 */
export function StartChoiceTiles({
  onPick,
  onSkip,
}: {
  onPick: (value: string) => void;
  onSkip: () => void;
}) {
  // 絵は線画にそろえる。絵文字だと端末ごとに絵柄が変わり、
  // 並べたときに大きさも色もばらつく（components/Icons.tsx）。
  const tiles = [
    { value: "自分で入力する", label: "自分で入力する", Icon: IconPencil },
    { value: "貼り付ける", label: "貼り付ける", Icon: IconPaste },
    { value: "別のサンプルを試す", label: "別のサンプルを試す", Icon: IconDocument },
  ];

  return (
    <div>
      <ul role="list">
        {tiles.map((tile) => (
          <li key={tile.value} className="border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => onPick(tile.value)}
              className="row-tap flex w-full items-center gap-3 py-3.5 text-left
                         text-sm transition hover:bg-brand-soft/40"
            >
              <tile.Icon className="h-5 w-5 shrink-0 text-brand" />
              <span className="min-w-0 flex-1">{tile.label}</span>
              <IconChevronRight className="h-5 w-5 shrink-0 text-ink-muted" />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSkip}
        /* 当たり判定を広げる（py と -my を同じだけ。見た目は変わらない） */
        className="-my-1 mt-3 flex items-center gap-1.5 py-1 text-xs text-ink-muted
                   underline transition hover:text-ink"
      >
        <IconSkip className="h-4 w-4 shrink-0" />
        今回はスキップ
      </button>
    </div>
  );
}
