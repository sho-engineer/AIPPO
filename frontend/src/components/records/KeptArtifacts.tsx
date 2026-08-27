/**
 * 取っておいた成果物の一覧。
 *
 * すぐ上の「作ったもの」との違いをはっきりさせる。
 *
 *     取っておいたもの … 自分で取っておくと決めたもの。名前が付く。消えない
 *     作ったもの       … AIを動かすたびに自動でたまる。いずれ消える
 *
 * 同じ画面に2つ並ぶので、**上に置くのはこちら**。探しに来た人が
 * 目的の1つに先に当たる。自動でたまるほうは、試した回数ぶん並ぶ。
 *
 * ゲストには一覧そのものを出さない
 * --------------------------------
 * 取っておけないのに前の分だけ並ぶと、消し方の分からない行が残る。
 * サーバーが `requires_account` を添えて返すので、
 * ここは「登録すると使えます」に切り替える（空と、使えないは別のこと）。
 */

import { useCallback, useEffect, useState } from "react";

import {
  discardArtifact,
  fetchSavedArtifacts,
  renameArtifact,
  type SavedArtifact,
} from "../../api/artifacts";
import { IconBookmark, IconCheck } from "../Icons";

export interface KeptArtifactsProps {
  onSelectLesson: (lessonId: string) => void;
  /** 取り直しの合図。押した側が数える（保存直後に増やすため）。 */
  reloadKey?: number;
  lessonTitle: (lessonId: string) => string;
}

/** 1件ぶん。名前を直せるようにしてある。 */
function KeptCard({
  artifact,
  lessonTitle,
  onOpenLesson,
  onChanged,
}: {
  artifact: SavedArtifact;
  lessonTitle: (lessonId: string) => string;
  onOpenLesson: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(artifact.title);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(artifact.output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードを使えない環境がある。選んで手で写せるので騒がない
    }
  }

  async function rename() {
    const title = draft.trim();
    if (!title) return;
    try {
      await renameArtifact(artifact.id, title);
      setEditing(false);
      onChanged();
    } catch {
      // 変えられなかった。元の名前のまま残る
      setEditing(false);
    }
  }

  const conditions = Object.entries(artifact.conditions).filter(
    ([, value]) => typeof value === "string" && value !== "",
  );

  return (
    <li
      className="border-b border-line py-4"
      data-testid={`kept-${artifact.id}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        {editing ? (
          <input
            value={draft}
            autoFocus
            maxLength={120}
            aria-label="名前"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void rename();
              if (event.key === "Escape") setEditing(false);
            }}
            data-testid={`kept-title-input-${artifact.id}`}
            className="min-w-0 flex-1 rounded-card border border-line bg-surface px-3
                       py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(artifact.title);
              setEditing(true);
            }}
            data-testid={`kept-rename-${artifact.id}`}
            className="min-w-0 text-left text-sm font-bold hover:underline"
          >
            {artifact.title}
          </button>
        )}

        {editing ? (
          <button
            type="button"
            onClick={() => void rename()}
            data-testid={`kept-title-save-${artifact.id}`}
            className="shrink-0 text-xs font-bold text-brand-dark"
          >
            決定
          </button>
        ) : (
          <button
            type="button"
            onClick={async () => {
              await discardArtifact(artifact.id).catch(() => {});
              onChanged();
            }}
            aria-label={`${artifact.title} を捨てる`}
            data-testid={`kept-discard-${artifact.id}`}
            /* 記号ではなく言葉にする。×は「閉じる」とも読める */
            className="-my-2 shrink-0 p-2 text-xs text-ink-muted transition
                       hover:text-caution"
          >
            捨てる
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenLesson}
        className="mt-0.5 text-xs text-brand-dark hover:underline"
      >
        {lessonTitle(artifact.lesson_id)}
      </button>

      {/* なぜその結果になったか。無いと、見返しても学びに繋がらない */}
      {conditions.length > 0 && (
        <p className="mt-1 text-xs leading-6 text-ink-muted">
          {conditions.map(([, value]) => value).join("・")}
        </p>
      )}

      <p className="mt-2 whitespace-pre-wrap rounded-card bg-brand-soft/40 px-3 py-2.5 text-sm leading-7">
        {artifact.output}
      </p>

      <button
        type="button"
        onClick={() => void copy()}
        data-testid={`kept-copy-${artifact.id}`}
        className="mt-2 flex items-center gap-1.5 rounded-badge border border-line px-3
                   py-1.5 text-xs text-ink-muted transition hover:border-brand
                   hover:text-brand-dark"
      >
        {copied && <IconCheck className="h-3.5 w-3.5 shrink-0" />}
        {copied ? "コピーしました" : "コピー"}
      </button>
    </li>
  );
}

export function KeptArtifacts({
  onSelectLesson,
  reloadKey = 0,
  lessonTitle,
}: KeptArtifactsProps) {
  const [items, setItems] = useState<SavedArtifact[] | null>(null);
  const [guest, setGuest] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const body = await fetchSavedArtifacts(signal);
      setGuest(Boolean(body?.requires_account));
      setItems(Array.isArray(body?.items) ? body.items : []);
    } catch {
      // 取れなくても、下の「作ったもの」は出る。ここは黙って畳む
      setItems([]);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  /*
    ゲストのときは節ごと出さない。

    「登録すると使えます」をここにも置くと、この画面だけで登録の
    お誘いが2つになる（下の「作ったもの」にも出る）。同じことを
    2回言うより、押せる場所を1つに保つほうがよい。
  */
  if (guest) return null;

  // まだ1つも無いときも出さない。「作ったもの」から取っておける
  if (items === null || items.length === 0) return null;

  return (
    <section className="mt-7" aria-labelledby="kept-heading">
      <h2 id="kept-heading" className="flex items-center gap-2 section-title">
        <IconBookmark className="h-4 w-4 shrink-0 text-brand" />
        取っておいたもの
      </h2>
      <p className="mt-1 text-xs leading-6 text-ink-muted">
        名前を押すと、あとから分かる名前に変えられます。
      </p>

      <ul className="mt-2" role="list" data-testid="kept-list">
        {items.map((artifact) => (
          <KeptCard
            key={artifact.id}
            artifact={artifact}
            lessonTitle={lessonTitle}
            onOpenLesson={() => onSelectLesson(artifact.lesson_id)}
            onChanged={() => void load()}
          />
        ))}
      </ul>
    </section>
  );
}
