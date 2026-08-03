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
import { PoeAvatar } from "../components/PoeAvatar";
import { TitleBackdrop } from "../components/TitleBackdrop";
import { BRAND, BUTTONS, POE_TITLE_GREETING } from "../content/ui";

/** 始める前に、何が起きるかを見せる。長さは3つまで。 */
const STEPS = [
  {
    number: "1",
    title: "3つの質問に答える",
    body: "いまの仕事と、困っていることを選ぶだけ。",
    /** 段差。右へ行くほど高くする＝登っていく */
    lift: "sm:mt-16",
    tone: "bg-brand",
  },
  {
    number: "2",
    title: "AIに実際にお願いする",
    body: "相手・言い方・長さを伝えて、文章を直してもらいます。",
    lift: "sm:mt-8",
    tone: "bg-brand",
  },
  {
    number: "3",
    title: "自分の文章で試す",
    body: "覚えたやり方を、そのまま自分の仕事に使えます。",
    lift: "sm:mt-0",
    // ここが上がり。青が3つ並ぶと段差が読み取れないので、色を変える
    tone: "bg-joy",
  },
] as const;

export type TopPageProps = {
  onStart: () => void;
};

/**
 * 開始ボタン。
 *
 * 周りから輪が広がる。タイトル画面で押す場所は1つしかないので、
 * それがどこかを、文字を読む前に分かるようにする。
 */
function StartButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative mt-6 animate-pop-in [animation-delay:0.7s]">
      <span
        aria-hidden="true"
        className="absolute inset-0 animate-halo rounded-full bg-brand/40"
      />
      <button
        type="button"
        onClick={onClick}
        className="relative w-64 rounded-full bg-brand px-10 py-4 text-lg font-bold
                   text-white shadow-pop transition hover:-translate-y-0.5
                   hover:bg-brand-dark active:translate-y-0"
      >
        {BUTTONS.start}
      </button>
    </div>
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
              imageSrc="/brand/poe-wave.webp"
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

      {/* ── 進む道。すごろくの盤面として見せる ── */}
      <section
        className="relative z-10 -mt-10 rounded-t-[2.5rem] bg-surface px-6
                   pb-16 pt-12 sm:pt-16"
        aria-labelledby="steps-heading"
      >
        {/*
          上辺を丸めて、タイトル画面へ少しかぶせている。
          白い面をぴったり突き合わせると、切り貼りしたように見える。
        */}
        <div className="mx-auto max-w-4xl">
          <h2 id="steps-heading" className="text-xl font-bold">
            はじめの一歩は、3つだけ
          </h2>

          <p className="mt-3 text-sm leading-8 text-ink-muted">
            {BRAND.subHeadline}
          </p>

          <div className="relative mt-10 sm:mt-12">
            {/*
              道は ol の外に置く。
              ol の直下に li 以外を入れると、読み上げが一覧として扱えなくなる。

              横に並ぶときは登っていく曲線、縦に積むときは左端の点線。
            */}
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-x-0 top-0 hidden h-28 w-full sm:block"
            >
              {/*
                非等比に伸ばすので、線の太さと点線の間隔が潰れないよう
                non-scaling-stroke を指定する。
              */}
              <path
                d="M16.7 82 C30 82, 37 54, 50 54 C63 54, 70 26, 83.3 26"
                fill="none"
                strokeWidth={2}
                strokeDasharray="5 8"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-brand-line"
              />
            </svg>
            <span
              aria-hidden="true"
              className="absolute left-7 top-8 h-[calc(100%-5rem)] border-l-2
                         border-dashed border-brand-line sm:hidden"
            />

            <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6" role="list">
              {STEPS.map((step) => (
                <li
                  key={step.number}
                  className={`relative flex gap-4 sm:block ${step.lift}`}
                >
                  <span
                    aria-hidden="true"
                    className={`relative z-10 flex h-14 w-14 shrink-0 items-center
                                justify-center rounded-full text-lg font-bold
                                text-white shadow-card ring-4 ring-surface
                                sm:mx-auto ${step.tone}`}
                  >
                    {step.number}
                  </span>
                  <div className="sm:mt-4 sm:text-center">
                    <h3 className="text-base font-bold">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-7 text-ink-muted">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── 締め。登りきった先を見せて、その場から始められるようにする ── */}
      <section className="relative bg-brand px-6 py-14 text-center text-white">
        {/*
          紙吹雪の中のポー。ここが道の終わり。
          読み上げには要らない（同じことがすぐ下に文で書いてある）。
        */}
        <img
          src="/poe/celebrate.webp"
          alt=""
          aria-hidden="true"
          className="mx-auto h-32 w-32 animate-float object-contain sm:h-40 sm:w-40"
        />
        <p className="mt-3 text-xl font-bold sm:text-2xl">{BRAND.tagline}</p>

        {/*
          ここでも始められるようにする。
          読み終えた場所から画面の上まで戻らせるのは行き止まりに近い
          （憲章 原則 I）。行き先はタイトル画面のボタンと同じで、選択肢は増えない。
        */}
        <button
          type="button"
          onClick={onStart}
          className="mt-7 w-64 rounded-full bg-white px-10 py-4 text-lg font-bold
                     text-brand shadow-pop transition hover:-translate-y-0.5
                     hover:bg-brand-soft active:translate-y-0"
        >
          {BUTTONS.start}
        </button>
      </section>
    </main>
  );
}
