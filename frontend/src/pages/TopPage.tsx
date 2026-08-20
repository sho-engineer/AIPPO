/**
 * トップ画面（AIPPO 開発概要 §18 Phase 1）。
 *
 * ゲームのタイトル画面として作っている。
 * ロゴが大きく出て、キャラクターが待っていて、押す場所は1つ。
 * 初心者に「難しそうな道具」ではなく「始められるもの」として見せたい。
 *
 * 作りの意図
 * ----------
 * 平らで単調に見える原因は3つあった。順に潰している。
 *
 *   1. 背景が一色 → 空・丘・泡の3層に分け、層ごとに違う速さで動かす
 *   2. 全部が止まっている → 上から順に現れ、ポーは浮き、ボタンは輪を出す
 *   3. 同じ大きさの箱が並ぶ → ロゴを飛び抜けて大きく、注記は小さく
 *
 * 手順は「すごろくの盤面」にした。カードを3枚横に並べるのが
 * いちばん作り置きに見えるうえ、名前の由来（AI＋一歩）とも噛み合わない。
 * 段差を付けて登っていく形にすれば、進む話であることが絵で分かる。
 *
 * 動きはすべて CSS。prefers-reduced-motion のときは index.css で一括して止める。
 */

import { BrandLogo } from "../components/BrandLogo";
import { IconChat, IconChecklist, IconWrite } from "../components/Icons";
import { PoeAvatar } from "../components/PoeAvatar";
import { PO_WAVE } from "../po/assets";
import { TitleBackdrop } from "../components/TitleBackdrop";
import { BRAND, BUTTONS, POE_TITLE_GREETING } from "../content/ui";

/**
 * 始める前に、何が起きるかを見せる。長さは3つまで。
 *
 * 絵は絵文字ではなく線画を使う（components/Icons.tsx に理由を書いた）。
 * 絵文字は端末ごとに絵柄も色も変わるので、丸ゴシックとやわらかい青で
 * そろえた画面の中で、そこだけ他所から貼ったように浮く。
 */
const STEPS = [
  {
    number: "1",
    title: "3つの質問に答える",
    body: "いまの仕事と、困っていることを選ぶだけ。",
    Icon: IconChecklist,
  },
  {
    number: "2",
    title: "AIに実際にお願いする",
    body: "相手・言い方・長さを伝えて、文章を整えてもらいます。",
    Icon: IconChat,
  },
  {
    number: "3",
    title: "自分の文章で試す",
    body: "覚えたやり方を、そのまま自分の仕事に使えます。",
    Icon: IconWrite,
  },
] as const;

export type TopPageProps = {
  onStart: () => void;
};

/**
 * 開始ボタン。
 *
 * タイトル画面で押す場所はここ1つ。だからといって、画面幅いっぱいの
 * 丸ボタンに輪を広げて光らせる必要は無い。
 *
 * 以前は w-64・py-4・rounded-full に、白い丸へ入れた「›」を添え、
 * さらに周りから輪（animate-halo）を広げていた。押す場所が1つしかない
 * 画面では、そこまでしなくても迷わない。光らせるほど、
 * 中身より広告に見える。
 */
function StartButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-6 flex animate-pop-in items-center gap-2 rounded-cta bg-brand
                 px-8 py-3 text-base font-bold text-white transition
                 [animation-delay:0.7s] hover:bg-brand-dark active:bg-brand-dark"
    >
      {BUTTONS.start}
      {/* 進む向きだけ添える。器には入れない */}
      <span aria-hidden="true" className="text-lg leading-none">
        →
      </span>
    </button>
  );
}

