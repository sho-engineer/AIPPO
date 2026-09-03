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
 * ただし最初から開いては置かない。読みたい人が「詳しく見る」を
 * 押したときに開く。押す前に何が出るかは、見出しに書いておく
 * ——中身の分からない折りたたみは、誰も押さない。
 *
 * 開く先は**画面いっぱいの一枚**（`LessonDetailModal`）。前はこの場に
 * 畳んだ `<details>` で置いていたが、畳んでいても行1本ぶんの場所を取り、
 * 開けばその場でページが伸びた——1画面＝1アクションが崩れる。
 *
 * 入口はもう一枚ある
 * ------------------
 * この画面を開いた瞬間、中央に導入の一枚が浮かぶ（`LessonIntroModal`）。
 * 今日やることと「さっそく試す」だけを持たせて、**押す先を1つに絞る**。
 * ×で閉じればこの画面が残るので、行き止まりにはならない。
 */

import { useEffect, useState } from "react";

import { MetaPill } from "../../AppShell";
import { MoreButton } from "../MoreSheet";
import {
  hasLessonDetail,
  LessonDetailModal,
  LessonIntroModal,
  LessonOverviewModal,
} from "../LessonIntro";
import { IconBars, IconClock } from "../../Icons";
import { LessonThumbnail } from "../../lessons/LessonThumbnail";
import { TeachingImage } from "../../lessons/TeachingImage";
import type { TeachingImageEntry } from "../../../course/teachingImages";
import type { LessonPlan } from "../../../course/lessonPlan";

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
  plan,
  description,
  poMessage,
  onStart,
  introSeen = false,
  onIntroSeen,
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

  /**
   * 「今日やること」の図の材料（`course/lessonPlan.ts`）。
   *
   * 無ければ図を出さず、導入の一枚はポーの一言とゴールだけになる。
   * 材料がまだ無い教材で、空の枠だけを置かないため。
   */
  plan?: LessonPlan | null;
  /** 一言（`outcomeDescription`）。導入の一枚ではゴールの1行になる。 */
  description?: string;
  /** ポーのひとこと。 */
  poMessage: string;
  /**
   * 「さっそく試す」を押したとき。
   *
   * 導入の一枚は**次へ進ませる入口**なので、閉じるだけで終わらせない。
   */
  onStart?: () => void;
  /**
   * 導入の一枚を、このレッスンでもう出したか。
   *
   * この画面は**進んで戻ってくるたびに作り直される**ので、覚えるのは
   * 1つ上（`LessonRunner`）。渡されなければ毎回出す（検査で1枚だけ
   * 置くときのため）。
   */
  introSeen?: boolean;
  onIntroSeen?: () => void;
}) {
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  /*
    開いた最初に、導入の一枚を自分から出す。

    レッスンの冒頭は**読み物ではなく入口**にする。見出しと一言と
    できること2つだけを中央に浮かべ、押す先を1つに絞る。閉じた人には
    この後ろの画面が残る（同じ「さっそく試す」が下の帯にある）ので、
    行き止まりにはならない。
  */
  const [introOpen, setIntroOpen] = useState(!introSeen);
  /*
    出したことを1つ上へ伝える。描き終わってからにする——描いている
    最中に親を書き換えると、React が同じ回の中で描き直しにかかる。
  */
  useEffect(() => {
    if (introOpen) onIntroSeen?.();
  }, [introOpen, onIntroSeen]);

  const hasDetail = hasLessonDetail({ goal, before, after, skills, outcomes, flow });

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
              絵に幅を全部渡す（`bleed`）。一枚の高さの上限は画面の 8 割。

              左右の余白をやめるだけで 353px → 393px になる。この絵は
              ほぼ正方形で、スマホでは**幅が上限**なので、ここが効く。
              高さのほうを 8 割で固定しても絵は大きくならず、白い余白が
              135px 増えるだけだった（実測して戻した。MoreSheet の `bleed`）。
            */
            <LessonOverviewModal onClose={() => setOverviewOpen(false)}>
              <TeachingImage
                src={overview.src}
                alt={overview.alt}
                width={overview.width}
                height={overview.height}
                className="rounded-none"
              />
            </LessonOverviewModal>
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
        /*
          「詳しく見る」は**押した人にだけ**開く。

          前はこの場に畳んだ `<details>` で置いていた。畳んでいても
          行1本ぶんの場所を取り、開けばその場でページが伸びる——
          開いた瞬間に「長いページを読まされる」形になっていた。
          画面いっぱいの一枚へ移して、中で送ってもらう。
        */
        <div className="shrink-0">
          <MoreButton testId="outcome-detail-toggle" onClick={() => setDetailOpen(true)}>
            詳しく見る（ねらい・流れ・覚えるAI技）
          </MoreButton>
        </div>
      )}

      {detailOpen && (
        <LessonDetailModal
          goal={goal}
          before={before}
          after={after}
          swaps={plan?.swaps}
          skills={skills}
          outcomes={outcomes}
          flow={flow}
          onClose={() => setDetailOpen(false)}
        />
      )}

      {introOpen && (
        <LessonIntroModal
          /*
            ゴールは**1行だけ**。教材は3つ持っているが（`outcomes`）、
            始める前に3つ並べると「覚えることが3つある」に見える。
            残り2つは「詳しく見る」の中で会う。
          */
          goalLine={description ?? outcomes?.[0]}
          plan={plan}
          source={before}
          result={after}
          poMessage={poMessage}
          onStart={() => {
            setIntroOpen(false);
            onStart?.();
          }}
          onDetail={hasDetail ? () => setDetailOpen(true) : undefined}
          onClose={() => setIntroOpen(false)}
        />
      )}
    </div>
  );
}
