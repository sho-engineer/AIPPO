/**
 * 自分のプロンプト帳。
 *
 * レッスンの後半で、自分の仕事のことをAIに頼んだときの「こう伝えます」を
 * 並べる。次に同じことをしたくなったら、ここから写して使う。
 *
 * 出すのは指示だけ
 * ----------------
 * そのとき直した文章そのものは入っていない（promptLibrary が外している）。
 * 指示は次も使えるが、そのときの文章は一度きり。混ぜると、
 * 使い回せる形にならない。
 *
 * 消せるようにする
 * ----------------
 * 自動でしまうので、要らないものも溜まる。1件ずつ消せないと、
 * 帳面が「消せない履歴」になって開かなくなる。
 */

import { useState } from "react";

import { CopyButton } from "./steps/Completion";
import { IconDocument, IconClock } from "../Icons";
import { loadPrompts, removePrompt, type SavedPrompt } from "../../course/promptLibrary";

function whenLabel(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export function PromptLibrary() {
  const [prompts, setPrompts] = useState<SavedPrompt[]>(() => loadPrompts());

  // 1件も無い日は、節ごと出さない。空の見出しを残さない
  if (prompts.length === 0) return null;

  const drop = (id: string) => {
    removePrompt(id);
    setPrompts((current) => current.filter((item) => item.id !== id));
  };

  return (
    <section className="mt-8" aria-labelledby="prompts-heading" data-testid="prompt-library">
      <h2 id="prompts-heading" className="flex items-center gap-2 text-base font-bold">
        <IconDocument className="h-[1.125rem] w-[1.125rem] shrink-0 text-brand" />
        自分のプロンプト
      </h2>
      <p className="mt-1 text-xs leading-6 text-ink-muted">
        レッスンで組み立てた「AIへの伝え方」です。写して、そのまま使えます。
      </p>

      <ul className="mt-3 space-y-3" role="list">
        {prompts.map((prompt) => (
          <li
            key={prompt.id}
            data-testid={`prompt-${prompt.id}`}
            className="rounded-panel border border-line bg-surface p-4 shadow-card"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 flex-1 truncate text-sm font-bold">
                {prompt.lessonTitle}
              </p>
              <span className="flex shrink-0 items-center gap-1 text-xs text-ink-muted">
                <IconClock className="h-3.5 w-3.5" />
                {whenLabel(prompt.at)}
              </span>
            </div>

            {/* 条件は札で。指示の全文より、こちらのほうが速く見比べられる */}
            {prompt.cards.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5" role="list">
                {prompt.cards.map((card) => (
                  <li
                    key={`${card.label}-${card.value}`}
                    className="rounded-badge bg-brand-soft px-2.5 py-1 text-xs text-brand-dark"
                  >
                    {card.label}：{card.value}
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-3 whitespace-pre-wrap break-words rounded-card bg-canvas p-3
                          text-xs leading-6">
              {prompt.text}
            </p>

            <div className="mt-3 flex items-center justify-between gap-3">
              <CopyButton text={prompt.text} />
              <button
                type="button"
                onClick={() => drop(prompt.id)}
                data-testid={`prompt-remove-${prompt.id}`}
                className="-my-2 py-2 text-xs text-ink-muted underline transition
                           hover:text-caution"
              >
                消す
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
