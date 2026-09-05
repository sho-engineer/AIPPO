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

import { MoreButton } from "../MoreSheet";
import {
  hasLessonDetail,
  LessonDetailModal,
  LessonIntroModal,
  LessonOverviewModal,
} from "../LessonIntro";
import { IconDocument } from "../../Icons";
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

  const hasDetail = hasLessonDetail({ goal, before, after, skills, outcomes });

  return (
    /*
      入口は**2つだけ**。

      前はここに「今日やることの全体図を見る」「初級」「詳しく見る」が
      縦に並び、下の帯に「さっそく試す」があった。押せる先が4つで、
      **どれが本題なのか決められない**。奥のもの（全体図・詳しい話）は
      「今日やること」の一枚から辿る形にして、この画面に残すのは

          さっそく試す         … 下の帯（`StepShell` が出す）
          今日やることを見る   … ここ

      の2つにする。
    */
    <div data-testid="outcome-preview" className="flex min-h-0 flex-1 flex-col gap-3">
      {/*
        今日やる1本の絵。

        専用の1枚（全体図）は**ここには置かない**。1画面＝1アクションに
        収めると渡せる高さが 30px しか残らず、読めない絵になる。
        押して大きく見てもらう形にして、入口は「今日やること」の中。

        専用の1枚がまだ無いレッスンでは、一覧と同じ絵で代える
        ——絵の場所を空けて待たない。
      */}
      {!overview && thumbnail && (
        <div className="shrink-0">
          <LessonThumbnail src={thumbnail} variant="banner" />
        </div>
      )}

      {/*
        副の入口。**下の帯のすぐ上に置く。**

        絵をこの画面から外したので、上に置くと真ん中に 450px の空白が
        残り、押せるものが画面の上下に離れて散る。押す先の2つは
        隣どうしにあったほうが選びやすい（`mt-auto` で下へ寄せる）。

        見た目は主にしない。囲いはあるが淡く、下の「さっそく試す」と
        同じ重さにはしない——ここは「先に中身を見たい人」のための道で、
        押さずに始めてよい。
      */}
      <div className="mt-auto shrink-0">
        <MoreButton testId="outcome-intro-open" onClick={() => setIntroOpen(true)}>
          <IconDocument className="h-4 w-4 shrink-0" />
          今日やることを見る
        </MoreButton>
      </div>

      {overviewOpen && overview && (
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

      {detailOpen && (
        <LessonDetailModal
          goal={goal}
          goalNote={plan?.goalNote}
          before={before}
          after={after}
          changeNote={plan?.changeNote}
          swaps={plan?.swaps}
          skills={skills}
          outcomes={outcomes}
          /*
            読み切った人の出口。導入の一枚も一緒に閉じて、そのまま
            次の画面へ出す——2枚とも自分で閉じさせない。
          */
          onStart={
            onStart
              ? () => {
                  setDetailOpen(false);
                  setIntroOpen(false);
                  onStart();
                }
              : undefined
          }
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
          minutes={minutes}
          plan={plan}
          source={before}
          result={after}
          poMessage={poMessage}
          onStart={() => {
            setIntroOpen(false);
            onStart?.();
          }}
          onDetail={hasDetail ? () => setDetailOpen(true) : undefined}
          onOverview={overview ? () => setOverviewOpen(true) : undefined}
          onClose={() => setIntroOpen(false)}
        />
      )}
    </div>
  );
}
