/**
 * レッスンを開いた最初に出す一枚と、その「詳しく見る」。
 *
 * なぜ二段にするか
 * ----------------
 * 最初の画面には、開いた人がその場で決めたいことしか無い——
 * **今日は何をするのか／始めてよいか**の2つ。ところが持っている
 * ものは多い（ねらい・完成イメージ・流れ・覚えるAI技・できること・
 * 全体図の1枚）。全部を画面に積むと、始める前に読み物が1本になる。
 *
 * そこで分ける。
 *
 *     導入 … 中央に浮かぶ小さな一枚。見出し・一言・ポー・
 *            できること2つ・「さっそく試す」
 *     詳細 … 「詳しく見る」を押した人にだけ、画面いっぱいの一枚で
 *            全部出す。ここは縦に送ってよい
 *
 * **モーダルは読ませる場所ではなく、次へ進ませる入口**という決め方。
 * 導入の一枚に置くのは、押す先が1つあることと、その判断に要る分だけ。
 *
 * 下から出す形にしない
 * --------------------
 * 下から出る一枚は「送れば続きがある」を匂わせる。ここは**見て、
 * 進む**場面なので中央に浮かべる（`MoreSheet` の `placement`）。
 */

import type { ReactNode } from "react";

import { Card, CardHeading } from "../AppShell";
import { MoreSheet } from "./MoreSheet";
import {
  IconArrowDown,
  IconCheckCircle,
  IconList,
  IconSparkle,
  IconTarget,
} from "../Icons";
import { PoSpeech } from "../../po/PoSpeech";

export interface LessonDetailContent {
  /** ねらい。1行。 */
  goal?: string;
  before?: string;
  after?: string;
  /** 今日覚えるAI技。 */
  skills: string[];
  /** 終えたらできるようになること。 */
  outcomes?: string[];
  /** レッスンの流れ。区切りの名前が順に並ぶ。 */
  flow?: string[];
}

/** 詳しい話が1つでもあるか。無ければ「詳しく見る」を出さない。 */
export function hasLessonDetail(detail: LessonDetailContent): boolean {
  return (
    Boolean(detail.goal) ||
    Boolean(detail.before && detail.after) ||
    detail.skills.length > 0 ||
    (detail.outcomes?.length ?? 0) > 0 ||
    (detail.flow?.length ?? 0) > 0
  );
}

/**
 * 詳しい話の中身。
 *
 * 面（Card）を縦に積む。ここは**読む場所**なので、1画面に収める
 * 決まりは当てない——開いた人が自分で開いた一枚の中だからで、
 * 送れば最後まで読める。
 */
