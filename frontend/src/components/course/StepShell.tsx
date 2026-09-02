/**
 * どのステップでも共通の枠。
 *
 * 置き方の決まり:
 * - 進み具合を上に。あとどれくらいかが分からないと不安になる
 * - 入力済みの内容は**小さなサマリーカード**にたたむ（要件 §6.4）。
 *   全部の欄を出しっぱなしにすると、いま何を聞かれているのか分からなくなる
 * - 次にやることは**画面のいちばん下**（要件 §6.11）。
 *   スマートフォンでは、入力欄とボタンが同時に見えることが大事
 * - ポーは入力の邪魔をしない。狭いときは小さくする
 */

import { useEffect, useState, type ReactNode } from "react";

import {
  IconBulb,
  IconCaution,
  IconCheck,
  IconRefresh,
  IconSparkle,
  type Icon,
} from "../Icons";
import { PoHero } from "../aippo/PoHero";
import { PrimaryButton } from "../aippo/PrimaryButton";
import { LessonProgress } from "./LessonProgress";
import type { Mission } from "../../course/missions";
import { StepTransition } from "./StepTransition";
import type { PoSize } from "../../po/sizes";
import type { LessonPhase, PoMessage } from "../../course/types";

export interface StepShellProps {
  title: string;
  /** 見出しの上に小さく出す肩書き（「Lesson 1」など）。 */
  eyebrow?: { icon: Icon; label: string };
  instruction?: string;
  progress: { current: number; total: number };
  /** レッスンの中の区切り。帯を割り、いまいる区切りの名前を出す。 */
  missions?: Mission[];
  currentMission?: number;
  /**
   * いまどの区切りか。
   *
   * 分かるときは、点の目盛りより先にこちらを出す。
   * 「19歩のうち11歩目」より「いま『自分で試す』のところ」のほうが、
   * 何をしている最中かがすぐ分かる。
   */
  phase?: LessonPhase;
  po: PoMessage;
  summary: { stepId: string; label: string; value: string }[];
  onEditSummary: (stepId: string) => void;
  /** 次にやること。ここだけがユーザーの行き先（憲章 原則 I）。 */
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  /** ボタンの近くに出す理由。禁止ではなく案内（要件 §6.6）。 */
  hintNearButton?: string | null;
  /**
   * 答えを受け取ったことを返す短い文。
   *
   * 選んだ直後は、押した札が青くなるだけで「登録されたのか」は分からない。
   * 選んだ中身をそのまま返せば、押し間違いにもその場で気づける
   * （Learning UX §2: 何ができたかが具体的に分かる feedback）。
   *
   * 作文はしない。**選んだ答えそのもの**を出す。
   */
  doneLabel?: string | null;
  /**
   * 失敗したことを伝える文。
   *
   * ステップの種類に関係なく、**必ずここに出す**。
   * 種類ごとの本文の中だけに置くと、置き忘れた画面で
   * 「押したのに何も起きない」ように見える（実際に起きた）。
   */
  error?: string | null;
  /** 「今回はスキップ」など、主導線以外の逃げ道。 */
  secondary?: { label: string; onClick: () => void };
  /**
   * 逃げ道を、主導線と同じ大きさのボタンで並べるか。
   *
   * ふだんは細い文字のままにする。逃げ道が主導線と同じ大きさで並ぶと、
   * どちらを押せばよいのか決められなくなる。
   * 終わったあとの画面だけは別で、「次へ行く」と「もう一度やる」は
   * どちらも正しい行き先なので、対等に並べる。
   */
  secondaryProminent?: boolean;
  busy?: boolean;
  /**
   * 選んだので、まもなく自動で次へ進む状態か。
   *
   * 黙って画面が変わると「勝手に飛んだ」と読まれる。
   * 進む前に、進むと分かる合図を出す（Learning UX §2 / §3）。
   */
  autoAdvancing?: boolean;
  /**
   * ポーを出すか。
   *
   * 決めるのは `course/poPresence.ts`。ここでは受け取るだけにする——
   * 「どの画面に居るか」を各画面が個別に決め始めると、全部足したときに
   * 何画面に居るのかが誰にも分からなくなる。
   */
  showPo?: boolean;
  /** ポーが喋るか。顔だけ出して黙る場面がある（失敗のとき）。 */
  poSpeaks?: boolean;
  /** ポーが出ている理由。`data-po-scene` として出す。 */
  poScene?: string;
  /** その場面での大きさ。決めるのは `course/poPresence.ts`。 */
  poSize?: PoSize;
  children: ReactNode;
}

