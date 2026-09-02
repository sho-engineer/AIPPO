/**
 * レッスンの最初の画面（Lesson Overview）。
 *
 * 開いて最初に出るのはこれ。説明を先に読ませず、
 * **今日つくるものを1枚で見せる。**
 *
 *     [レッスン名]        … StepShell の見出しが出す
 *     [1枚の絵]           … 教材として作った1枚（切り取らない）
 *     ポー「今日はこれをやってみよう！」
 *     [はじめる]           … StepShell のボタンが出す
 *
 * 絵の上下に長い説明を積まない
 * ----------------------------
 * 積むと、絵を見る前に読み下すことになり、1枚で伝える意味が消える。
 * ここに置くのは、絵と、所要時間の一言だけ。
 *
 * それでも詳しい話はここが持つ
 * ----------------------------
 * ねらい・完成イメージ（Before / After）・流れ・覚えるAI技・
 * 使いどころ・終えたらできること——**これらの持ち主はこの画面**。
 * コースの一覧から持ってきた（あちらは「いまどこ・次はこれ」に絞った）。
 *
 * ただし最初から開いては置かない。読みたい人が「くわしく見る」を
 * 押したときに開く。押す前に何が出るかは、見出しに書いておく
 * ——中身の分からない折りたたみは、誰も押さない。
 *
 * `<details>` で作る。自前の開閉にすると、キーボードと読み上げから
 * 「いま開いているか」が分からなくなる。
 */

import { useState } from "react";

import { Card, CardHeading, MetaPill } from "../../AppShell";
import { MoreButton, MoreSheet } from "../MoreSheet";
import {
  IconArrowDown,
  IconBars,
  IconCheckCircle,
  IconClock,
  IconList,
  IconSparkle,
  IconTarget,
} from "../../Icons";
import { LessonThumbnail } from "../../lessons/LessonThumbnail";
import { TeachingImage } from "../../lessons/TeachingImage";
import type { TeachingImageEntry } from "../../../course/teachingImages";

// ----------------------------------------------------------- 完成イメージ

