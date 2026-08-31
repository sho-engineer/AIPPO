/**
 * 設定でだけ使う操作部品。
 *
 * 共通の決まりは画面全体と同じ。
 * - 状態を色だけで表さない（形か文字も必ず変える）
 * - 押せる面は 44px 以上（指で押せる大きさ）
 * - 何が変わるのかを、操作の**すぐ隣**に書く
 */

import { useId, type ReactNode } from "react";

import { IconMark } from "../AppShell";
import { IconCheck, IconChevronRight, type Icon } from "../Icons";

// ------------------------------------------------------------------ 行

/**
 * 設定の一覧。
 *
 * カードにしない
 * --------------
 * 以前は行の束をひとつずつ `Card` に入れていた。白い面が影を落として
 * 下地に浮き、それが4つ5つと縦に並ぶ。手元のアプリの設定を思い出すと、
 * どれもそうなっていない——設定は「読むもの」ではなく「探すもの」で、
 * 浮いた面が増えるほど、目は面の輪郭を数えることに使われる。
 *
 * ここは面を1枚だけ、画面の端まで伸ばす（`-mx-5` で本文の余白から
 * はみ出し、行の中で同じだけ戻す）。影も角丸も付けない。
 * 白い帯が下地の上に**続いている**だけに見えるのが正しい。
 *
 * 見出しは、束の外の小さな字にする。束の中に入れると、見出しの行と
 * 項目の行が同じ面に並び、押せるものと押せないものの区別が消える。
 */
export function SettingsList({
  label,
  children,
  testId,
}: {
  /** 束の名前。1つしか束が無いときは省く。 */
  label?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="mt-7 first:mt-5">
      {label && (
        <h2 className="px-1 pb-2 text-xs font-bold text-ink-muted">{label}</h2>
      )}
      <ul
        role="list"
        data-testid={testId}
        className="-mx-5 border-y border-line bg-surface"
      >
        {children}
      </ul>
    </section>
  );
}

/**
 * 下位画面へ入る1行。
 *
 * 名前と「＞」だけ。説明は書かない
 * --------------------------------
 * 以前は1行ずつに説明を添えていた（「登録・ログイン・パスワード・退会」）。
 * 12行あれば12本の説明が並び、**設定を探しているだけの人に、24行を
 * 読ませる**ことになる。行の名前で分からないなら、直すべきは名前のほう。
 *
 * 印の色は揃える
 * --------------
 * 行ごとに色を変えていた（青・橙・翠・菫…）。並べると虹になり、
 * 色が意味を持っていないことが見ればすぐ分かってしまう。
 * ここでの絵は、目が行を拾い直すための足がかりでしかないので、
 * 全部同じ濃さの線画にする。
 */
export function SettingsRow({
  icon,
  title,
  onClick,
}: {
  icon: Icon;
  title: string;
  onClick: () => void;
}) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition
                   hover:bg-brand-soft/40 active:bg-brand-soft"
      >
        <IconMark icon={icon} tone="muted" className="h-5 w-5" />
        <span className="min-w-0 flex-1 text-sm font-bold">{title}</span>
        <IconChevronRight className="h-5 w-5 shrink-0 text-ink-muted/70" />
      </button>
    </li>
  );
}

/**
 * 設定の1かたまり。
 *
 * `SettingsList` と同じ見え方（画面の端まで伸びた白い帯）にする。
 * 一覧から1段潜っただけで浮いた角丸のカードが出てくると、
 * 同じ設定の中で別のアプリへ移ったように見える。
 *
 * 見出しと説明は帯の**外**の小さな字。中に入れると、読むだけの行と
 * 押せる行が同じ面に並び、どこを触ればよいのかが分かりにくくなる。
 */
export function SettingsGroup({
  title,
  description,
  children,
}: {
  /** かたまりの名前。画面の見出しが同じことを言っているなら省く。 */
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      {(title || description) && (
        <div className="px-1 pb-2">
          {title && <h3 className="text-xs font-bold text-ink-muted">{title}</h3>}
          {description && (
            <p className="mt-0.5 text-xs leading-6 text-ink-muted">{description}</p>
          )}
        </div>
      )}
      <div className="-mx-5 border-y border-line bg-surface px-5 py-4">
        {children}
      </div>
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
  disabled,
  note,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  /**
   * まだ中身が無いつまみ。
   *
   * 触れるのに何も起きないつまみは、無いより印象が悪い。
   * 消さずに残すのは、来る予定があると伝えるため（`SettingsRow` と同じ扱い）。
   */
  disabled?: boolean;
  /** 押せない理由。黙って無反応にしない。 */
  note?: string;
}) {
  const id = useId();

  return (
    <div
      className={`flex items-center justify-between gap-4 border-b border-line py-3.5
                  last:border-b-0 ${disabled ? "opacity-55" : ""}`}
    >
      <label
        htmlFor={id}
        className={`min-w-0 flex-1 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className="block text-sm font-bold">{label}</span>
        {/* 止めているときは、説明の代わりに理由を出す */}
        {(disabled ? note : description) && (
          <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
            {disabled ? note : description}
          </span>
        )}
      </label>

      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer h-7 w-12 cursor-pointer appearance-none rounded-full
                     bg-line transition-colors checked:bg-brand
                     disabled:cursor-not-allowed"
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
                              ? "bg-brand font-bold text-white shadow-raised"
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
                   [&::-webkit-slider-thumb]:shadow-raised
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
