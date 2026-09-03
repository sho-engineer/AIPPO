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
import type { LessonPlan } from "../../course/lessonPlan";

export interface LessonDetailContent {
  /** ねらい。1行。 */
  goal?: string;
  before?: string;
  after?: string;
  /**
   * むずかしい言葉の言いかえ。Before / After の下に並べる。
   *
   * 材料は `course/lessonPlan.ts`。教材の本文ではなく図の材料なので、
   * 3層（同梱・seed・配信）には持たせていない。
   */
  swaps?: { from: string; to: string }[];
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
  swaps,
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

          {/*
            何がどう変わったか。

            2つの文を並べるだけだと、**読み比べる仕事**が残る。長い専門文と
            長い説明文を突き合わせて、どこが対応しているかを自力で探させる
            ことになり、分かりやすくなった実感より先に読む負担が来る。

            言葉の対応を3組だけ抜き出して並べる。「意味は同じまま、
            言い方が変わった」ことが、読まなくても形で分かる。
            **削られたのではなく、言いかえられた**ことが伝わればよい。
          */}
          {swaps && swaps.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-bold text-ink-muted">
                むずかしい言葉は、こう変わりました
              </h3>
              <ul className="mt-2 space-y-1.5" role="list" data-testid="outcome-swaps">
                {swaps.map((swap) => (
                  <li
                    key={swap.from}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5
                               rounded-card bg-canvas px-3 py-2 text-sm leading-6"
                  >
                    <span className="text-ink-muted line-through">{swap.from}</span>
                    <IconArrowDown
                      className="h-3.5 w-3.5 shrink-0 -rotate-90 text-brand"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 font-bold text-brand-dark">{swap.to}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
 * 「今日やること」の図。
 *
 * 読ませずに見せる
 * ----------------
 * 前はここが説明文だった。見出し・一言・できること2つが縦に並び、
 * 始める前に**読み物を1本読ませる**形になっていた。文章で書くと、
 * どれだけ短くしても「読んでから決める」になる。
 *
 * やることは3手しかない。元の文章を渡し、条件を足して頼み、
 * 分かりやすい説明が返る。**その3手をそのまま縦に置く。**
 *
 *     [専門的な文章]      渡すもの
 *          ↓
 *      AIに頼む           そのとき足す条件が2つ
 *      ＋ 誰向け？
 *      ＋ どんな言い方？
 *          ↓
 *     [分かりやすい説明]  返ってくるもの
 *
 * 足す2つを図に描くのは、そこが**この回で覚えること**そのものだから。
 * 文章で「ターゲット指定とトーン指定を学びます」と書くより、
 * 矢印の途中に置いたほうが、何が効いたのかを後で思い出せる。
 */
function TodayPlanFigure({
  plan,
  source,
  result,
}: {
  plan: LessonPlan;
  source: string;
  result: string;
}) {
  return (
    /*
      外枠は付けない。中の3つが自分の面を持っているので、その外に
      もう1枚敷くと**枠の中の枠**になり、いちばん低い持ち方では
      その 24px ぶんが下の「詳しく見る」を画面の外へ押し出す。
    */
    <div data-testid="today-plan">
      <PlanBox
        label={plan.sourceLabel}
        text={source}
        tone="plain"
        testId="today-plan-source"
      />

      <PlanArrow />

      {/*
        矢印の途中。ここが**この回の中身**なので、面を1枚立てて
        目を止める。上下の箱（渡すもの・返るもの）は素材で、
        学ぶのはこの2行のほう。
      */}
      <div className="rounded-card bg-brand-soft/50 px-3 py-1.5 ring-1 ring-brand-line">
        <p className="text-center text-xs font-bold text-brand-dark">AIに頼む</p>
        <ul className="mt-1 space-y-0.5" role="list" data-testid="today-plan-additions">
          {plan.additions.slice(0, 2).map((add) => (
            <li key={add.label} className="flex items-baseline gap-1.5 text-xs">
              <span className="shrink-0 font-bold text-brand">＋</span>
              <span className="shrink-0 text-ink-muted">{add.label}</span>
              <span className="min-w-0 font-bold">{add.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <PlanArrow />

      <PlanBox
        label={plan.resultLabel}
        text={result}
        tone="brand"
        testId="today-plan-result"
      />
    </div>
  );
}

/** 図の上下に置く、渡すもの／返るもの。中身は1行だけ見せる。 */
function PlanBox({
  label,
  text,
  tone,
  testId,
}: {
  label: string;
  text: string;
  tone: "plain" | "brand";
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`rounded-card px-3 py-1 ${
        tone === "brand"
          ? "bg-brand-soft ring-1 ring-brand-line"
          : "bg-canvas ring-1 ring-line"
      }`}
    >
      {/*
        呼び名と中身を**同じ行に**置く。縦に積むと1組で 52px 取り、
        上下2組で 104px——いちばん低い持ち方では、それだけで
        「詳しく見る」が画面の外へ出る。

        中身は1行で切る。ここは**どんなものが入るか**が分かればよく、
        読む場所は本編にある（「詳しく見る」で全文が出る）。
        全文を置くと図が文章に戻る。
      */}
      <p className="flex items-baseline gap-2 text-xs leading-6">
        <span
          className={`shrink-0 font-bold ${
            tone === "brand" ? "text-brand-dark" : "text-ink-muted"
          }`}
        >
          {label}
        </span>
        <span className="min-w-0 truncate text-ink">{text}</span>
      </p>
    </div>
  );
}

function PlanArrow() {
  return (
    <div className="flex justify-center" aria-hidden="true">
      <IconArrowDown className="h-3 w-3 text-brand" />
    </div>
  );
}

/**
 * レッスンを開いた最初の一枚。
 *
 * 置くのは4つだけ。今日やることの図・ポーのひとこと・ゴール1行・
 * 押す先。**詰め込まない**——ここで迷わせると、始める前に閉じられる。
 */
export function LessonIntroModal({
  goalLine,
  plan,
  source,
  result,
  poMessage,
  onStart,
  onDetail,
  onClose,
}: {
  /**
   * ゴール1行。
   *
   * できることを何個も並べない。3つ並べると、始める前に
   * 「覚えることが3つある」に見える。残りは「詳しく見る」の中。
   */
  goalLine?: string;
  /** 図の材料。無ければ図を出さない。 */
  plan?: LessonPlan | null;
  /** 図の上の箱に出す、元の文章。 */
  source?: string;
  /** 図の下の箱に出す、できあがり。 */
  result?: string;
  /** ポーのひとこと。 */
  poMessage: string;
  /** 「さっそく試す」。閉じて、そのまま次の画面へ。 */
  onStart: () => void;
  /** 「詳しく見る」。無ければ出さない。 */
  onDetail?: () => void;
  onClose: () => void;
}) {
  const figure = plan && source && result;

  return (
    <MoreSheet
      placement="center"
      testId="lesson-intro-sheet"
      title="今日やること"
      onClose={onClose}
    >
      <div data-testid="lesson-intro" className="pb-1">
        {figure ? (
          <TodayPlanFigure plan={plan} source={source} result={result} />
        ) : null}

        {/*
          ポーは図の**すぐ下**に置く。図を見た人が次に知りたいのは
          「で、自分は何をするの？」で、そこに一言だけ答える役。
          小さくしない（`md`）——飾りとして端に置くと、誰が言って
          いるのか分からなくなる。
        */}
        <div className={figure ? "mt-1.5" : ""}>
          <PoSpeech
            emotion="talking"
            message={plan?.poLine ?? poMessage}
            size="md"
            scene="start"
          />
        </div>

        {goalLine && (
          /*
            ゴールは**1行だけ**。何個も並べると、始める前に
            「覚えることが3つある」に見える（残りは「詳しく見る」の中）。

            印は付けない。ポーの吹き出しのすぐ下なので、丸い印を足すと
            吹き出しの続きの箇条書きに見える。
          */
          <p
            data-testid="lesson-intro-goal"
            className="mt-1.5 text-xs leading-5 text-ink-muted"
          >
            {goalLine}
          </p>
        )}

        <div className="mt-2.5">
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