export function TopPage({ onStart }: TopPageProps) {
  return (
    <main className="relative">
      {/* ── タイトル画面。最初の1画面に収める ── */}
      <section
        className="relative flex min-h-[100svh] flex-col items-center justify-center
                   overflow-hidden px-6 pb-12 pt-10"
        aria-labelledby="headline"
      >
        <TitleBackdrop />

        {/*
          中身はひとかたまりにして、画面の高さの真ん中へ置く。
          下端に寄せると、画面が縦に長い端末でボタンが枠の外へ出る。
        */}
        <div className="relative flex flex-col items-center">
          {/* ロゴ＝タイトル。ここだけ飛び抜けて大きくする */}
          <div className="animate-drop-in">
            <BrandLogo variant="stacked" className="h-28 sm:h-36" />
          </div>

          <p className="mt-3 animate-rise-in text-xs font-bold tracking-[0.35em] text-brand-dark [animation-delay:0.25s]">
            {BRAND.reading}
          </p>

          {/*
            日本語は単語の切れ目が無く、放っておくと最後の行に
            1〜2文字だけ残って間の抜けた見た目になる。
          */}
          <h1
            id="headline"
            className="mt-4 max-w-xs animate-rise-in text-balance text-center text-xl
                       font-bold leading-snug [animation-delay:0.35s] sm:max-w-3xl sm:text-2xl"
          >
            {BRAND.headline}
          </h1>

          <div className="mt-6 flex flex-col items-center">
            <PoeAvatar
              variant="hero"
              imageSrc={PO_WAVE}
              tutor={{
                message: POE_TITLE_GREETING,
                emotion: "neutral",
                action: "wait",
              }}
            />

            <StartButton onClick={onStart} />

            <p className="mt-3 animate-rise-in text-xs text-ink-muted [animation-delay:0.85s]">
              3つの質問に答えるだけ。登録は必要ありません。
            </p>

            {/*
              下にも続きがあると教える。無いと1画面で終わったように見える。

              画面の下端へ貼り付けたくなるが、それはやらない。
              縦が 800px 前後の画面では、真ん中に置いた中身の下端と
              重なって文字が二重になる（実際に重なった）。
              並びの中に置けば、画面の高さがいくつでもぶつからない。
            */}
            <p className="mt-5 flex flex-col items-center gap-0.5 text-xs text-ink-muted">
              <span>この先に、やることが3つ</span>
              <span
                aria-hidden="true"
                className="animate-nudge text-base leading-none text-brand-dark"
              >
                ▾
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* ── やることは3つ。1枚の白い面にまとめて置く ── */}
      <section className="relative z-10 px-5 pb-14" aria-labelledby="steps-heading">
        {/*
          下地がほぼ白になったので、面を重ねて段差を作る手は使えない
          （白の上に白を置いても境目が出ない）。輪郭は影だけで出す。
        */}
        <div className="mx-auto max-w-4xl rounded-panel bg-surface px-6 py-10 shadow-raised sm:px-10">
          {/* 見出しの左右に点線を添えて、章の切れ目だと分かるようにする */}
          <div className="flex items-center justify-center gap-3">
            <span
              aria-hidden="true"
              className="hidden h-px w-16 border-t-2 border-dotted border-brand-line sm:block"
            />
            <h2 id="steps-heading" className="text-center text-xl font-bold sm:text-2xl">
              はじめの一歩は、3つだけ
            </h2>
            <span
              aria-hidden="true"
              className="hidden h-px w-16 border-t-2 border-dotted border-brand-line sm:block"
            />
          </div>

          <p className="mt-3 text-center text-sm leading-8 text-ink-muted">
            {BRAND.subHeadline}
          </p>

          {/*
            順番のある3つなので、番号を振った縦の一覧にする。

            以前は淡い青の角丸カードを3枚並べ、それぞれの中に
            「淡色の角丸四角＋線画アイコン」を置いていた。同じ形が
            3回くり返されるだけで、中身の違いは伝わらない。
            番号を左に立てて線でつなげば、順番であることが形で分かる。
          */}
          <ol className="mt-8 sm:mt-10" role="list">
            {STEPS.map((step) => (
              <li key={step.number} className="flex gap-4 border-b border-line py-5">
                <span
                  aria-hidden="true"
                  className="w-5 shrink-0 text-sm font-bold tabular-nums text-brand"
                >
                  {step.number}
                </span>

                <div className="min-w-0 flex-1">
                  <h3 className="flex items-center gap-2 text-base font-bold">
                    <step.Icon className="h-[1.125rem] w-[1.125rem] shrink-0 text-brand" />
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm leading-7 text-ink-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── 締め。ポーを左に、行き先を右に置く ── */}
      <section className="relative mx-5 mb-8 overflow-hidden rounded-panel bg-brand px-6 py-10 text-white">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 sm:flex-row sm:gap-10">
          {/*
            紙吹雪の中のポー。読み上げには要らない
            （同じことがすぐ横に文で書いてある）。
          */}
          <img
            src="/poe/celebrate.webp"
            alt=""
            aria-hidden="true"
            className="h-32 w-32 shrink-0 animate-float object-contain sm:h-40 sm:w-40"
          />

          <div className="flex-1 text-center sm:text-left">
            <p className="text-xl font-bold sm:text-2xl">{BRAND.tagline}</p>

            {/*
              ここでも始められるようにする。
              読み終えた場所から画面の上まで戻らせるのは行き止まりに近い
              （憲章 原則 I）。行き先はタイトル画面のボタンと同じ。
            */}
            <button
              type="button"
              onClick={onStart}
              className="mt-5 inline-flex items-center gap-2 rounded-cta bg-white px-8 py-3
                         text-base font-bold text-brand transition hover:bg-brand-soft"
            >
              {BUTTONS.start}
              <span aria-hidden="true" className="text-lg leading-none">
                →
              </span>
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
