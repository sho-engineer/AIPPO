/**
 * ステップの種類ごとの見た目。
 *
 * ここは表示だけを受け持つ。進行も保存も `useCourseLesson` の仕事。
 *
 * 共通の決まり:
 * - 空欄から始めさせない（要件 §6.2）。選択肢か例文を先に出す
 * - 「その他」を選んだときだけ自由入力欄を出す（要件 §6.3）
 * - 文字数を出す。短すぎるときは、止めずに提案する（要件 §6.6）
 * - 色だけで状態を表さない（要件 §6.12）。文字と記号を必ず添える
 */

import { Fragment, useEffect, useId, useRef, useState } from "react";

import { Card, CardHeading, IconBadge, MetaPill } from "../AppShell";
import { SaveProgressCard } from "../auth/SaveProgressCard";
import { SurveyCard } from "./SurveyCard";
import {
  IconArrowDown,
  IconBars,
  IconCaution,
  IconCheck,
  IconCheckCircle,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconDocument,
  IconPaste,
  IconPencil,
  IconMedal,
  IconPlay,
  IconSkip,
  IconSparkle,
  IconStar,
  IconTarget,
} from "../Icons";
import { diffSentences, isMostlyUnchanged } from "../../lib/diff";
import { isFreeValue } from "../../course/engine";
import { optionIcon, optionTone } from "../../course/presentation";
import type { ConceptCard, LessonStep, StepOption } from "../../course/types";
import type { RunRecord } from "../../course/useCourseLesson";

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

// ------------------------------------------------------- 依頼内容の確認

interface PreviewProps {
  /** かんたん表示に出すカード。 */
  cards: { label: string; value: string }[];
  /** 詳細表示に出す、実際に送る文章。 */
  detail: string;
  onOpenDetail?: () => void;
}

/**
 * AI にどう伝わるかを、送る前に見せる（要件 §6.5）。
 *
 * 初心者に文面そのものを編集させない。
 * 編集を必須にすると、そこで手が止まる。
 * 直したい人だけが「詳細表示」を開けばよい。
 */
