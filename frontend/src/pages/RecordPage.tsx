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
 *
 * 何も無いときに、行き止まりにしない
 * ----------------------------------
 * 「まだありません」で終える画面を作らない（憲章 原則 I）。
 * ここは初日にいちばん空になる画面で、しかも1本目を終える**前**に
 * 開かれる。「レッスンでAIに何か作ってもらうと、ここに残ります」と
 * 書いてあるのに、そのレッスンへ行く道がこの画面に無かった。
 * やり方を書いて道を置かないのは、書いていないのとあまり変わらない。
 *
 * 読み込めなかったときも同じ。「もう一度お試しください」と書くなら、
 * もう一度を押せる場所をその文の隣に置く。下タブで往復させない。
 */

import { useCallback, useEffect, useState } from "react";

import { fetchHistory, type Artifact, type History } from "../api/history";
import { AppHeader } from "../components/AppShell";
import {
  IconCheck,
  IconChevronRight,
  IconClock,
  IconSparkle,
} from "../components/Icons";
import { lookupLesson } from "../course/live";

export interface RecordPageProps {
  onSelectLesson: (lessonId: string) => void;
  /** 何も無いときの行き先。 */
  onOpenCourse: () => void;
  /**
   * AI技図鑑へ。
   *
   * ここは「何を学んだか」の画面で、図鑑は「何ができるか」の画面。
   * 見に来る動機が続いているので、隣に置く。
   */
  onOpenSkills: () => void;
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

export function RecordPage({
  onSelectLesson,
  onOpenCourse,
  onOpenSkills,
}: RecordPageProps) {
  const [history, setHistory] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      /*
        形が違うものが返ることがある（前段のプロキシ、設定違いの
        エンドポイント、古い版のサーバー）。そのまま入れると
        `artifacts.length` で落ち、**画面ごと真っ白**になる。
        200 が返っている以上「読み込めませんでした」でもないので、
        足りない配列は空として扱い、画面は出す。
      */
      const body = await fetchHistory(signal);
      setHistory({
        artifacts: Array.isArray(body?.artifacts) ? body.artifacts : [],
        sessions: Array.isArray(body?.sessions) ? body.sessions : [],
        ai_quota: body?.ai_quota ?? { limit: null, used: 0, remaining: null },
      });
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

      <main className="page">
        <h1 className="text-xl font-bold">学習履歴</h1>
        <p className="mt-1.5 text-sm leading-7 text-ink-muted">
          作ったものは、ここからいつでも取り出せます。
        </p>

        {/*
          何ができるようになったか。

          この画面は「何を学んだか」を出す場所で、できることの一覧は
          別に要る。本数だけを積み上げても、身についた実感にはならない。
        */}
        <button
          type="button"
          onClick={onOpenSkills}
          data-testid="record-open-skills"
          className="mt-5 flex w-full items-center gap-3 rounded-card border border-line
                     bg-surface px-4 py-3 text-left transition hover:bg-canvas"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card
                       bg-brand-soft text-brand"
          >
            <IconSparkle className="h-[1.125rem] w-[1.125rem]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold leading-6">AI技を見る</span>
            <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
              いま自分にできることの一覧
            </span>
          </span>
          <IconChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
        </button>

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
          <div
            role="alert"
            data-testid="record-error"
            className="mt-5 rounded-card bg-caution-soft px-4 py-3 text-sm leading-6 text-caution"
          >
            <p>記録を読み込めませんでした。通信を確かめて、もう一度お試しください。</p>
            {/*
              「もう一度」を押せる場所を、その文の隣に置く。
              下タブで往復させると、同じことを別の手順で覚えることになる。
            */}
            <button
              type="button"
              onClick={() => void load()}
              data-testid="record-retry"
              className="mt-2 min-h-[2.75rem] rounded-cta border border-caution/40 px-5
                         py-2 text-sm font-bold text-caution transition
                         hover:bg-caution/10"
            >
              もう一度読み込む
            </button>
          </div>
        )}

        {/* ── 作ったもの ── */}
        <section className="mt-7" aria-labelledby="artifacts-heading">
          <h2 id="artifacts-heading" className="section-title">
            作ったもの
          </h2>

          {history === null && !failed ? (
            <p className="mt-2 text-sm text-ink-muted">読み込んでいます…</p>
          ) : history && history.artifacts.length === 0 ? (
            <div
              className="mt-3 rounded-panel border border-line bg-surface p-6 text-center
                         shadow-card"
              data-testid="record-empty"
            >
              <span
                aria-hidden="true"
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full
                           bg-brand-soft text-brand"
              >
                <IconSparkle className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-bold">作ったものはまだありません</p>
              <p className="mt-1 text-xs leading-6 text-ink-muted">
                レッスンでAIに何か作ってもらうと、ここに残ります。
                1本10分ほどで終わります。
              </p>
              <button
                type="button"
                onClick={onOpenCourse}
                data-testid="record-empty-start"
                className="mt-4 min-h-[2.75rem] rounded-cta bg-brand px-6 py-2 text-sm
                           font-bold text-white shadow-cta transition
                           hover:brightness-110 active:scale-[0.98]"
              >
                レッスンを始める
              </button>
            </div>
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