export function OutcomePreview({
  minutes,
  goal,
  before,
  after,
  skills,
  outcomes,
  flow,
  overview,
  thumbnail,
}: {
  minutes?: number;
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
  /**
   * このレッスンのために作った1枚。無ければ null。
   *
   * **切り取らない。** 1枚で説明が完結しているので、端が欠けると
   * 図の一部（矢印の先や、まとめの帯）が消える。
   */
  overview?: TeachingImageEntry | null;
  /** 専用の1枚が無いときに代わりに出す、一覧と同じ絵。 */
  thumbnail?: string | null;
}) {
  const [overviewOpen, setOverviewOpen] = useState(false);

  const hasDetail =
    Boolean(goal) ||
    Boolean(before && after) ||
    skills.length > 0 ||
    (outcomes?.length ?? 0) > 0 ||
    (flow?.length ?? 0) > 0;

  return (
    /*
      縦の flex にして、絵にだけ「残りの高さ」を渡す。
      下の2つ（かかる時間・くわしく）は自分の高さのまま動かない。
    */
    <div data-testid="outcome-preview" className="flex min-h-0 flex-1 flex-col gap-3">
      {/*
        1枚の絵。この画面の主役。

        教材として作った絵で、アプリの画面を写したものではない
        （course/lessonOverview.ts）。専用の1枚がまだ無いレッスンでは
        一覧と同じ絵で代える——絵の場所を空けて待たない。

        代わりの絵だけは 4:3 を切り取って出す（一覧と同じ見え方に
        そろえるため）。専用の1枚は切り取らない。
      */}
      {overview ? (
        /*
          全体図は**押したら開く一枚**にする。

          1画面＝1アクションに収めると、この絵に渡せる高さは 30px しか
          残らない（Pixel 5 で実測）。読めない絵を置くくらいなら、
          一手ぶん押してもらって**大きく**見せるほうがよい。

          前は開いた状態で置いていた（畳める `<details>`）。原寸で
          391px あり、この画面が 331px はみ出す一番の原因だった。
        */
        <div className="shrink-0" data-testid="outcome-overview">
          <MoreButton
            testId="outcome-overview-toggle"
            onClick={() => setOverviewOpen(true)}
          >
            今日やることの全体図を見る
          </MoreButton>
          {overviewOpen && (
            /*
              絵に幅を全部渡す（`bleed`）。一枚の高さの上限は画面の 8 割のまま。

              左右の余白をやめるだけで 353px → 393px になる。この絵は
              ほぼ正方形で、スマホでは**幅が上限**なので、ここが効く。
              高さのほうを 8 割で固定しても絵は大きくならず、白い余白が
              135px 増えるだけだった（実測して戻した。MoreSheet の `bleed` に経緯がある）。

              全画面にはしない。上に下の画面が少し見えていることが、
              「戻れる」の手がかりになる。
            */
            <MoreSheet
              bleed
              title="今日やることの全体図"
              onClose={() => setOverviewOpen(false)}
            >
              <TeachingImage
                src={overview.src}
                alt={overview.alt}
                width={overview.width}
                height={overview.height}
                className="rounded-none"
              />
            </MoreSheet>
          )}
        </div>
      ) : (
        thumbnail && (
          <div className="shrink-0">
            <LessonThumbnail src={thumbnail} variant="banner" />
          </div>
        )
      )}

      {/*
        始める前に知りたいのは、かかる時間とむずかしさの2つだけ。

        ただし**絵が時間を言っているなら、ここは黙る**。
        Day1〜8 の全体図には「学習時間の目安」が焼き込まれていて、
        そのすぐ下にアプリの数字を出すと、同じ画面に数字が2つ並ぶ。

        揃っていても2つは要らないし、揃っていないときは**どちらが
        正しいか絵を見ても分からない**（Day1 は実際にずれていて、
        絵が「約3分」、アプリが「8分」だった）。絵の中の数字は
        動かせないので、下げるのはこちら側になる
        （course/teachingImages.ts の `showsMinutes`）。

        ずれ自体は別のところで見張る。絵が何と言っているかを
        `scripts/teaching-images/overviews.json` に控えてあり、
        教材データと食い違うと `tests/teachingImageFacts.test.ts` が落ちる。
      */}
      {/*
        面に載せない。**多くの回で中身が「初級」の一語**になる
        （絵が時間を言っていれば、こちらは黙るため）。一語のために
        白い面と影を1枚使うと 54px 取る——iPhone の Safari（上下の帯が
        出ている高さ）では、それだけでこの画面がはみ出していた。
      */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 px-1">
        {minutes !== undefined && !overview?.showsMinutes && (
          <MetaPill icon={IconClock} label="所要時間" value={`${minutes}分`} />
        )}
        <MetaPill icon={IconBars} value="初級" />
      </div>

      {hasDetail && (
        <details data-testid="outcome-detail" className="group shrink-0">
          {/*
            何が出るかを書いておく。「くわしく」だけだと、中身が
            分からないので誰も押さない。
          */}
          <summary
            data-testid="outcome-detail-toggle"
            className="row-tap cursor-pointer list-none rounded-card bg-surface px-5 py-3
                       text-sm font-bold shadow-card transition hover:bg-brand-soft/50"
          >
            <span className="flex items-center gap-2">
              <IconList className="h-4 w-4 shrink-0 text-brand" />
              <span className="min-w-0 flex-1">くわしく見る</span>
              <span className="shrink-0 text-xs font-normal text-ink-muted">
                ねらい・流れ・覚えるAI技
              </span>
            </span>
          </summary>

          <div className="mt-4 space-y-4">
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
                  番号付きで出す。何歩あるかではなく、**どういう順で
                  何をするか**が分かればよい（歩数は帯が持っている）。
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
                <ul
                  data-testid="outcome-after-lesson"
                  className="mt-3 space-y-1.5"
                  role="list"
                >
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
        </details>
      )}
    </div>
  );
}