/**
 * 押せない理由の出し方。
 *
 *   まだ押していない … ふだんの文字色。電球を添えるだけ
 *   押したのに進めなかった … 注意の色。何をすれば進めるかを言う
 *
 * 開いた瞬間からオレンジの警告が出ていると、まだ選んでいないだけの人が
 * 「何か間違えた」と読む。押して初めて、断りとして色を使う。
 */
export function StepShell({
  title,
  eyebrow,
  instruction,
  progress,
  missions,
  currentMission,
  phase,
  po,
  summary,
  onEditSummary,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  hintNearButton,
  doneLabel,
  error,
  secondary,
  secondaryProminent = false,
  busy = false,
  autoAdvancing = false,
  showPo = true,
  poSpeaks = true,
  poScene,
  poSize = "md",
  children,
}: StepShellProps) {
  /*
    「押したのに進めなかった」を覚えておく。
    回が変わったら忘れる——前の回で断られたことを、次の回まで
    引きずって赤いままにしない。
  */
  const [refused, setRefused] = useState(false);
  useEffect(() => setRefused(false), [title]);

  return (
    /*
      1画面＝1アクション。**ページそのものは縦に伸ばさない。**

      前は `min-h-screen` の中に長い1本の縦積みを置き、下の帯の分だけ
      余白（`pb-40`＝160px）を空けていた。Pixel 5 で実測すると、
      15画面のうち**14画面がはみ出していた**。うち8画面はぴったり
      44px——帯（44px）の下に「画面の高さぶん」の面を置いていたので、
      中身が何も無くても帯のぶんだけ必ず溢れる作りだった。

      いまは帯の下いっぱいの高さを取り、縦に3つ積む。

          進み具合・見出し・ポー   … 動かない
          その回の中身            … ここだけ伸び縮みする
          次にやること            … 動かない（`fixed` をやめた）

      中身が入りきらない回では、**中身の枠の中だけ**が送れる。
      ポーもボタンも画面から出ていかないので、いつでも次へ進める。
      余白を数で当てる必要も無くなった（帯は同じ柱の中にある）。
    */
    <div
      className="mx-auto flex h-[calc(100dvh-2.75rem-env(safe-area-inset-top))] w-full max-w-page flex-col
                 px-5 pt-2"
      data-testid="step-shell"
    >
      {/*
        進み具合は細い帯ひとつ。

        前は「区切りの帯（4段）」「丸の列（最大7つ）」「数字」の3つで
        同じことを言っていた。3段あると、どれを見れば「あと何回か」が
        分かるのか決められず、結局どれも読まれない。上が説明で埋まって
        本文が下へ押し出される問題もあった。

        いまは帯を区切りで割り、その名前を左に小さく出す
        （`LessonProgress`）。分数は1つのまま——「2 / 4」と「3 / 19」を
        並べると、どちらを見ればよいのか決められなくなる。
      */}
      <div className="shrink-0 pt-1" data-phase={phase ?? undefined}>
        <LessonProgress
          current={progress.current}
          total={progress.total}
          missions={missions}
          currentMission={currentMission}
        />
      </div>

      {/*
        入力済みの内容。折りたたんでおく（要件 §6.4）。

        **面にしない。** 白いカードにすると、閉じているだけで 48px を
        使う。1画面に収める柱では、その 48px がそのまま本題から引かれる
        ——実測で、比べる画面がちょうどその分だけ入りきらなかった。
        畳んだ状態は行1本、開いたときだけ面になる。
      */}
      {summary.length > 0 && (
        <details className="group mt-3 shrink-0">
          <summary className="cursor-pointer text-xs font-bold text-ink-muted">
            ここまでに答えた内容（{summary.length}件）
          </summary>
          <ul className="mt-2 space-y-2 rounded-card border border-line bg-surface px-4 py-3">
            {summary.map((entry) => (
              <li
                key={entry.stepId}
                className="flex items-center justify-between gap-3 text-xs"
              >
                <span className="min-w-0">
                  <span className="text-ink-muted">{entry.label}：</span>
                  <span className="break-words font-bold">
                    {entry.value.length > 40
                      ? `${entry.value.slice(0, 40)}…`
                      : entry.value}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onEditSummary(entry.stepId)}
                  className="shrink-0 rounded-badge border border-line px-3 py-1
                             text-xs text-brand-dark transition hover:bg-brand-soft"
                >
                  なおす
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/*
        見出し・説明・ポーを、ひとかたまりで上に置く。

        前はポーを画面のいちばん下（ボタンのすぐ上）に置いていた。
        案内役の言葉は**読み始める前**に要るもので、読み終えた後に
        出てきても遅い。支給デザインも6枚とも、ポーは見出しの右にいる。

        ポーが居ない画面では、見出しだけがここに残る。居ないぶんの
        余白は返すので、本文がその高さぶん上がる。
      */}
      <div className="mt-4 shrink-0">
        <PoHero
          eyebrow={
            eyebrow && (
              <span className="flex items-center gap-1.5 text-sm font-bold text-brand">
                <eyebrow.icon className="h-4 w-4 shrink-0" />
                {eyebrow.label}
              </span>
            )
          }
          title={title}
          description={instruction}
          message={poSpeaks ? po.message : undefined}
          emotion={po.emotion}
          /*
            大きさは**場面**で決める。画面の都合では決めない。

            前はここに `compact={!eyebrow}` と書いてあった。小さな前置き
            （「Lesson 1」など）が無い画面ではポーを小さくする、という
            意味だが、**前置きの有無はポーと何の関係も無い**。実測すると
            見える背丈が 104px → 81px（22%減）に変わっていて、同じ
            レッスンを進んでいるだけでポーが縮んでいた。

            いまは場面と段の対応を `course/poPresence.ts` が1か所で持つ。
            ここは引くだけ——ここで条件を書き始めると、また同じことが起きる。
          */
          size={poSize}
          showPo={showPo}
          scene={poScene}
        />
      </div>

      {/*
        ステップが入れ替わったことを、短い動きで伝える。

        向きに意味を持たせてある（進むと左から、戻ると右から）。
        紙をめくる向きと同じで、「いま戻った」ことが文字を読まなくても
        分かる。秒数と加減速は course/motion.ts にまとめてある。
      */}
      {/*
        その回の中身。**ここだけが伸び縮みする。**

        `min-h-0` が要る。flex の子は既定で中身より縮まないので、
        これが無いと長い中身がそのまま柱を押し広げ、下の帯を画面の
        外へ追い出す（＝ページごとスクロールする元の姿に戻る）。

        縦の flex にしてある。中の回が `min-h-0 flex-1` を付ければ、
        **残りの高さに収まるまで縮む**——AIの結果や教材の絵のように
        長さの決まらないものは、そうやって画面へ収める。付けなければ
        これまでどおり中身の高さで置かれる。

        `overflow-y-auto` は逃げ道であって狙いではない。収まらない回が
        出ても切り落とさないための保険で、ふだんの回は送らずに収まる
        （`e2e/stepFits.spec.ts` が実寸で見張る）。
      */}
      <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
        <StepTransition stepKey={title}>{children}</StepTransition>
      </div>

      {/*
        次にやること。柱のいちばん下。

        `fixed` をやめた。中身の上に浮かせる必要が無くなった——柱の中に
        並んでいるので、中身がどれだけ長くてもこの帯を押し出さない。
        浮かせていた頃は、その下に隠れないよう `pb-40` を空けていて、
        帯の高さ（85〜159px と場面で違う）と食い違うたびに、
        余白が余ったり足りなかったりしていた。

        safe-area は残す。足さないと iPhone のホームバーに隠れる。
      */}
      <div
        className="-mx-5 shrink-0 border-t border-line bg-surface px-5
                   pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto max-w-page">
          {error && (
            <p
              role="alert"
              data-testid="step-error"
              className="mb-2 flex items-start gap-1.5 rounded-card bg-caution-soft px-3 py-2 text-xs leading-5 text-caution"
            >
              <IconCaution className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          {/*
            受け取った合図。押した札が青くなるだけでは、登録されたのか
            分からない。選んだ中身を返して、押し間違いにその場で気づけるようにする。
          */}
          {doneLabel && (
            <p
              data-testid="step-done-inline"
              role="status"
              className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand"
            >
              <span
                aria-hidden="true"
                className="flex h-4 w-4 shrink-0 items-center justify-center
                           rounded-full bg-brand text-white"
              >
                <IconCheck className="h-2.5 w-2.5" />
              </span>
              {doneLabel}
            </p>
          )}

          {hintNearButton && !doneLabel && (
            <p
              data-testid="step-hint"
              data-tone={refused ? "warning" : "neutral"}
              className={`mb-2 flex items-start gap-1.5 text-xs leading-5 ${
                refused ? "font-bold text-caution" : "text-ink-muted"
              }`}
              // 押せない理由は、押す前に読み上げへ届ける
              role="status"
            >
              {refused ? (
                <IconCaution className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <IconBulb
                  className="mt-0.5 h-4 w-4 shrink-0 text-brand"
                  aria-hidden="true"
                />
              )}
              <span>{hintNearButton}</span>
            </p>
          )}
          {/*
            戻る道はヘッダーの「←」1本にした。

            前はここにも「もどる」があり、上の「レッスン一覧へ」と合わせて
            戻る手段が上下に散っていた。行き先が違うもの（1歩戻る／出る）が
            離れて置かれていると、どちらがどこへ行くのか押すまで分からない。

            ここは「次にやること」だけにする。画面の下に1つだけ置くから、
            迷わず押せる（憲章 原則 I）。
          */}
          {/*
            進むボタン。幅いっぱい・56px。支給デザイン6枚とも、
            下端にあるのはこの1つだけ。
          */}
          <div className={secondaryProminent ? "flex items-stretch gap-3" : ""}>
            <PrimaryButton
              testId="primary-action"
              onClick={onPrimary}
              /*
                送信中は本当に受け付けない（二度押しで費用が倍になる）。
                答えが足りないだけのときは押せるようにして、押されたら
                理由を出す。押しても何も起きないボタンは、理由が
                分からないまま二度三度と押される。
              */
              disabled={busy}
              blocked={primaryDisabled && !busy}
              onBlockedClick={() => setRefused(true)}
              icon={
                busy ? undefined : autoAdvancing ? (
                  <IconCheck className="h-5 w-5 shrink-0" />
                ) : (
                  <IconSparkle className="h-5 w-5 shrink-0" />
                )
              }
              className={secondaryProminent ? "flex-1" : ""}
            >
              {busy ? "送っています…" : autoAdvancing ? "つぎへ進みます" : primaryLabel}
            </PrimaryButton>

            {secondary && secondaryProminent && (
              <PrimaryButton
                secondary
                onClick={secondary.onClick}
                icon={<IconRefresh className="h-5 w-5 shrink-0" />}
                className="flex-1"
              >
                {secondary.label}
              </PrimaryButton>
            )}
          </div>

          {secondary && !secondaryProminent && (
            <button
              type="button"
              onClick={secondary.onClick}
              className="mt-2 w-full py-2 text-xs text-ink-muted underline
                         transition hover:text-ink"
            >
              {secondary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
