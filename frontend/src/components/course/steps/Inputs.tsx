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

import {
  IconBook,
  IconCheck,
  IconPaste,
  IconPencil,
  IconRefresh,
  type Icon,
} from "../../Icons";
import { ChoiceButton } from "../../aippo/ChoiceButton";
import { CopyButton } from "./Completion";
import { isFreeValue } from "../../../course/engine";
import { diagnosisIcon, optionIcon } from "../../../course/presentation";
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

  /*
    並べ方は、選択肢の**言葉の長さ**で決める。

    「自分／上司／取引先」のように短いものは、横に流す札（chip）が読みやすい。
    「長い文章を読むことが多い」のように文なら、横に流すと1つずつ折り返して
    列がガタガタになるので、2列のタイルにして高さをそろえる。

    ステップの種類で分けないのは、同じ single_choice でも中身が
    どちらにもなるため。教材を足すたびに分岐を書き足したくない。
  */
  const longest = Math.max(0, ...options.map((option) => option.label.length));
  /*
    ひとこと補足（`note`）を持つ選択肢は、短い言葉でもタイルにする。

    「文章」「要約」だけを札で並べると、何をしてくれるのかが分から
    ないまま選ぶことになる。補足を添えるなら2行ぶんの高さが要るので、
    横に流す札ではなく高さのそろうタイルへ。
  */
  const noted = options.some((option) => option.note);
  const tiles = longest > 8 || noted;

  /*
    2列にすると1枚が 375px の画面で 170px 前後になり、余白を引くと
    文字に残るのは9字ぶん。「まだ使ったことがない」（10字）はそれで
    2行に折り返していた（`e2e/choiceLayoutShift.spec.ts` が捕まえた）。
    絵が無いなら2列にする理由も無いので、下の `rows` で1列にする。
  */
  const withIcons = options.some(
    (option) => optionIcon(option.icon) ?? diagnosisIcon(option.value),
  );

  /*
    絵の無い選択肢は、**カードではなく行**にする。

    前はここも `ChoiceButton`（角丸14px・影・52〜104pxの高さ）で、
    それが縦に5つ並ぶと画面の大半が白い箱で埋まった。学習アプリでは
    なく、管理画面か「AIが自動生成したUI」に見える——実際そう指摘された。

    見た目を落とすだけではない。5つで 52px + 影 + 余白だと 300px を
    超え、診断の Q1・Q2 が1画面に収まらない。行にすると 44px 前後まで
    落ちて、質問と選択肢と「次へ」が同時に見える。

    行にするのは絵が無いときだけ。絵を横に置く札（Day1 の条件タイル）は
    絵が意味を持っているので、そのまま残す。
  */
  /*
    絵があっても、**ひとこと補足を持つ選択肢は1列**にする。

    2列だと1枚が 390px の画面で 170px 前後。そこへ「むずかしい言葉を、
    やさしい言葉に言いかえる」を入れると5行に折り返し、札の高さが
    札ごとに変わって列がガタガタになる（Day1 の1問目で実際にそうなった）。
    補足は読ませるために置いているので、読める幅を先に取る。
  */
  const rows = tiles && (!withIcons || noted);

  return (
    <div>
      <ul
        className={
          tiles
            ? rows
              ? "flex flex-col gap-1.5"
              : "grid grid-cols-2 gap-2.5"
            : "flex flex-wrap gap-2"
        }
        role="list"
        data-layout={tiles ? (rows ? "rows" : "tiles") : "chips"}
      >
        {options.map((option) => {
          const active = option.free
            ? showFree
            : selected.includes(option.value);
          const Glyph = optionIcon(option.icon) ?? diagnosisIcon(option.value);

          if (rows) {
            return (
              <li key={option.label}>
                <button
                  type="button"
                  onClick={() => toggle(option)}
                  aria-pressed={active}
                  /*
                    影も濃い枠も付けない。選んだことは
                    **地の色・印・字の太さ**の3つで示す（色だけに
                    頼らない）。角丸は `badge`（8px）まで落として、
                    カードではなく行に見せる。
                  */
                  className={`flex min-h-[2.75rem] w-full items-center gap-2.5
                              rounded-badge border px-3 py-2 text-left transition
                              ${
                                active
                                  ? "border-brand bg-brand-soft"
                                  : "border-line bg-surface hover:border-brand-line"
                              }`}
                >
                  {/*
                    左の丸。**選ぶ前から同じ大きさで置いておく。**
                    現れる形にすると、選んだ瞬間に文字が右へ動く。
                  */}
                  <span
                    aria-hidden="true"
                    className={`flex h-[1.125rem] w-[1.125rem] shrink-0 items-center
                                justify-center rounded-full border transition
                                ${
                                  active
                                    ? "border-brand bg-brand text-white"
                                    : "border-brand-line bg-surface"
                                }`}
                  >
                    {active && <IconCheck className="h-2.5 w-2.5" />}
                  </span>

                  {/*
                    絵は丸のあと、文字の前。**丸と入れ替えない**——
                    丸は「選べる／選んだ」を、絵は「どれのことか」を
                    言っていて、役が違う。
                  */}
                  {Glyph && (
                    <span
                      aria-hidden="true"
                      className={`flex h-8 w-8 shrink-0 items-center justify-center
                                  rounded-card transition ${
                                    active
                                      ? "bg-brand text-white"
                                      : "bg-brand-soft text-brand"
                                  }`}
                    >
                      <Glyph className="h-[1.125rem] w-[1.125rem]" />
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm leading-6 ${
                        active ? "font-bold text-brand-dark" : ""
                      }`}
                    >
                      {option.label}
                    </span>
                    {/*
                      ひとこと補足。名前だけでは「かみくだいて説明する」と
                      「要点から先に伝える」の違いが読み取れない。
                    */}
                    {option.note && (
                      <span className="mt-0.5 block text-xs leading-5 text-ink-muted">
                        {option.note}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          }

          if (tiles) {
            return (
              /*
                最後の1つが余ったときは、2列ぶんに広げる。
                半分だけの札が下にぽつんと残ると、列が崩れて見える。
              */
              <li
                key={option.label}
                className={
                  options.length % 2 === 1 &&
                  option === options[options.length - 1]
                    ? "col-span-2"
                    : ""
                }
              >
                <ChoiceButton
                  label={option.label}
                  /*
                    ひとことの補足。**選ぶ前に中身が分かるように。**

                    「調べもの」「整理」だけでは、何をしてくれるのかが
                    分からないまま選ぶことになる。教材データが
                    `note` を持っているときだけ添える。
                  */
                  description={option.note}
                  selected={active}
                  onSelect={() => toggle(option)}
                  tall
                  /*
                    説明が付く札は、印を浮かせて余白を詰める。

                    既定の作りは印のために 20px＋12px を**流れの中に**
                    空ける。2列だと1枠 175px しかなく、そこから絵と
                    余白を引くと文字に残るのは 75px——「情報や予定を
                    まとめる」がどれも2行に折れて、札1つが 98px に
                    なっていた（実測）。7つ並べて 71px はみ出す。
                  */
                  compact={Boolean(option.note)}
                  icon={
                    Glyph ? (
                      <span
                        aria-hidden="true"
                        className={`flex h-8 w-8 items-center justify-center rounded-badge
                                    ${active ? "bg-brand text-white" : "bg-brand-soft text-brand"}`}
                      >
                        <Glyph className="h-4 w-4" />
                      </span>
                    ) : undefined
                  }
                />
              </li>
            );
          }

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
                {/*
                  選ばれていることを色だけで示さない。印を差し替える。

                  **大きさは選ぶ前後で同じにする。** 以前はチェックが
                  14px、用途の絵が 16px で、選ぶたびに 2px ぶん
                  文字が左へ動いていた（実測 59 → 57）。P0-6 の
                  「印が現れて文字が動く」と同じ種類で、こちらは
                  現れるのではなく**差し替わる**ぶん気づきにくい。
                */}
                {active && <IconCheck className="h-4 w-4 shrink-0" />}
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

/**
 * 文章の入れ方を1つ選ぶ札。
 *
 * 見た目は上の見出し（タブ）に寄せる。押すたびに画面が切り替わるのではなく、
 * その場で入力欄が埋まるだけなので、`tab` の役は持たせない
 * （役を付けると、読み上げが「別の面に切り替わる」と案内してしまう）。
 */
function InputMode({
  icon: Glyph,
  label,
  active,
  onClick,
}: {
  icon: Icon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5
                  whitespace-nowrap rounded-badge px-2.5 py-2 text-xs font-bold
                  transition
                  ${
                    active
                      ? "bg-brand-soft text-brand-dark"
                      : "text-ink-muted hover:bg-brand-soft/50"
                  }`}
    >
      <Glyph className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

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
    /*
      縦の flex。入力欄にだけ「残りの高さ」を渡す。
      入れ方の帯・見出し・文字数・ヒントは自分の高さのまま動かない。
    */
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        文章の入れ方。空の入力欄だけを出さない（要件 §6.2）。

        横一列の見出しの形にする。札を散らして並べるより、
        「入れ方が3つあって、いまはこれ」が一目で分かる。
        いま選んでいるものは、下線と色の両方で示す（色だけにしない）。
      */}
      <div
        className="flex shrink-0 items-stretch gap-1 overflow-x-auto rounded-card border
                   border-line bg-surface p-1 shadow-card"
        role="group"
        aria-label="文章の入れ方"
      >
        <InputMode
          icon={IconPencil}
          label="自分で入力する"
          active={value.length > 0 && value !== sampleText}
          onClick={() => textarea.current?.focus()}
        />
        <InputMode icon={IconPaste} label="貼り付ける" active={false} onClick={paste} />
        {sampleText && (
          <InputMode
            icon={IconBook}
            label="例文を使う"
            active={value === sampleText}
            onClick={() => onChange(sampleText)}
          />
        )}
        {value && (
          <InputMode
            icon={IconRefresh}
            label="消す"
            active={false}
            onClick={() => onChange("")}
          />
        )}
      </div>

      <label htmlFor={inputId} className="mt-3 block shrink-0 text-sm font-bold">
        {step.title}
      </label>
      {/*
        入力欄は面として置く。地を白にし、囲みを1本引く。
        下地（薄い青みの灰）の上では、枠だけだと「書ける場所」に見えない。
      */}
      <textarea
        id={inputId}
        ref={textarea}
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, max))}
        placeholder={step.placeholder}
        /*
          高さは**残りぶん**。行数で決めない。

          `rows={6}`（194px）を置くと、狭い端末では下の文字数表示と
          安全の一言が画面から出る。残りに合わせて縮めば、書く場所と
          「次へ」がいつも同時に見える（要件 §6.11）。狭すぎても
          困るので、下限だけ決めておく。

          下限は 3.5rem（2行ぶん）。4.5rem だと、iPhone の Safari
          （上下の帯が出ている高さ）でこの欄の下限そのものが画面を
          押し出していた。広い画面では `flex-1` で伸びるので、
          下限を下げても普段の見え方は変わらない。
        */
        rows={3}
        className="mt-2 min-h-[3.5rem] w-full flex-1 resize-none rounded-card border
                   border-line bg-surface px-4 py-3 text-base leading-7 shadow-card
                   outline-none transition focus:border-brand
                   focus:ring-2 focus:ring-brand-soft"
      />

      <div className="mt-2 flex shrink-0 items-center justify-between gap-3">
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

// ------------------------------------------------- AIにはこう伝えます

/**
 * 選んだ札から組み立てた、AIへのお願い1文。
 *
 * なぜ画面に出すか
 * ----------------
 * Day1 で最初に受け取る技は「プロンプト」で、その中身は
 * **さっき自分が送ったお願いそのもの**（`catalog.ts` の `concept_1`）。
 * 送ったあとに「あれがプロンプトです」と言われても、何を指しているのか
 * 思い出せない。送る前にその文が画面にあって、**札を押すたびに書き換わる**
 * ところを見ていれば、あとで名前を聞いたときにつながる。
 *
 * 文の作り方
 * ----------
 * 札の言葉に「ように書き直してください。」を足すだけにする。教材ごとに
 * 別の言い回しの表を持たない——表を持つと、札を1つ足すたびに表も直す
 * ことになり、直し忘れた札だけ英字の値が画面に出る。
 *
 * 「〜ように」で受けられる形の札にしておくのは教材側の責任
 * （「専門用語を減らす」「要点から先に伝える」——どれも動詞で終わる）。
 */
export function AskPreview({
  instruction,
  placeholder,
}: {
  instruction: string;
  placeholder: string;
}) {
  const text = instruction ? `${instruction}ように書き直してください。` : "";

  return (
    <div data-testid="ask-preview">
      {/* 名札と中身の面だけ。囲いを二重にしない（条件の画面と同じ） */}
      <p className="text-xs font-bold text-ink-muted">AIにはこう伝えます</p>

      {/*
        低い持ち方（402×660）では、上下を一段詰める。**コピーの行が
        増えるぶん**、選んだ瞬間に 19px はみ出していた。減らす先は
        余白にする——札と下のボタンは、この画面の用そのもの。
      */}
      <div
        className="mt-2 rounded-card border border-dashed border-brand-line px-3.5 py-2
                   [@media(min-height:700px)]:py-3"
      >
        {text ? (
          <p
            data-testid="ask-preview-text"
            className="text-sm leading-6"
            /* 書き換わったことを読み上げへ届ける */
            aria-live="polite"
          >
            「{text}」
          </p>
        ) : (
          /*
            まだ選んでいないときも、枠は出しておく。

            選んだ瞬間に枠ごと生えてくると、下のボタンが動いて押し
            そこねる。中身だけを差し替えて、高さは変えない。
          */
          <p className="text-sm leading-6 text-ink-muted">{placeholder}</p>
        )}

        {text && (
          <div className="mt-1 flex justify-end [@media(min-height:700px)]:mt-1.5">
            <CopyButton text={text} />
          </div>
        )}
      </div>
    </div>
  );
}
