/**
 * 設定でだけ使う操作部品。
 *
 * 共通の決まりは画面全体と同じ。
 * - 状態を色だけで表さない（形か文字も必ず変える）
 * - 押せる面は 44px 以上（指で押せる大きさ）
 * - 何が変わるのかを、操作の**すぐ隣**に書く
 */

import { useId, type ReactNode } from "react";

import { IconBadge } from "../AppShell";
import { IconCheck, IconChevronRight, type Icon } from "../Icons";

// ------------------------------------------------------------------ 行

/**
 * 下位画面へ入る1行。
 *
 * 絵・見出し・説明・「＞」の4つを、この順で必ず並べる。
 * 支給デザインどおり、行は独立したカードにせず、1枚の面を線で区切る。
 * カードを積むと、行と行のあいだの余白のほうが目立ってしまう。
 */
export function SettingsRow({
  icon,
  tone,
  title,
  description,
  onClick,
  disabled,
  note,
}: {
  icon: Icon;
  tone?: Parameters<typeof IconBadge>[0]["tone"];
  title: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
  /** 押せない理由。黙って無反応にしない。 */
  note?: string;
}) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition
                   enabled:hover:bg-brand-soft/50 enabled:active:bg-brand-soft
                   disabled:cursor-not-allowed disabled:opacity-55"
      >
        <IconBadge icon={icon} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{title}</span>
          <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
            {disabled && note ? note : description}
          </span>
        </span>
        {!disabled && (
          <IconChevronRight className="h-5 w-5 shrink-0 text-ink-muted" />
        )}
      </button>
    </li>
  );
}

/** 設定の1かたまり。見出し＋説明＋中身。 */
export function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line px-4 py-5 last:border-b-0">
      <h3 className="text-sm font-bold">{title}</h3>
      {description && (
        <p className="mt-0.5 text-xs leading-6 text-ink-muted">{description}</p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------ トグル

/**
 * 入り切りのつまみ。
 *
 * 見た目のつまみは飾りで、実体はチェックボックス。
 * div で作り直すと、キーボードでも読み上げでも操作できなくなる。
 * 入っているかどうかは、位置と色に加えて読み上げにも出る。
 */
export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();

  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-b-0">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-sm font-bold">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
            {description}
          </span>
        )}
      </label>

      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer h-7 w-12 cursor-pointer appearance-none rounded-full
                     bg-line transition-colors checked:bg-brand-grad"
        />
        {/*
          つまみ。入力そのものは動かさず、上に重ねた丸を寄せる。
          transition を入れて、切り替わりが目で追えるようにする
          （一瞬で飛ぶと、押せたのかどうかが分からない）。
        */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full
                     bg-surface shadow-card transition-transform duration-200
                     peer-checked:translate-x-5"
        />
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ 区分

/**
 * いくつかから1つ選ぶ帯。
 *
 * ラジオボタンの集まりとして組む。ボタンの並びで作ると、
 * 「この中から1つ」であることが読み上げに伝わらない。
 */
export function SegmentedChoice<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  const name = useId();

  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <label
              key={option.value}
              className={`flex min-h-[2.75rem] cursor-pointer items-center gap-2
                          rounded-card px-4 py-2 text-sm transition
                          ${
                            active
                              ? "bg-brand-grad font-bold text-white shadow-pop"
                              : "bg-surface shadow-card hover:bg-brand-soft/60"
                          }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {/* 選ばれていることを色だけで示さない */}
              {active && <IconCheck className="h-4 w-4 shrink-0" />}
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------- スライダー

/**
 * 3段の目盛り。
 *
 * 自由に動くスライダーにはしない。
 * 「短め〜長め」に細かい刻みを与えても、選んだ値の意味が説明できない。
 * 3つに区切れば、それぞれが AI へ渡す言葉と1対1で対応する。
 */
export function StepSlider<T extends string>({
  label,
  labelHidden = false,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  /**
   * 見出しを目に見せないか。
   *
   * かたまりの見出し（SettingsGroup）が同じことを言っているときに使う。
   * 消すのではなく隠すだけにする。読み上げでは、どの操作なのかを
   * 言う手がかりが他に無い。
   */
  labelHidden?: boolean;
  description?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  const id = useId();
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div>
      <label
        htmlFor={id}
        className={labelHidden ? "sr-only" : "block text-sm font-bold"}
      >
        {label}
      </label>
      {description && (
        <p className="text-xs leading-6 text-ink-muted">{description}</p>
      )}

      <input
        id={id}
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={index}
        aria-valuetext={options[index]?.label}
        onChange={(event) => onChange(options[Number(event.target.value)].value)}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full
                   bg-brand-soft accent-brand
                   [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-brand
                   [&::-webkit-slider-thumb]:shadow-pop
                   [&::-webkit-slider-thumb]:transition-transform
                   [&::-webkit-slider-thumb]:active:scale-110"
      />

      {/* 目盛りの名前。いま選んでいるものだけ濃くする */}
      <div className="mt-2 flex justify-between">
        {options.map((option) => (
          <span
            key={option.value}
            className={`text-xs ${
              option.value === value ? "font-bold text-brand-dark" : "text-ink-muted"
            }`}
          >
            {option.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 選択欄

/** 一覧から1つ選ぶ。項目が多くて帯に収まらないときに使う。 */
export function SelectField({
  label,
  labelHidden = false,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  /** かたまりの見出しが同じことを言っているときは隠す（読み上げには残す）。 */
  labelHidden?: boolean;
  description?: string;
  value: string;
  options: { value: string; label: string; note?: string }[];
  onChange: (next: string) => void;
}) {
  const id = useId();
  const selected = options.find((option) => option.value === value);

  return (
    <div>
      <label
        htmlFor={id}
        className={labelHidden ? "sr-only" : "block text-sm font-bold"}
      >
        {label}
      </label>
      {description && (
        <p className="text-xs leading-6 text-ink-muted">{description}</p>
      )}

      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[3rem] w-full rounded-card bg-surface px-4 py-3 text-sm
                   shadow-card transition hover:bg-brand-soft/50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {/* 選んだものの手がかりは、選択欄の外に出す（option の中では読まれない） */}
      {selected?.note && (
        <p className="mt-2 text-xs leading-6 text-ink-muted" role="status">
          {selected.note}
        </p>
      )}
    </div>
  );
}
