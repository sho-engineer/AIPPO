/**
 * 学習履歴。作ったものを見返す場所。
 *
 * このアプリは「実際の仕事でAIを使えるようになる」ことを約束している。
 * なのに、作った文章はレッスンを閉じた時点で見えなくなっていた。
 * 翌日「先週つくったやつをもう一度」ができない。
 * 約束の真ん中に穴が空いている状態だった。
 *
 * ここで出すのは3つ。
 *
 *   1. 今日あと何回AIを使えるか（上限に当たってから知るのでは遅い）
 *   2. 作ったもの（コピーして、そのまま仕事で使える）
 *   3. どの教材をどこまでやったか
 *
 * 「作ったもの」を先に置く。数字を眺めに来る人はいない。
 * 使えるものを取りに来ている。
 */

import { useCallback, useEffect, useState } from "react";

import { fetchHistory, type Artifact, type History } from "../api/history";
import { AppHeader } from "../components/AppShell";
import { IconCheck, IconClock } from "../components/Icons";
import { lookupLesson } from "../course/live";

export interface RecordPageProps {
  onSelectLesson: (lessonId: string) => void;
}

/** 「8月18日 15:03」の形。年は今年なら出さない（読む量を減らす）。 */
function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const year = date.getFullYear() === now.getFullYear() ? "" : `${date.getFullYear()}年`;
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${year}${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function lessonTitle(lessonId: string): string {
  return lookupLesson(lessonId)?.title ?? lessonId;
}

/**
 * 作ったもの1件。
 *
 * コピーできるようにする。見えるだけでは仕事に持っていけない。
 */
function ArtifactCard({
  artifact,
  onOpenLesson,
}: {
  artifact: Artifact;
  onOpenLesson: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(artifact.output);
      setCopied(true);
      // 押したことが伝わればよい。戻す時間は短く
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードを使えない環境がある（古い端末、許可されていない場合）。
      // 選んで手でコピーできるので、ここで騒がない
    }
  }

  const conditions = Object.entries(artifact.conditions).filter(
    ([, value]) => typeof value === "string" && value !== "",
  );

  return (
    <li className="border-b border-line py-4" data-testid={`artifact-${artifact.id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <button
          type="button"
          onClick={onOpenLesson}
          className="min-w-0 text-left text-sm font-bold text-brand-dark hover:underline"
        >
          {lessonTitle(artifact.lesson_id)}
        </button>
        <span className="shrink-0 text-xs tabular-nums text-ink-muted">
          {when(artifact.created_at)}
        </span>
      </div>

      {/*
        条件を先に出す。「なぜこの結果になったか」が分からないと、
        見返しても学びに繋がらない。
      */}
      {conditions.length > 0 && (
        <p className="mt-1 text-xs leading-6 text-ink-muted">
          {conditions.map(([, value]) => value).join("・")}
        </p>
      )}

      <p className="mt-2 whitespace-pre-wrap rounded-card bg-brand-soft/40 px-3 py-2.5 text-sm leading-7">
        {artifact.output}
        {artifact.truncated && (
          <span className="mt-1 block text-xs text-ink-muted">
            （長いため、ここまでを保存しています）
          </span>
        )}
      </p>

      <button
        type="button"
        onClick={copy}
        data-testid={`artifact-copy-${artifact.id}`}
        className="mt-2 rounded-badge border border-line px-3 py-1.5 text-xs
                   text-ink-muted transition hover:border-brand hover:text-brand-dark"
      >
        {copied ? "コピーしました" : "コピー"}
      </button>
    </li>
  );
}

export function RecordPage({ onSelectLesson }: RecordPageProps) {
  const [history, setHistory] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setHistory(await fetchHistory(signal));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const quota = history?.ai_quota;

  return (
    <>
      <AppHeader />

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        <h1 className="text-xl font-bold">学習履歴</h1>
        <p className="mt-1.5 text-sm leading-7 text-ink-muted">
          作ったものは、ここからいつでも取り出せます。
        </p>

        {/* ── 今日あと何回使えるか ── */}
        {/*
          上限に当たってから知るのでは遅い。レッスンの途中で急に止まると、
          壊れたのか自分のせいなのかが分からない。
        */}
        {quota?.limit != null && (
          <section
            className="mt-5 rounded-card border border-line px-4 py-3"
            aria-labelledby="quota-heading"
            data-testid="ai-quota"
          >
            <h2 id="quota-heading" className="section-title">
              今日つかえるAIの回数
            </h2>
            <p className="mt-1 text-sm">
              <span className="font-bold tabular-nums">あと{quota.remaining}回</span>
              <span className="text-ink-muted">（{quota.limit}回のうち{quota.used}回つかいました）</span>
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              日付が変わるとまた使えます。
            </p>
          </section>
        )}

        {failed && (
          <p
            role="alert"
            data-testid="record-error"
            className="mt-5 rounded-card bg-caution-soft px-4 py-3 text-sm leading-6 text-caution"
          >
            記録を読み込めませんでした。通信を確かめて、もう一度お試しください。
          </p>
        )}

        {/* ── 作ったもの ── */}
        <section className="mt-7" aria-labelledby="artifacts-heading">
          <h2 id="artifacts-heading" className="section-title">
            作ったもの
          </h2>

          {history === null && !failed ? (
            <p className="mt-2 text-sm text-ink-muted">読み込んでいます…</p>
          ) : history && history.artifacts.length === 0 ? (
            <p className="mt-2 text-sm leading-7 text-ink-muted">
              まだありません。レッスンでAIに何か作ってもらうと、ここに残ります。
            </p>
          ) : (
            <ul className="mt-2" role="list" data-testid="artifact-list">
              {history?.artifacts.map((artifact) => (
                <ArtifactCard
                  key={artifact.id}
                  artifact={artifact}
                  onOpenLesson={() => onSelectLesson(artifact.lesson_id)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* ── どこまでやったか ── */}
        {history && history.sessions.length > 0 && (
          <section className="mt-7" aria-labelledby="sessions-heading">
            <h2 id="sessions-heading" className="section-title">
              取り組んだ教材
            </h2>

            <ul className="mt-2" role="list">
              {history.sessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    onClick={() => onSelectLesson(session.lesson_id)}
                    data-testid={`record-session-${session.lesson_id}`}
                    className="row row-tap items-baseline"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-6">
                        {lessonTitle(session.lesson_id)}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                        <IconClock className="h-3.5 w-3.5 shrink-0" />
                        {when(session.updated_at)}
                      </span>
                    </span>
                    {session.completed && (
                      <IconCheck
                        className="h-4 w-4 shrink-0 self-center text-brand"
                        aria-label="おわった"
                      />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
