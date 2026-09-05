/**
 * レッスンを開いた最初に出す一枚と、その「詳しく見る」。
 *
 * なぜ二段にするか
 * ----------------
 * 最初の画面には、開いた人がその場で決めたいことしか無い——
 * **今日は何をするのか／始めてよいか**の2つ。ところが持っている
 * ものは多い（ねらい・完成イメージ・覚えること・できること・
 * 全体図の1枚）。全部を画面に積むと、始める前に読み物が1本になる。
 *
 * そこで三段にする。
 *
 *     開始画面 … 見出し・一言・ポー・「さっそく試す」と
 *                「今日やることを見る」の2つだけ
 *     今日やること … 中央に浮かぶ一枚。**3手の図**とポーと押す先。
 *                    ここから全体図と詳細へ行ける
 *     詳細 … 「詳しく見る」を押した人にだけ、画面いっぱいの一枚で
 *            全部出す。ここは縦に送ってよい
 *
 * **モーダルは読ませる場所ではなく、次へ進ませる入口**という決め方。
 * 導入の一枚に置くのは、押す先が1つあることと、その判断に要る分だけ。
 *
 * 入口を1つの画面に3つ並べない
 * ----------------------------
 * 前は開始画面に「全体図を見る」「詳しく見る」「初級」が同じ強さで
 * 並び、下の帯に「さっそく試す」があった。**どれを押せばよいのか
 * 決められない**。奥のものは奥から辿る形にして、開始画面は2つに絞る。
 *
 * 下から出す形にしない
 * --------------------
 * 下から出る一枚は「送れば続きがある」を匂わせる。ここは**見て、
 * 進む**場面なので中央に浮かべる（`MoreSheet` の `placement`）。
 */

import type { ReactNode } from "react";

import { MoreSheet } from "./MoreSheet";
import {
  IconArrow,
  IconArrowDown,
  IconBookmark,
  IconCheckCircle,
  IconChecklist,
  IconDocument,
  IconPerson,
  IconTarget,
} from "../Icons";
import { PoSpeech } from "../../po/PoSpeech";
import { openingClause, type LessonPlan } from "../../course/lessonPlan";

export interface LessonDetailContent {
  /** ねらい。1行。 */
  goal?: string;
  /** ねらいに添える一言（`course/lessonPlan.ts`）。 */
  goalNote?: string;
  before?: string;
  after?: string;
  /** Before / After に添える一言（`course/lessonPlan.ts`）。 */
  changeNote?: string;
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
}

/** 詳しい話が1つでもあるか。無ければ「詳しく見る」を出さない。 */
export function hasLessonDetail(detail: LessonDetailContent): boolean {
  return (
    Boolean(detail.goal) ||
    Boolean(detail.before && detail.after) ||
    detail.skills.length > 0 ||
    (detail.outcomes?.length ?? 0) > 0
  );
}

/**
 * 節の見出し。**印は線画1つ、面は敷かない。**
 *
 * 前は節ごとに白い面（`Card`）を立てていた。5枚が縦に積まれると、
 * どこまでが1つの話なのかは分かるが、**どれも同じ重さで並ぶ**ので
 * 順に読み下すしかなくなる。SaaS の設定画面と同じ形。
 *
 * ここは教材のページなので、見出し → 中身 → 区切り線 の素直な形に
 * 戻す。面で囲うのは、囲うことに意味がある場所（Before / After）だけ。
 */
