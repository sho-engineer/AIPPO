/**
 * 作ったもの（自動でたまるほう）。
 *
 * AIを動かすたびに1件たまる。試した回数ぶん並ぶので、目的の1つは
 * 埋もれる。残したい1つは「取っておく」で上の一覧へ移す。
 *
 *     取っておいたもの … 自分で決めたもの。名前が付く。消えない
 *     作ったもの       … 自動。試した分だけ並ぶ。いずれ消える
 *
 * 何も無いときに、行き止まりにしない
 * ----------------------------------
 * 「まだありません」で終える画面を作らない（憲章 原則 I）。
 * ここは初日にいちばん空になる場所で、しかも1本目を終える**前**に
 * 開かれる。「レッスンでAIに何か作ってもらうと、ここに残ります」と
 * 書いてあるのに、そのレッスンへ行く道がこの画面に無かった。
 * やり方を書いて道を置かないのは、書いていないのとあまり変わらない。
 */

import { useState } from "react";

import type { Artifact, History } from "../../api/history";
import { IconSparkle } from "../Icons";
import { KeepArtifactButton } from "../course/KeepArtifactButton";
import { when } from "./useHistory";

export interface MadeArtifactsProps {
  history: History | null;
  failed: boolean;
  onSelectLesson: (lessonId: string) => void;
  /** 何も無いときの行き先。 */
  onOpenCourse: () => void;
  /** 取っておけたとき。呼び出し側が上の一覧を取り直す。 */
  onKept: () => void;
  lessonTitle: (lessonId: string) => string;
}

/**
 * 作ったもの1件。
 *
 * コピーできるようにする。見えるだけでは仕事に持っていけない。
 */
function ArtifactCard({
  artifact,
  lessonTitle,
  onOpenLesson,
  onKept,
}: {
  artifact: Artifact;
  lessonTitle: (lessonId: string) => string;
  onOpenLesson: () => void;
  onKept: () => void;
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

      {/*
        いま貼るのと、あとで出すのは別のこと。両方を並べて置く。
        ここは自動でたまる一覧なので、試した回数ぶん並ぶ。
        残したい1つだけを、上の「取っておいたもの」へ移せるようにする。
      */}
      <div className="mt-2 flex items-start gap-2">
        <KeepArtifactButton
          lessonId={artifact.lesson_id}
          output={artifact.output}
          conditions={artifact.conditions}
          onKept={onKept}
        />
        <button
          type="button"
          onClick={copy}
          data-testid={`artifact-copy-${artifact.id}`}
          className="min-h-[2.75rem] rounded-badge border border-line px-3 py-1.5
                     text-xs text-ink-muted transition hover:border-brand
                     hover:text-brand-dark"
        >
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
    </li>
  );
}

export function MadeArtifacts({
  history,
  failed,
  onSelectLesson,
  onOpenCourse,
  onKept,
  lessonTitle,
}: MadeArtifactsProps) {
  return (
    <section className="mt-7" aria-labelledby="artifacts-heading">
      <h2 id="artifacts-heading" className="section-title">
        作ったもの
      </h2>
      <p className="mt-1 text-xs leading-6 text-ink-muted">
        レッスンでAIを動かすたびに、ここに残ります。
      </p>

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
              lessonTitle={lessonTitle}
              onOpenLesson={() => onSelectLesson(artifact.lesson_id)}
              onKept={onKept}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