function LessonDetailBody({
  goal,
  before,
  after,
  skills,
  outcomes,
  flow,
}: LessonDetailContent) {
  return (
    <div className="space-y-4 pb-2">
      {goal && (
        <Card>
          <CardHeading icon={IconTarget} tone="plain">
            今日のねらい
          </CardHeading>
          <p data-testid="outcome-goal" className="mt-2 text-sm leading-7">
            {goal}
          </p>
        </Card>
      )}

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

      {flow && flow.length > 0 && (
        <Card>
          <CardHeading icon={IconList} tone="plain">
            この後の流れ
          </CardHeading>
          {/*
            番号付きで出す。何歩あるかではなく、**どういう順で何をするか**
            が分かればよい（歩数は帯が持っている）。
          */}
          <ol
            data-testid="outcome-flow"
            className="mt-3 space-y-1.5 text-sm leading-6"
            role="list"
          >
            {flow.map((phase, index) => (
              <li key={phase} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-xs font-bold tabular-nums text-brand">
                  {index + 1}
                </span>
                {phase}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {skills.length > 0 && (
        <Card>
          <CardHeading icon={IconTarget} tone="plain">
            今日覚えるAI技
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

      {outcomes && outcomes.length > 0 && (
        <Card>
          <CardHeading icon={IconCheckCircle} tone="plain">
            終えたらできること
          </CardHeading>
          <ul data-testid="outcome-after-lesson" className="mt-3 space-y-1.5" role="list">
            {outcomes.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm leading-6">
                <IconCheckCircle className="mt-1 h-4 w-4 shrink-0 text-brand" />
                {line}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** 「詳しく見る」の中身。画面いっぱいに近い一枚で、中は縦に送れる。 */
export function LessonDetailModal({
  onClose,
  ...detail
}: LessonDetailContent & { onClose: () => void }) {
  return (
    <MoreSheet
      placement="full"
      testId="lesson-detail-sheet"
      title="このレッスンについて"
      onClose={onClose}
    >
      <div data-testid="lesson-detail">
        <LessonDetailBody {...detail} />
      </div>
    </MoreSheet>
  );
}

/**
 * レッスンを開いた最初の一枚。
 *
 * 置くのは4つだけ。見出し・一言・ポーのひとこと・できること2つ。
 * **詰め込まない**——ここで迷わせると、始める前に閉じられる。
 */
export function LessonIntroModal({
  eyebrow,
  title,
  description,
  poMessage,
  outcomes,
  onStart,
  onDetail,
  onClose,
}: {
  /** 「Lesson 1」。どこに居るかの手がかり。 */
  eyebrow?: string;
  title: string;
  description?: string;
  /** ポーのひとこと。 */
  poMessage: string;
  outcomes?: string[];
  /** 「さっそく試す」。閉じて、そのまま次の画面へ。 */
  onStart: () => void;
  /** 「詳しく見る」。無ければ出さない。 */
  onDetail?: () => void;
  onClose: () => void;
}) {
  return (
    <MoreSheet
      placement="center"
      testId="lesson-intro-sheet"
      title={eyebrow ?? "今日のレッスン"}
      onClose={onClose}
    >
      <div data-testid="lesson-intro" className="pb-1">
        <h3 className="text-xl font-bold leading-[1.45]">{title}</h3>

        {/*
          短い説明は、ポーに言わせる。

          前は見出しの下に説明の段落を置き、そのすぐ下にポーの吹き出しを
          重ねていた。**同じことを2回言っている**——「読む相手と言い方を
          伝えて…」の下で、ポーが「まず、できあがりを見てみましょう」と
          もう一度言う形になる。

          実際に測ると、いちばん低い持ち方（402×660）でここが 54px
          あふれ、「詳しく見る」が画面の下に隠れていた。段落とポーで
          213px——一枚に使える 459px の半分近くを、同じ役の2つが取る。

          1つにまとめる。ポーは案内役なので、今日やることは**ポーの
          言葉として**出るほうが自然で、段落ぶんの高さがそのまま浮く。
          ポーは小さくしない（`md`）。飾りとして端に置くと、誰が言って
          いるのか分からなくなる。
        */}
        <div className="mt-3">
          <PoSpeech
            emotion="talking"
            message={description ?? poMessage}
            size="md"
            scene="start"
          />
        </div>

        {outcomes && outcomes.length > 0 && (
          /*
            2つまで。3つ目からは「詳しく見る」の中にある。
            ここは決める材料で、一覧ではない。
          */
          <ul className="mt-3 space-y-1.5" role="list" data-testid="lesson-intro-outcomes">
            {outcomes.slice(0, 2).map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm leading-6">
                <IconCheckCircle className="mt-1 h-4 w-4 shrink-0 text-brand" />
                {line}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <button
            type="button"
            onClick={onStart}
            data-testid="lesson-intro-start"
            className="flex min-h-[3rem] w-full items-center justify-center rounded-cta
                       bg-brand px-4 text-base font-bold text-white shadow-cta
                       transition active:scale-[0.99]"
          >
            さっそく試す
          </button>
          {onDetail && (
            /*
              副は文字だけにする。並べて2つとも面にすると、どちらを
              押せばよいのか決められない。
            */
            <button
              type="button"
              onClick={onDetail}
              data-testid="lesson-intro-detail"
              className="mt-2 flex min-h-[2.5rem] w-full items-center justify-center
                         rounded-cta px-4 text-sm font-bold text-brand-dark
                         transition hover:bg-brand-soft"
            >
              詳しく見る
            </button>
          )}
        </div>
      </div>
    </MoreSheet>
  );
}

/** 「今日やることの全体図」。絵1枚だけを中央に浮かべる。 */
export function LessonOverviewModal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <MoreSheet
      bleed
      placement="center"
      testId="lesson-overview-sheet"
      title="今日やることの全体図"
      onClose={onClose}
    >
      {children}
    </MoreSheet>
  );
}