function DetailSection({
  icon: Icon,
  title,
  children,
  first = false,
}: {
  icon: typeof IconTarget;
  title: string;
  children: ReactNode;
  /** 先頭の節。上の区切り線を付けない。 */
  first?: boolean;
}) {
  return (
    <section className={first ? "" : "mt-5 border-t border-line pt-5"}>
      <h2 className="flex items-center gap-2 text-sm font-bold">
        <Icon className="h-[1.125rem] w-[1.125rem] shrink-0 text-brand" />
        {title}
      </h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/**
 * 詳しい話の中身。
 *
 * 節は4つだけ
 * -----------
 *     今日のねらい       … 何ができるようになるか
 *     完成イメージ       … Before / After
 *     覚えること         … 受け取る技の名前
 *     終わったらできること
 *
 * 「この後の流れ」は外した。歩数と現在地は**帯が出しっぱなしで持って
 * いる**（`lesson-progress`）し、段の頭では章扉が名前を出す。始める前に
 * もう一度並べても、読む量が増えるだけで決めやすくはならない。
 *
 * 上の2つだけは、送らずに読める
 * -----------------------------
 * 送れることと、送らないと要点が分からないことは別。開いた瞬間に
 * 見えているのは「今日のねらい」と「完成イメージ」で、そこまでで
 * 始めるかどうかは決められる。残りは決めたあとに読む人のためのもの。
 *
 * 印は控えめに、文字は少なく
 * --------------------------
 * 前は「完成イメージ」の印がキラキラ（`IconSparkle`）だった。魔法や
 * AI らしさの記号で、**学習アプリの節の見出しに付くものではない**。
 * 中身も 202字の専門文を丸ごと置いていて、始める前にいちばん難しい
 * 文章を読み下させていた。印は単色の線画、例文は見せるぶんだけに絞る。
 */
function LessonDetailBody({
  goal,
  goalNote,
  before,
  after,
  changeNote,
  swaps,
  skills,
  outcomes,
}: LessonDetailContent) {
  const sections: ReactNode[] = [];

  if (goal) {
    sections.push(
      <DetailSection key="goal" icon={IconTarget} title="今日のねらい" first>
        {/*
          リード1文。ここだけ本文より少し大きくする——この一枚で
          いちばん先に目に入ってほしいのがこの行なので。
        */}
        <p data-testid="outcome-goal" className="text-[0.9375rem] font-bold leading-7">
          {goal}
        </p>
        {goalNote && (
          <p className="mt-1.5 text-xs leading-6 text-ink-muted">{goalNote}</p>
        )}
      </DetailSection>,
    );
  }

  if (before && after) {
    sections.push(
      /*
        印は書類にする。前はキラキラだったが、あれは「魔法で変わる」の
        記号で、ここで見せたいこと——**同じ内容の、書き方だけ違う2つ**
        ——と逆のことを言っていた。
      */
      <DetailSection
        key="example"
        icon={IconDocument}
        title="完成イメージ"
        first={sections.length === 0}
      >
        {/*
          上下に並べて、あいだに矢印を落とす。
          横並びだと「左右にある2つ」で終わり、
          片方がもう片方に変わったことが読み取れない。

          **ここだけは面で囲う。**同じ内容の2つの書き方を見比べる場所で、
          どこからどこまでが片方なのかが形で分かる必要がある。
        */}
        <section className="rounded-card bg-canvas px-3.5 py-3">
          <h3 className="text-[0.6875rem] font-bold tracking-wide text-ink-muted">
            Before
          </h3>
          {/*
            元の文は**見せるぶんだけ**（`openingClause`）。全文は本編で
            読む。ここに 202字の専門文を置くと、始めるかどうかを決める
            前に、いちばん難しい文章を読み下すことになる。
          */}
          <p data-testid="outcome-before" className="mt-1 text-sm leading-6">
            {openingClause(before)}
          </p>
        </section>

        <div className="flex justify-center py-1" aria-hidden="true">
          <IconArrowDown className="h-4 w-4 text-brand" />
        </div>

        <section className="rounded-card bg-brand-soft px-3.5 py-3 ring-1 ring-brand-line">
          <h3 className="text-[0.6875rem] font-bold tracking-wide text-brand-dark">
            After
          </h3>
          {/*
            できあがりは**丸ごと出す**。

            前は1文目だけだった（`firstSentence`）。切るのは元の文と
            同じ扱いにしたつもりだったが、両者は役目が違う——元の文は
            「難しい」が伝わればよく、できあがりは**元の意味が残って
            いること**そのものが見せたいもの。1文で切ると、落ちた側が
            見えないまま「短くなっただけ」に見える。

            切らずに済むのは、できあがりが2文しかないから
            （`catalog.ts` の `afterExample`）。長い教材が来たら、
            そのときは切り方をここで決め直す。
          */}
          {after.split("\n").map((line) => (
            <p
              key={line}
              data-testid="outcome-after"
              className="mt-1 text-sm leading-6"
            >
              {line}
            </p>
          ))}
        </section>

        {changeNote && (
          /*
            並べただけでは「別の文になった」で終わる。**意味は変えて
            いない**ことは形からは読み取れないので、1行だけ言う。
          */
          <p className="mt-2.5 text-xs leading-6 text-ink-muted">{changeNote}</p>
        )}

        {/*
          言葉の対応。ここは**証拠**なので、要点（上の Before / After）の
          下に置く。開いた最初の画面に置くと、要点と証拠が同じ重さで
          並んで、どちらを読めばよいのか決められなくなる。
        */}
        {swaps && swaps.length > 0 && (
          <div className="mt-3.5">
            <h3 className="text-xs font-bold text-ink-muted">
              むずかしい言葉は、こう言いかえます
            </h3>
            <ul className="mt-2 space-y-1" role="list" data-testid="outcome-swaps">
              {swaps.map((swap) => (
                /*
                  矢印は**行き先の側に付ける**。前は3つを横に並べていて、
                  幅が足りない行だけ「元の言葉 →」で折り返し、矢印だけが
                  前の行に取り残されていた（Multi-Head Attention で実際に
                  そうなった）。行き先と同じ塊にしておけば、折り返しても
                  「→ 行き先」でひとまとまりになる。
                */
                <li
                  key={swap.from}
                  className="flex flex-wrap items-baseline gap-x-1.5 text-xs leading-6"
                >
                  <span className="text-ink-muted">{swap.from}</span>
                  <span className="flex min-w-0 items-baseline gap-1">
                    <IconArrow
                      className="h-3 w-3 shrink-0 translate-y-px text-brand"
                      aria-hidden="true"
                    />
                    <span className="font-bold">{swap.to}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DetailSection>,
    );
  }

  if (skills.length > 0) {
    sections.push(
      /*
        ねらいと同じ印（的）を使わない。同じ形が2回出ると、同じ話の
        続きに見える——「ねらい」と「覚えること」は別のもの。
      */
      <DetailSection
        key="skills"
        icon={IconBookmark}
        title="覚えること"
        first={sections.length === 0}
      >
        {/*
          できるようになることは押せない。だから pill にはしない。
          淡い青の丸で囲うと「選べる候補」に見え、押してみて何も
          起きない、という無反応を作る。印と文字だけで足りる。
        */}
        <ul className="space-y-1.5" role="list" data-testid="outcome-skills">
          {skills.map((skill) => (
            <li key={skill} className="flex items-start gap-2 text-sm leading-6">
              <IconCheckCircle className="mt-1 h-4 w-4 shrink-0 text-brand" />
              {skill}
            </li>
          ))}
        </ul>
      </DetailSection>,
    );
  }

  if (outcomes && outcomes.length > 0) {
    sections.push(
      <DetailSection
        key="outcomes"
        icon={IconChecklist}
        title="終わったらできること"
        first={sections.length === 0}
      >
        <ul data-testid="outcome-after-lesson" className="space-y-1.5" role="list">
          {outcomes.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm leading-6">
              <IconCheckCircle className="mt-1 h-4 w-4 shrink-0 text-brand" />
              {line}
            </li>
          ))}
        </ul>
      </DetailSection>,
    );
  }

  return <div className="pb-2">{sections}</div>;
}

/** 「詳しく見る」の中身。画面いっぱいに近い一枚で、中は縦に送れる。 */
export function LessonDetailModal({
  onClose,
  onStart,
  ...detail
}: LessonDetailContent & {
  onClose: () => void;
  /**
   * 読み終えた人の出口。
   *
   * 無ければ×で閉じるだけになる。読み切った人がいちばん進みたい
   * ところなのに、そこで**戻る操作を1つ挟ませる**ことになるので、
   * 押せる先をここにも置く。
   */
  onStart?: () => void;
}) {
  return (
    <MoreSheet
      placement="full"
      testId="lesson-detail-sheet"
      title="このレッスンについて"
      onClose={onClose}
    >
      <div data-testid="lesson-detail">
        <LessonDetailBody {...detail} />

        {onStart && (
          <div className="pb-1 pt-1">
            <button
              type="button"
              onClick={onStart}
              data-testid="lesson-detail-start"
              className="flex min-h-[3rem] w-full items-center justify-center rounded-cta
                         bg-brand px-4 text-base font-bold text-white shadow-cta
                         transition active:scale-[0.99]"
            >
              さっそく試す
            </button>
          </div>
        )}
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
        icon={IconDocument}
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

        印はチェックにする。**これから足す条件**であって、AIが
        勝手にやることではない——決めるのは自分だと形で言う。
      */}
      <div
        className="flex items-start gap-2.5 rounded-card bg-brand-soft/50 px-3 py-1.5
                   ring-1 ring-brand-line [@media(min-height:700px)]:py-2"
        data-testid="today-plan-ask"
      >
        <IconPerson className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-brand-dark">AIに伝える</p>
          <ul className="mt-1 space-y-0.5" role="list" data-testid="today-plan-additions">
            {plan.additions.slice(0, 2).map((add) => (
              <li key={add.label} className="flex items-baseline gap-1.5 text-xs leading-5">
                <IconCheckCircle
                  className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-brand"
                  aria-hidden="true"
                />
                <span className="shrink-0 text-ink-muted">{add.label}</span>
                <span className="min-w-0 font-bold">{add.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <PlanArrow />

      <PlanBox
        icon={IconDocument}
        label={plan.resultLabel}
        text={result}
        tone="brand"
        testId="today-plan-result"
      />
    </div>
  );
}

/**
 * 図の上下に置く、渡すもの／返るもの。
 *
 * 中身は2行まで見せる
 * -------------------
 * 前は1行で切っていた（`truncate`）。高さは詰まるが、**どちらの箱も
 * 同じ長さの帯**になり、専門的な文章と分かりやすい説明を並べた意味が
 * 消えていた。ここは「難しい → やさしい」を目で見せる場所なので、
 * 難しさとやさしさが見えるだけの文字数は要る。
 *
 * 2行で切るのは `line-clamp-2`。全文は本編で読む——全部置くと、
 * 図がまた文章に戻る。
 */
function PlanBox({
  icon: Icon,
  label,
  text,
  tone,
  testId,
}: {
  icon: typeof IconDocument;
  label: string;
  text: string;
  tone: "plain" | "brand";
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`flex items-start gap-2.5 rounded-card px-3 py-1.5
                  [@media(min-height:700px)]:py-2 ${
        tone === "brand"
          ? "bg-brand-soft ring-1 ring-brand-line"
          : "bg-canvas ring-1 ring-line"
      }`}
    >
      <Icon
        className={`mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 ${
          tone === "brand" ? "text-brand" : "text-ink-muted"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p
          className={`text-xs font-bold ${
            tone === "brand" ? "text-brand-dark" : "text-ink-muted"
          }`}
        >
          {label}
        </p>
        {/*
          2行まで。**いちばん低い持ち方（402×660）でだけ1行に落とす。**

          そこでは一枚に使える高さが 63px 足りず、下の「全体図を見る・
          詳しく見る」が画面の外へ出ていた。減らす先は文章の側にする
          ——3手の並びとポーと押す先は、この一枚の用そのものなので。
        */}
        <p
          className="mt-0.5 line-clamp-1 text-xs leading-5 text-ink
                     [@media(min-height:700px)]:line-clamp-2"
        >
          {text}
        </p>
      </div>
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
 * 置くのは4つだけ。3手の図・ポーのひとこと・押す先・その奥への細い道。
 * **詰め込まない**——ここで迷わせると、始める前に閉じられる。
 *
 * 奥への道は、ここが持つ
 * ----------------------
 * 「全体図を見る」と「詳しく見る」は、前は開始画面に並んでいた。
 * どちらも**始めるかどうかの判断には要らない**ものなので、一段奥へ
 * 下げる。ここまで開いた人は「もう少し見たい」人なので、細い文字の
 * リンクで足りる（`§11 推奨導線`）。
 */
export function LessonIntroModal({
  goalLine,
  minutes,
  plan,
  source,
  result,
  poMessage,
  onStart,
  onDetail,
  onOverview,
  onClose,
}: {
  /**
   * ゴール1行。
   *
   * できることを何個も並べない。3つ並べると、始める前に
   * 「覚えることが3つある」に見える。残りは「詳しく見る」の中。
   */
  goalLine?: string;
  /**
   * かかる時間。ポーの一言に足す。
   *
   * 開始画面から「所要時間」の札を外したので、**時間を言う場所は
   * ここ1つ**になった。数字を独立した札にせず、ポーの言葉に混ぜる
   * ——「3分で終わる」は仕様ではなく、背中を押す一言なので。
   */
  minutes?: number;
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
  /** 「全体図を見る」。絵を持たない教材では無い。 */
  onOverview?: () => void;
  onClose: () => void;
}) {
  const figure = plan && source && result;
  const line = plan?.poLine ?? poMessage;
  const bubble =
    minutes === undefined ? line : `${line}\n約${minutes}分で終わるよ！`;

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
        <div className={figure ? "mt-2" : ""}>
          <PoSpeech emotion="talking" message={bubble} size="md" scene="start" />
        </div>

        {goalLine && !figure && (
          /*
            ゴールは**1行だけ**。何個も並べると、始める前に
            「覚えることが3つある」に見える（残りは「詳しく見る」の中）。

            図があるときは出さない。3つの箱が「何をするのか」を
            もう言っていて、同じことを文章でもう一度書くことになる
            ——読む量を減らすのがこの一枚の役目なので。

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

          {(onOverview || onDetail) && (
            /*
              奥への道は**文字だけ、横に並べて1行**にする。

              縦に積むと、面のボタンが1つと文字のボタンが2つで3段になり、
              いちばん低い持ち方では下が画面の外へ出る。どちらも
              「もう少し見たい人」向けなので、重さも同じでよい。
            */
            <div className="mt-1.5 flex items-center justify-center gap-1 text-xs">
              {onOverview && (
                <button
                  type="button"
                  onClick={onOverview}
                  data-testid="lesson-intro-overview"
                  className="rounded-cta px-3 py-1.5 font-bold text-brand-dark
                             transition hover:bg-brand-soft
                             [@media(min-height:700px)]:py-2"
                >
                  全体図を見る
                </button>
              )}
              {onOverview && onDetail && (
                <span className="text-line" aria-hidden="true">
                  ・
                </span>
              )}
              {onDetail && (
                <button
                  type="button"
                  onClick={onDetail}
                  data-testid="lesson-intro-detail"
                  className="rounded-cta px-3 py-1.5 font-bold text-brand-dark
                             transition hover:bg-brand-soft
                             [@media(min-height:700px)]:py-2"
                >
                  詳しく見る
                </button>
              )}
            </div>
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
