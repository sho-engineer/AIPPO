/**
 * 学習記録。**何を学んだか**を置く場所。
 *
 * 3つの画面で言っていることを分ける。
 *
 *     学習記録   … 何を学んだか  （この画面）
 *     マイ学び   … 何ができるか  （図鑑）
 *     マイ成果物 … 何を作ったか  （作ったもの・取っておいたもの）
 *
 * 前はこの3つが1枚に混ざっていた。作ったものを取りに来た人が、
 * 教材の一覧と回数の数字を通り過ぎることになる。分けたうえで、
 * それぞれへの入口をこの画面にも置いてある——分けたせいで
 * 「前はここにあったもの」が行方不明になるほうが困る。
 *
 * ここで出すのは3つ。
 *
 *   1. 今日あと何回AIを使えるか（上限に当たってから知るのでは遅い）
 *   2. できるようになったこと・作ったものへの入口
 *   3. どの教材をどこまでやったか
 *
 * 読み込めなかったときは、その場でやり直せるようにする。
 * 「もう一度お試しください」と書くなら、もう一度を押せる場所を
 * その文の隣に置く。下タブで往復させない。
 */

import { AppHeader } from "../components/AppShell";
import {
  IconCheck,
  IconChevronRight,
  IconClock,
  IconDocument,
  IconMedal,
} from "../components/Icons";
import { useHistory, when } from "../components/records/useHistory";
import { lookupLesson } from "../course/live";

export interface RecordPageProps {
  onSelectLesson: (lessonId: string) => void;
  /** 何も無いときの行き先。 */
  onOpenCourse: () => void;
  /** マイ学び（AI技図鑑）へ。「何ができるか」。 */
  onOpenSkills: () => void;
  /** マイ成果物へ。「何を作ったか」。 */
  onOpenWorks: () => void;
}

function lessonTitle(lessonId: string): string {
  return lookupLesson(lessonId)?.title ?? lessonId;
}

/** 隣の画面への入口。役割の違いを1行で言う。 */
function Doorway({
  icon: Icon,
  title,
  description,
  onClick,
  testId,
}: {
  icon: typeof IconMedal;
  title: string;
  description: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex w-full items-center gap-3 rounded-card border border-line
                 bg-surface px-4 py-3 text-left transition hover:bg-canvas"
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card
                   bg-brand-soft text-brand"
      >
        <Icon className="h-[1.125rem] w-[1.125rem]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-6">{title}</span>
        <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
          {description}
        </span>
      </span>
      <IconChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
    </button>
  );
}

export function RecordPage({
  onSelectLesson,
  onOpenCourse,
  onOpenSkills,
  onOpenWorks,
}: RecordPageProps) {
  const { history, failed, reload } = useHistory();
  const quota = history?.ai_quota;

  return (
    <>
      <AppHeader />

      <main className="page">
        <h1 className="text-xl font-bold">学習記録</h1>
        <p className="mt-1.5 text-sm leading-7 text-ink-muted">
          どの教材を、どこまで進めたかの記録です。
        </p>

        {/*
          隣の2つへの入口。

          分けたぶん、「前はここにあったもの」を探せる道を残す。
          役割の違いを1行で言い切って、行き先を取り違えないようにする。
        */}
        <div className="mt-5 space-y-2">
          <Doorway
            icon={IconMedal}
            title="マイ学び"
            description="いま自分にできることの一覧"
            onClick={onOpenSkills}
            testId="record-open-skills"
          />
          <Doorway
            icon={IconDocument}
            title="マイ成果物"
            description="AIと作ったものを取り出す"
            onClick={onOpenWorks}
            testId="record-open-works"
          />
        </div>

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

        {/* ── どこまでやったか ── */}
        <section className="mt-7" aria-labelledby="sessions-heading">
          <h2 id="sessions-heading" className="section-title">
            取り組んだ教材
          </h2>

          {history === null && !failed ? (
            <p className="mt-2 text-sm text-ink-muted">読み込んでいます…</p>
          ) : history && history.sessions.length === 0 ? (
            /*
              空でも行き止まりにしない（憲章 原則 I）。
              ここは初日にいちばん空になる画面でもある。
            */
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
                <IconClock className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-bold">まだ記録がありません</p>
              <p className="mt-1 text-xs leading-6 text-ink-muted">
                レッスンを1本進めると、ここに残ります。1本10分ほどで終わります。
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
            <ul className="mt-2" role="list">
              {history?.sessions.map((session) => (
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
          )}
        </section>
      </main>
    </>
  );
}
