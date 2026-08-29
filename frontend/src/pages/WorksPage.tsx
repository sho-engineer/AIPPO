/**
 * マイ成果物。**何を作ったか**を置く場所。
 *
 * 3つの画面で言っていることを分ける。
 *
 *     学習記録   … 何を学んだか  （どの教材をどこまで）
 *     AI技      … 何ができるか  （図鑑）
 *     マイ成果物 … 何を作ったか  （この画面）
 *
 * 前はこの3つが「学習履歴」1枚に混ざっていた。作ったものを取りに来た
 * 人が、教材の一覧と回数の数字を通り過ぎることになる。
 * このアプリは「実際の仕事でAIを使えるようになる」ことを約束している
 * ので、作ったものを取り出す場所は、その約束と同じ大きさで要る。
 *
 * 2段に分ける
 * -----------
 *     取っておいたもの … 自分で取っておくと決めたもの。名前が付く。消えない
 *     作ったもの       … AIを動かすたびに自動でたまる。いずれ消える
 *
 * 上に置くのは前者。探しに来た人が、目的の1つに先に当たる。
 */

import { useState } from "react";

import { AppHeader } from "../components/AppShell";
import { KeptArtifacts } from "../components/records/KeptArtifacts";
import { MadeArtifacts } from "../components/records/MadeArtifacts";
import { useHistory } from "../components/records/useHistory";
import { lookupLesson } from "../course/live";

export interface WorksPageProps {
  onSelectLesson: (lessonId: string) => void;
  /** 何も無いときの行き先。 */
  onOpenCourse: () => void;
}

function lessonTitle(lessonId: string): string {
  return lookupLesson(lessonId)?.title ?? lessonId;
}

export function WorksPage({ onSelectLesson, onOpenCourse }: WorksPageProps) {
  const { history, failed, reload } = useHistory();
  /* 取っておいた直後に、上の一覧を取り直すための合図 */
  const [keptAt, setKeptAt] = useState(0);

  return (
    <>
      <AppHeader />

      <main className="page">
        <h1 className="text-xl font-bold">マイ成果物</h1>
        <p className="mt-1.5 text-sm leading-7 text-ink-muted">
          AIと作ったものは、ここからいつでも取り出せます。
        </p>

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
              onClick={reload}
              data-testid="record-retry"
              className="mt-2 min-h-[2.75rem] rounded-cta border border-caution/40 px-5
                         py-2 text-sm font-bold text-caution transition
                         hover:bg-caution/10"
            >
              もう一度読み込む
            </button>
          </div>
        )}

        <KeptArtifacts
          onSelectLesson={onSelectLesson}
          reloadKey={keptAt}
          lessonTitle={lessonTitle}
        />

        <MadeArtifacts
          history={history}
          failed={failed}
          onSelectLesson={onSelectLesson}
          onOpenCourse={onOpenCourse}
          onKept={() => setKeptAt((count) => count + 1)}
          lessonTitle={lessonTitle}
        />
      </main>
    </>
  );
}