export function PromptPreview({ cards, detail, onOpenDetail }: PreviewProps) {
  return (
    <div>
      <Card>
        <CardHeading icon={IconSparkle} tone="plain">
          AIにはこう伝えます
        </CardHeading>

        {/*
          項目名と中身を左右に並べる。
          カードを縦に積むより、何を何に決めたのかが一覧で追える。
        */}
        <dl
          className="mt-4 divide-y divide-line rounded-card bg-canvas px-4"
          data-testid="prompt-cards"
        >
          {cards.map((card) => (
            <div key={card.label} className="flex gap-4 py-3">
              <dt className="w-20 shrink-0 text-xs text-ink-muted">{card.label}</dt>
              <dd className="min-w-0 flex-1 break-words text-sm font-bold">
                {card.value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <details
        className="mt-4 rounded-card bg-surface px-4 py-3 shadow-card"
        onToggle={(event) => {
          if ((event.currentTarget as HTMLDetailsElement).open) onOpenDetail?.();
        }}
      >
        <summary className="cursor-pointer text-xs font-bold text-ink-muted">
          くわしく見る（実際に送る文章）
        </summary>
        <pre
          data-testid="prompt-detail"
          className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-ink-muted"
        >
          {detail}
        </pre>
      </details>
    </div>
  );
}

// --------------------------------------------------------------- 結果

interface ResultProps {
  before: string;
  after: string;
  reviewPoints: string[];
  factCheck?: boolean;
}

/**
 * 元と結果を見比べる（要件 §6.9）。
 *
 * 広い画面では左右に並べ、狭い画面ではタブで切り替える。
 * 狭い画面で2つ並べると、どちらも読めない幅になる。
 */
export function ResultCompare({
  before,
  after,
  reviewPoints,
  factCheck = false,
}: ResultProps) {
  const [tab, setTab] = useState<"before" | "after">("after");
  const parts = diffSentences(before, after);
  const showDiff = before.trim().length > 0 && !isMostlyUnchanged(parts);

  const panel = (title: string, body: string, testId: string) => (
    <section className="rounded-card border border-line bg-surface p-4">
      <h3 className="text-xs font-bold text-ink-muted">{title}</h3>
      <p
        data-testid={testId}
        className="mt-2 whitespace-pre-wrap break-words text-sm leading-7"
      >
        {body}
      </p>
    </section>
  );

  return (
    <div data-testid="result-compare">
      {/* 狭い画面：タブ */}
      <div className="sm:hidden">
        <div role="tablist" className="flex gap-2">
          {(["before", "after"] as const).map((name) => (
            <button
              key={name}
              role="tab"
              type="button"
              aria-selected={tab === name}
              onClick={() => setTab(name)}
              className={`chip flex-1 text-sm ${
                tab === name ? "chip-on" : "chip-off"
              }`}
            >
              {name === "before" ? "元の文章" : "AIの結果"}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {tab === "before"
            ? panel("元の文章", before || "（入力なし）", "result-before-mobile")
            : panel("AIの結果", after, "result-after-mobile")}
        </div>
      </div>

      {/* 広い画面：並べる */}
      <div className="hidden gap-4 sm:grid sm:grid-cols-2">
        {panel("元の文章", before || "（入力なし）", "result-before")}
        {panel("AIの結果", after, "result-after")}
      </div>

      {showDiff && (
        <details className="mt-4 rounded-card border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-xs font-bold text-ink-muted">
            変わったところを見る
          </summary>
          <p className="mt-3 text-sm leading-7">
            {parts.map((part, index) => {
              if (part.kind === "same") {
                return <span key={index}>{part.text}</span>;
              }
              // 色だけで表さない。記号を必ず添える
              const isAdded = part.kind === "added";
              return (
                <span
                  key={index}
                  className={
                    isAdded
                      ? "rounded bg-brand-soft px-1 font-bold text-brand-dark"
                      : "rounded bg-caution-soft px-1 text-caution line-through"
                  }
                >
                  {isAdded ? "＋" : "−"}
                  {part.text}
                </span>
              );
            })}
          </p>
        </details>
      )}

      <section className="mt-5 rounded-card bg-brand-soft px-4 py-3">
        <h3 className="text-xs font-bold text-brand-dark">ここを見てみましょう</h3>
        <ul className="mt-2 space-y-1 text-sm leading-6" role="list">
          {reviewPoints.map((point) => (
            <li key={point}>・{point}</li>
          ))}
        </ul>
      </section>

      {factCheck && (
        <p className="mt-3 flex items-start gap-2 rounded-card bg-caution-soft px-4 py-3 text-sm leading-6 text-caution">
          <IconCaution className="mt-1 h-4 w-4 shrink-0" />
          <span>数字・日付・価格・仕様は、AIの回答をそのまま信じず確認しましょう。</span>
        </p>
      )}
    </div>
  );
}

// --------------------------------------------------------------- 履歴

/** 前の結果を消さずに残す（要件 §6.9）。 */
export function RunHistory({ runs }: { runs: RunRecord[] }) {
  if (runs.length < 2) return null;

  return (
    <details className="mt-5 rounded-card border border-line bg-surface px-4 py-3">
      <summary className="cursor-pointer text-xs font-bold text-ink-muted">
        これまでの結果（{runs.length}件）
      </summary>
      <ol className="mt-3 space-y-3" role="list">
        {runs.map((run) => (
          <li key={run.sequence} data-testid={`run-${run.sequence}`}>
            <p className="text-xs font-bold text-brand-dark">{run.label}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
              {run.outputText}
            </p>
          </li>
        ))}
      </ol>
    </details>
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

// ----------------------------------------------------------- 完成イメージ

/**
 * 今日つくるものを最初に見せる（成果物ファースト）。
 *
 * 「このレッスンで学ぶこと」だけを並べない。
 * 抽象的な目標は、初心者には自分に関係あるかどうか判断できない。
 * Before / After を1組見せるほうが速い。
 */
export function OutcomePreview({
  minutes,
  before,
  after,
  skills,
}: {
  minutes?: number;
  before?: string;
  after?: string;
  skills: string[];
}) {
  return (
    <div data-testid="outcome-preview" className="space-y-4">
      {/* 見出しの下に、かかる時間とむずかしさ。始める前に知りたい2つ */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-panel bg-surface px-5 py-4 shadow-card">
        {minutes !== undefined && (
          <MetaPill icon={IconClock} label="所要時間" value={`${minutes}分`} />
        )}
        <MetaPill icon={IconBars} value="初級" />
      </div>

      {before && after && (
        <Card>
          <CardHeading icon={IconSparkle} tone="plain">
            完成イメージ
          </CardHeading>

          {/*
            上下に並べて、あいだに矢印を落とす。
            横並びだと「左右にある2つ」で終わり、
            片方がもう片方に変わったことが読み取れない。
          */}
          <section className="mt-4 rounded-card bg-canvas p-4">
            <h3 className="text-xs font-bold text-ink-muted">Before</h3>
            <p
              data-testid="outcome-before"
              className="mt-2 whitespace-pre-wrap text-sm leading-7"
            >
              {before}
            </p>
          </section>

          <div className="flex justify-center py-1.5" aria-hidden="true">
            <IconArrowDown className="h-6 w-6 text-brand" />
          </div>

          <section className="rounded-card bg-brand-soft p-4 ring-1 ring-brand-line">
            <h3 className="text-xs font-bold text-brand-dark">After</h3>
            <p
              data-testid="outcome-after"
              className="mt-2 whitespace-pre-wrap text-sm leading-7"
            >
              {after}
            </p>
          </section>
        </Card>
      )}

      {skills.length > 0 && (
        <Card>
          <CardHeading icon={IconTarget} tone="plain">
            今日できるようになること
          </CardHeading>
          {/*
            できるようになることは押せない。だから pill にはしない。
            淡い青の丸で囲うと「選べる候補」に見え、押してみて何も
            起きない、という無反応を作る。印と文字だけで足りる。
          */}
          <ul className="mt-3 space-y-1.5" role="list">
            {skills.map((skill) => (
              <li key={skill} className="flex items-start gap-2 text-sm leading-6">
                <IconCheckCircle className="mt-1 h-4 w-4 shrink-0 text-brand" />
                {skill}
              </li>
            ))}
          </ul>
        </Card>
      )}

    </div>
  );
}

// --------------------------------------------------------- ミニ解説カード

/**
 * 1画面1ポイントの解説。
 *
 * 講義スライドにしない。文字を増やすほど読まれなくなるので、
 * 型のほうで長さを縛ってある（types.ts）。
 * 図は5種類だけ。凝ったものは作らない。
 */
export function ConceptCardView({
  card,
  headingShown = false,
}: {
  card: ConceptCard;
  /**
   * 見出しが画面の上にもう出ているか。
   *
   * 解説の見出しはステップの見出しと同じ文字なので、囲いの中でもう一度
   * 書くと、1画面に同じ言葉が2回並ぶ。実際そうなっていた。
   */
  headingShown?: boolean;
}) {
  return (
    /*
      囲いを外して、左の罫だけにする。

      角丸の箱に入れると、それだけで画面の主役になる。ここは教科書の
      「POINT」くらいの重さでよく、主役は直前に見たAIの結果のほう。
    */
    <div data-testid="concept-card" className="border-l-2 border-brand pl-4">
      {!headingShown && (
        <h2 className="text-base font-bold text-brand-dark">{card.title}</h2>
      )}
      <p className={`text-sm leading-7 ${headingShown ? "" : "mt-2"}`}>{card.body}</p>

      {card.visual === "before_after" && card.before && card.after && (
        <div className="mt-4 space-y-2">
          <p className="rounded-card bg-canvas px-4 py-2 text-sm leading-7 text-ink-muted">
            <span aria-hidden="true">− </span>
            {card.before}
          </p>
          <p className="rounded-card bg-brand-soft px-4 py-2 text-sm font-bold leading-7 text-brand-dark">
            <span aria-hidden="true">＋ </span>
            {card.after}
          </p>
        </div>
      )}

      {card.visual === "highlight" && card.highlight && (
        <p className="mt-4 rounded-card bg-brand-soft px-4 py-3 text-center text-base font-bold text-brand-dark">
          {card.highlight}
        </p>
      )}

      {card.visual === "three_points" && card.points && (
        <ul className="mt-4 grid gap-2 sm:grid-cols-3" role="list">
          {card.points.map((point) => (
            <li
              key={point}
              className="rounded-card bg-brand-soft px-3 py-3 text-center text-sm font-bold text-brand-dark"
            >
              {point}
            </li>
          ))}
        </ul>
      )}

      {card.visual === "simple_flow" && card.points && (
        <ol className="mt-4 flex flex-wrap items-center gap-2" role="list">
          {card.points.map((point, index) => (
            <li key={point} className="flex items-center gap-2">
              <span className="rounded-card bg-brand-soft px-3 py-2 text-sm font-bold text-brand-dark">
                {point}
              </span>
              {index < (card.points?.length ?? 0) - 1 && (
                <span aria-hidden="true" className="text-brand-line">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// --------------------------------------------------------- 3段階の比較

/**
 * 元の文章 → 1回目 → 条件を足したあと。
 *
 * 2つだけ見せると「AIが何かした」で終わる。
 * 3つ並べて初めて、**条件を足すと動く**ことが分かる。
 */
export function ThreeWayCompare({
  original,
  first,
  improved,
  condition,
}: {
  original: string;
  first: string;
  improved: string;
  condition: string;
}) {
  const [tab, setTab] = useState<"original" | "first" | "improved">("improved");

  /**
   * 改善後の列だけ、変わった文を目立たせる。
   *
   * 3つ並べても、初心者はどこが違うか自力では追えない。
   * ただし色だけに頼らず、太字も併せる（要件 §6.12）。
   */
  const improvedParts = diffSentences(first, improved).filter(
    (part) => part.kind !== "removed",
  );

  const panels = [
    { id: "original" as const, label: "元の文章", body: original, tone: "border-line" },
    { id: "first" as const, label: "1回目", body: first, tone: "border-line" },
    {
      id: "improved" as const,
      label: condition ? `改善後（${condition}）` : "改善後",
      body: improved,
      tone: "border-brand",
      parts: improvedParts,
    },
  ];

  const render = (panel: (typeof panels)[number]) =>
    panel.parts ? (
      <>
        {panel.parts.map((part, index) =>
          part.kind === "added" ? (
            <mark
              key={index}
              className="rounded bg-brand-soft px-0.5 font-bold text-brand-dark"
            >
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </>
    ) : (
      panel.body || "（入力なし）"
    );

  return (
    <div data-testid="result-compare">
      {/* 狭い画面：タブ */}
      <div className="sm:hidden">
        <div role="tablist" className="flex gap-1.5">
          {panels.map((panel) => (
            <button
              key={panel.id}
              role="tab"
              type="button"
              aria-selected={tab === panel.id}
              onClick={() => setTab(panel.id)}
              className={`chip flex-1 text-xs ${
                tab === panel.id ? "chip-on" : "chip-off"
              }`}
            >
              {panel.label}
            </button>
          ))}
        </div>
        <section className="mt-3 rounded-card border border-line bg-surface p-4">
          <p className="whitespace-pre-wrap break-words text-sm leading-7">
            {render(panels.find((panel) => panel.id === tab)!)}
          </p>
        </section>
      </div>

      {/*
        広い画面：3つ並べ、あいだに向きを置く。
        ただ横に並べるだけだと「3つある」で終わり、
        左から右へ変わっていったことが読み取れない。
      */}
      <div className="hidden items-stretch gap-1 sm:flex">
        {panels.map((panel, index) => (
          <Fragment key={panel.id}>
            {index > 0 && (
              <span
                aria-hidden="true"
                className="flex shrink-0 items-center text-brand-line"
              >
                <IconPlay className="h-5 w-5" />
              </span>
            )}
            <section
              data-testid={`compare-${panel.id}`}
              className={`flex-1 rounded-card bg-surface p-4 shadow-card ${
                panel.id === "improved" ? "ring-2 ring-brand" : ""
              }`}
            >
              <h3
                className={`text-xs font-bold ${
                  panel.id === "improved" ? "text-brand-dark" : "text-ink-muted"
                }`}
              >
                {panel.label}
              </h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">
                {render(panel)}
              </p>
            </section>
          </Fragment>
        ))}
      </div>

      {/* 何が変わったか。測って分かることだけを出す */}
      <div className="mt-4">
        <ChangePoints before={first} after={improved} condition={condition} />
      </div>

      {/* 何が変わったかは、1回目と改善後の差で見せる */}
      <details className="mt-4 rounded-card border border-line bg-surface px-4 py-3">
        <summary className="cursor-pointer text-xs font-bold text-ink-muted">
          変わったところを見る
        </summary>
        <p className="mt-3 text-sm leading-7">
          {diffSentences(first, improved).map((part, index) =>
            part.kind === "same" ? (
              <span key={index}>{part.text}</span>
            ) : (
              <span
                key={index}
                className={
                  part.kind === "added"
                    ? "rounded bg-brand-soft px-1 font-bold text-brand-dark"
                    : "rounded bg-caution-soft px-1 text-caution line-through"
                }
              >
                {part.kind === "added" ? "＋" : "−"}
                {part.text}
              </span>
            ),
          )}
        </p>
      </details>
    </div>
  );
}

// --------------------------------------------------------- 変わったポイント

/**
 * 何が変わったかを短い札で示す。
 *
 * ここに出すのは**測って分かることだけ**にしている。
 * 支給デザインには「丁寧」「要点が先に来た」といった札が並んでいるが、
 * それは文章を読んで下す判断で、こちらでは確かめられない。
 * 確かめられないことを断定して出すと、外れたときに
 * 「このアプリの言うことは当てにならない」に変わる。
 *
 * 代わりに、本人が選んだ条件（事実）と、数えれば分かること
 * （文字数・行の分かれ方）を出す。「どう変わったと感じたか」は
 * observation のステップで本人に選んでもらっている。
 */
export function ChangePoints({
  before,
  after,
  condition,
}: {
  before: string;
  after: string;
  condition: string;
}) {
  const points: string[] = [];

  if (condition) points.push(condition);

  const diff = after.length - before.length;
  const rate = before.length === 0 ? 0 : Math.abs(diff) / before.length;
  // 1割に満たない差は「変わった」と言わない。誤差の範囲
  if (rate >= 0.1) {
    points.push(
      diff < 0
        ? `${Math.round(rate * 100)}% 短くなった`
        : `${Math.round(rate * 100)}% 長くなった`,
    );
  }

  const lines = (text: string) => text.split("\n").filter((line) => line.trim()).length;
  const isBulleted = (text: string) =>
    text.split("\n").filter((line) => /^\s*[・\-*•]|^\s*\d+[.)]/.test(line)).length >= 2;

  if (!isBulleted(before) && isBulleted(after)) points.push("箇条書きになった");
  else if (lines(after) > lines(before)) points.push("行が分かれた");

  if (points.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-card bg-canvas px-4 py-3"
      data-testid="change-points"
    >
      <span className="flex items-center gap-2 text-xs font-bold">
        <IconSparkle className="h-4 w-4 shrink-0 text-brand" />
        変わったポイント
      </span>
      <ul className="flex flex-wrap gap-2" role="list">
        {points.map((point) => (
          <li
            key={point}
            className="rounded-badge bg-brand-soft px-3 py-1 text-xs text-brand-dark"
          >
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------- 観察の一覧

/**
 * 「どこが変わったと思いますか」。
 *
 * チップではなく**縦のチェック一覧**にする。
 * 複数選べることが形で分かるし、上から順に読み比べられる。
 * 正誤は付けない。「よく分からない」も同じ見た目で並べる。
 */
export function ObservationList({
  step,
  value,
  onChange,
}: {
  step: LessonStep;
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = value.split(",").filter(Boolean);

  const toggle = (option: StepOption) => {
    const next = selected.includes(option.value)
      ? selected.filter((entry) => entry !== option.value)
      : [...selected, option.value];
    onChange(next.join(","));
  };

  return (
    <ul className="space-y-2" role="list" data-testid="observation-list">
      {(step.options ?? []).map((option) => {
        const active = selected.includes(option.value);
        return (
          <li key={option.value}>
            <button
              type="button"
              onClick={() => toggle(option)}
              aria-pressed={active}
              className={`flex w-full items-center gap-3 rounded-card border px-4 py-3
                          text-left text-sm transition ${
                            active
                              ? "border-brand bg-brand-soft"
                              : "border-line bg-surface hover:border-brand-line"
                          }`}
            >
              {/* 選ばれていることを色だけで表さない */}
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center
                            rounded border text-xs font-bold ${
                              active
                                ? "border-brand bg-brand text-white"
                                : "border-brand-line bg-surface text-transparent"
                            }`}
              >
                ✓
              </span>
              {option.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

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
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
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
                className={`flex min-h-[3.5rem] w-full items-center gap-3 rounded-card
                            px-3 py-3 text-sm shadow-card transition
                            ${
                              active
                                ? "bg-brand-soft font-bold text-brand-dark ring-2 ring-brand"
                                : "bg-surface hover:-translate-y-0.5 hover:shadow-raised"
                            }`}
              >
                <IconBadge
                  icon={optionIcon(option.icon) ?? IconSparkle}
                  tone={optionTone(option.icon)}
                  size="sm"
                />
                <span className="min-w-0 flex-1 text-left">{option.label}</span>
                {active && <IconCheckCircle className="h-5 w-5 shrink-0 text-brand" />}
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

// ------------------------------------------------------- 送信中のようす

/**
 * 送っているあいだの画面。
 *
 * 「考えています」だけにしない。何をしているかを短く出し、
 * 進んでいることが見える棒を添える。
 * 実際の進み具合は分からないので、**時間で伸ばす**演出にはしない。
 * 待ち時間をわざと足すのと変わらなくなる。
 */
export function GeneratingCard({
  message,
  busy,
  failed = false,
}: {
  message: string;
  busy: boolean;
  /** 失敗して止まっているか。理由の文はここには出さない（下のボタンのそば） */
  failed?: boolean;
}) {
  return (
    <div
      data-testid="generating-card"
      className="rounded-card border border-brand-line bg-surface p-6 text-center"
    >
      <p className="text-sm font-bold leading-7" role="status">
        {message}
      </p>
      {/*
        待っていることを、動きでも伝える。

        止まっているときは動かさない。動いたままだと、まだ続いているのか
        終わったのかが読めない。棒は残す——「ここまで進んで止まった」が
        分かるほうが、消えるより落ち着く。
      */}
      <div className="mx-auto mt-5 h-2 w-48 overflow-hidden rounded-full bg-brand-soft">
        <div
          className={`h-full rounded-full ${failed ? "bg-line" : "bg-brand"} ${
            busy ? "animate-drift-x" : ""
          }`}
          style={{ width: busy ? "40%" : "100%" }}
        />
      </div>
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

// ------------------------------------------------------------- 完了画面

/**
 * レッスンを終えた画面（支給デザイン）。
 *
 * ここは行き止まりにしない（憲章 原則 I）。
 * 「おめでとう」だけで終わらせると、次に何をすればよいか分からず、
 * その場でアプリを閉じることになる。出すものを4つに決めている。
 *
 *   1. 何ができるようになったか（身についたこと）
 *   2. 持ち帰れるもの（今回の成果物。押せば手元に写せる）
 *   3. 全体のどこまで来たか
 *   4. 次の行き先
 *
 * 2 が肝心で、これが無いと「練習しただけ」で終わる。
 * せっかく作った文章を、その場で仕事に持っていけるようにする。
 */
export function CompletionView({
  skills,
  outcomeText,
  outcomeLabel,
  lessonId,
  lessonNumber,
  done,
  total,
  next,
  onSelectLesson,
}: {
  skills: string[];
  outcomeText?: string;
  outcomeLabel: string;
  lessonId: string;
  lessonNumber: number;
  done: number;
  total: number;
  next: { id: string; number: number; title: string; goal: string }[];
  onSelectLesson?: (lessonId: string) => void;
}) {
  return (
    <div data-testid="completion-view" className="space-y-4">
      <Card>
        <CardHeading icon={IconStar} tone="plain">
          スキルを身につけました
        </CardHeading>
        <ul className="mt-4 space-y-2.5" role="list">
          {skills.map((skill) => (
            <li key={skill} className="flex items-start gap-2.5 text-sm leading-7">
              <IconCheckCircle className="mt-1.5 h-4 w-4 shrink-0 text-brand" />
              {skill}
            </li>
          ))}
        </ul>

        {outcomeText && (
          <div className="mt-5 border-t border-line pt-5">
            <CardHeading icon={IconDocument} tone="plain">
              今回の成果物
            </CardHeading>
            <div className="mt-3 rounded-card bg-canvas p-4">
              <p className="text-xs font-bold text-ink-muted">{outcomeLabel}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">
                {outcomeText}
              </p>
              <div className="mt-3 flex justify-end">
                <CopyButton text={outcomeText} />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* 全体のどこまで来たか */}
      <Card>
        <p className="flex items-center justify-center gap-2 text-lg font-bold text-brand">
          <IconMedal className="h-6 w-6 shrink-0" />
          Lesson {lessonNumber} 完了
        </p>
        <div className="mt-4 flex items-center gap-3">
          <span className="shrink-0 text-xs text-ink-muted">コース進捗</span>
          <span
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-brand-soft"
            role="progressbar"
            aria-label="コース全体の進み具合"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuetext={`${total}本のうち${done}本おわりました`}
          >
            <span
              className="block h-full rounded-full bg-brand transition-[width] duration-700"
              style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
            />
          </span>
          <span className="shrink-0 text-sm font-bold">
            {done} / {total}
          </span>
        </div>
      </Card>

      {/*
        登録の誘いは、ここ以外に置かない。
        作ったものが目の前にある、この1回だけ聞く。
        ログイン済みの人には何も出ない。
      */}
      <SaveProgressCard />

      {/*
        アンケートは登録の誘いのあと、次の教材より前に出す。
        いちばん下だと、次を選んで離れた人には見えない。
      */}
      <SurveyCard lessonId={lessonId} />

      {next.length > 0 && (
        <section aria-labelledby="next-heading">
          <div className="flex items-center gap-3">
            <IconBadge icon={IconSparkle} tone="plain" size="sm" />
            <h2 id="next-heading" className="text-base font-bold">
              次におすすめ
            </h2>
          </div>

          <ul className="mt-3 grid gap-3 sm:grid-cols-2" role="list">
            {next.map((lesson) => (
              <li key={lesson.id}>
                <button
                  type="button"
                  disabled={!onSelectLesson}
                  onClick={() => onSelectLesson?.(lesson.id)}
                  data-testid={`next-${lesson.id}`}
                  className="flex w-full items-center gap-3 rounded-panel bg-surface p-4
                             text-left shadow-card transition
                             enabled:hover:-translate-y-0.5 enabled:hover:shadow-raised
                             disabled:cursor-not-allowed"
                >
                  <div className="min-w-0 flex-1">
                    <span className="inline-block rounded-badge bg-brand-soft px-2.5 py-1 text-[0.6875rem] font-bold text-brand-dark">
                      Lesson {lesson.number}
                    </span>
                    <h3 className="mt-2 text-sm font-bold leading-6">{lesson.title}</h3>
                    <p className="mt-1 text-xs leading-6 text-ink-muted">{lesson.goal}</p>
                  </div>
                  <span
                    aria-hidden="true"
                    className="flex shrink-0 items-center justify-center text-ink-muted"
                  >
                    <IconChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * 手元へ写すボタン。
 *
 * 押したことが分からないと、もう一度押される。
 * 文字を変えて2秒だけ残す。失敗したときは黙らず、その場で伝える
 * （権限が無い端末や、安全でない接続では使えない）。
 */
export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("done");
        } catch {
          setState("failed");
        }
      }}
      className="flex items-center gap-2 rounded-badge bg-brand-soft px-4 py-2
                 text-xs font-bold text-brand-dark transition hover:bg-brand-line"
    >
      <IconCopy className="h-4 w-4 shrink-0" />
      {/* 結果は読み上げにも届ける */}
      <span role="status">
        {state === "done" ? "写しました" : state === "failed" ? "写せません" : "コピー"}
      </span>
    </button>
  );
}
