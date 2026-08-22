/**
 * 完成イメージ。
 *
 * レッスンを開いていちばん最初に出る画面。説明を先に読ませず、
 * 「これができるようになる」を先に見せる。
 */

import { Card, CardHeading, MetaPill } from "../../AppShell";
import {
  IconArrowDown,
  IconBars,
  IconCheckCircle,
  IconClock,
  IconSparkle,
  IconTarget,
} from "../../Icons";
import { LessonThumbnail } from "../../lessons/LessonThumbnail";

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
  thumbnail,
}: {
  minutes?: number;
  before?: string;
  after?: string;
  skills: string[];
  thumbnail?: string | null;
}) {
  return (
    <div data-testid="outcome-preview" className="space-y-4">
      {thumbnail && <LessonThumbnail src={thumbnail} variant="banner" />}
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
