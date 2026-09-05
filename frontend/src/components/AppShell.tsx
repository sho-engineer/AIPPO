/**
 * 画面の枠。ヘッダーと下タブ。
 *
 * 支給デザインでは、どの画面にも同じ帯が上下に付いている。
 * 上は「いまどのアプリか」、下は「どこへでも行ける」を保証する帯で、
 * 中身が変わっても位置が動かないことに意味がある。
 * 迷ったときに目を戻す場所を、画面ごとに探させない。
 *
 * 下タブは飾りではないので、行き先の無いものは置かない。
 * 実装が追いついていない先は `disabled` にして、押せないことを
 * 見た目と読み上げの両方で伝える（黙って無反応にしない）。
 */

import type { ReactNode } from "react";

import { BrandLogo } from "./BrandLogo";
import { useGoHome } from "../app/navigation";
import {
  IconBook,
  IconChevronLeft,
  IconDocument,
  IconHome,
  IconMedal,
  IconMore,
  IconPerson,
  type Icon,
} from "./Icons";

// ------------------------------------------------------------------ ヘッダー

export type AppHeaderProps = {
  /** 戻る先。渡すと左に「＜」が出る。 */
  onBack?: () => void;
  /** 右上の抜け道（「スキップ」など）。 */
  action?: { label: string; onClick: () => void };
  /** ロゴを中央へ寄せるか。戻るボタンがあるときは中央のほうが落ち着く。 */
  centered?: boolean;
  /** 右上の似顔絵から行く先。渡さないと、押せない飾りになる。 */
  onOpenAccount?: () => void;
};

/**
 * 上の帯。
 *
 * 中身はロゴと、本人の欄だけ。左にロゴ（戻れる画面では戻るボタン＋
 * 中央ロゴ）、右に似顔絵。
 *
 * 高さは 56px。前は 44px まで詰めていたが、支給デザインのロゴは
 * それより大きく、詰めると帯の中でロゴが窮屈に見える。
 * 上端には切り欠き（ノッチ）ぶんの余白を足す——足さないと、
 * iPhone では時計とロゴが重なる。
 *
 * お知らせの鈴は置かない
 * ----------------------
 * 知らせを配る仕組みがまだ無い。以前は「後で足したときに右上の並びが
 * 動かないように」と、押せない鈴を置いていた。**まだ来ない機能の
 * ために、全画面の右上を灰色の飾りで埋めていた**ことになる。
 * 用意できたら、そのとき足す。
 *
 * 中央は「画面の中央」にする
 * --------------------------
 * `centered` のとき、ロゴは**帯の真ん中**に置く。左右の飾りの幅で
 * 動かさない。
 *
 * 前は左（←、40px）と右（鈴＋似顔絵、80px）に挟まれた**残りの幅**の
 * 真ん中へ置いていた。左右の重さが違うぶん、ロゴは 22px 左へずれる。
 * 22px は、気のせいでは片づかない大きさだった（実測）。
 * 帯の中で唯一の縦の基準がロゴなので、そこがずれると帯全体が傾いて見える。
 *
 * 直し方は、ロゴだけを帯に対して絶対配置にする。左右に何を足しても、
 * 何を外しても、真ん中は動かない。ただしロゴは**押せる**（ホームへ戻る）
 * ので、重なった相手の操作を奪わないことは、`pointer-events-none` では
 * なく「重ならない幅に収める」ことで守る（e2e/header.spec.ts）。
 */
export function AppHeader({ onBack, action, centered, onOpenAccount }: AppHeaderProps) {
  /*
    ロゴを押したらホームへ。

    上から配られていなければ押せないただの絵にする（`app/navigation.tsx`）。
    **押せないボタンを出すより、ボタンでないほうがよい。**
  */
  const goHome = useGoHome();
  const logo = goHome ? (
    <button
      type="button"
      onClick={goHome}
      aria-label="ホームへ戻る"
      data-testid="brand-home"
      className="-m-1 flex cursor-pointer items-center rounded-badge p-1
                 transition active:scale-95
                 focus-visible:outline focus-visible:outline-2
                 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <BrandLogo className="h-8" />
    </button>
  ) : (
    <BrandLogo className="h-8" />
  );

  return (
    <header
      className="sticky top-0 z-20 border-b border-line bg-canvas/95 px-5
                 pt-[env(safe-area-inset-top)] backdrop-blur"
      data-testid="app-header"
    >
      <div className="relative mx-auto flex h-14 max-w-page items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="前の画面へ戻る"
            className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center
                       rounded-full text-ink transition hover:bg-brand-soft
                       hover:text-brand"
          >
            <IconChevronLeft className="h-6 w-6" />
          </button>
        )}

        {centered ? (
          <>
            {/*
              帯そのものの真ん中。左右に何があっても動かない。
              flex の並びから外すので、右の欄を右端へ押す枠を別に置く。
            */}
            {/*
              真ん中に置くが、**押せる状態のままにする**。
              以前は `pointer-events-none` を付けていたので、
              ロゴを押す道が構造的に塞がっていた。
            */}
            <span
              className="absolute left-1/2 -translate-x-1/2"
              data-testid="brand-logo-centered"
            >
              {logo}
            </span>
            <div className="flex-1" />
          </>
        ) : (
          <div className="flex-1">{logo}</div>
        )}

        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            className="-mr-1 shrink-0 rounded-badge px-2 py-2 text-sm font-bold
                       text-brand transition hover:text-brand-dark"
          >
            {action.label}
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            {/*
              似顔絵。登録していてもいなくても同じ場所から入る。
              行き先を渡していないときは、押せない印として出す。
            */}
            {onOpenAccount ? (
              <button
                type="button"
                onClick={onOpenAccount}
                aria-label="アカウントと設定"
                data-testid="header-account"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                           bg-brand-soft text-brand-dark transition hover:brightness-95"
              >
                <IconPerson className="h-5 w-5" />
              </button>
            ) : (
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                           bg-brand-soft/60 text-brand-dark/50"
              >
                <IconPerson className="h-5 w-5" />
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ 下タブ

export type TabKey = "home" | "course" | "skills" | "works" | "more";

/*
  5つとも行き先がある。

  何を下タブに置くか
  ------------------
  役割の違う3つが「学習履歴」1枚に混ざっていた。

      学習記録   … 何を学んだか
      マイ学び   … 何ができるか
      マイ成果物 … 何を作ったか

  下タブに出すのは後ろの2つ。**続ける理由になるのはこちら**で、
  「どの教材をどこまで」は、それを確かめたくなった人が見に行く。

  「AI技」ではなく「マイ学び」
  ---------------------------
  中に並ぶ一つひとつは、いまも AI技 と呼ぶ。変えたのは**器の名前**
  だけ。毎日見える帯に AI の語を置くと、学習アプリではなく AI の
  道具箱に見える。印も ✨ をやめた——常時見えるところで光らせると、
  技を取った瞬間の ✨ が効かなくなる。

  外した2つ（学習記録・あとで見る）は、その他の一覧とホームから開ける。
  タブから消すのと、行き先ごと消すのは別のこと。

  5つを超えない
  -------------
  6つ目を足すと、1つあたりの幅が 375px で 62px を切る。字が折り返し、
  帯の高さが行き先ごとに変わる（§29）。増やすときは、何かを外す。
*/
const TABS: { key: TabKey; label: string; icon: Icon; ready: boolean }[] = [
  { key: "home", label: "ホーム", icon: IconHome, ready: true },
  { key: "course", label: "コース", icon: IconBook, ready: true },
  { key: "skills", label: "マイ学び", icon: IconMedal, ready: true },
  { key: "works", label: "マイ成果物", icon: IconDocument, ready: true },
  { key: "more", label: "その他", icon: IconMore, ready: true },
];

export function BottomTabBar({
  current,
  onSelect,
}: {
  /**
   * いま光らせるタブ。
   *
   * 省くと、どれも光らない。下タブに無い画面（学習記録・あとで見る）を
   * 出しているときのため——**帯ごと消すと戻る道まで消える**が、
   * どれかを光らせると、そのタブを押したのに別の画面が出ていることになる。
   */
  current?: TabKey;
  onSelect: (key: TabKey) => void;
}) {
  return (
    <nav
      aria-label="画面の切り替え"
      data-testid="tab-bar"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95
                 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-page" role="list">
        {TABS.map((tab) => {
          const active = tab.key === current;
          return (
            <li key={tab.key} className="flex-1">
              {/*
                いまどこにいるかは、色と、上辺の短い線だけで示す。

                以前は選択中のタブを淡い青の角丸で塗りつぶしていた。
                4つ並ぶ帯の1つだけが面で光ると、そこが「押せる唯一の場所」
                のように見え、他のタブが沈む。位置を示すのに面はいらない。
              */}
              <button
                type="button"
                disabled={!tab.ready}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelect(tab.key)}
                /*
                  5つ並ぶので、字は小さく・折り返さない。
                  「マイ成果物」は5字あり、折り返すと帯の高さが変わって
                  他の4つの位置まで動く（§29）。
                */
                className={`relative flex w-full flex-col items-center gap-1 px-0.5 py-1.5
                            text-[0.625rem] leading-4 whitespace-nowrap transition
                            disabled:cursor-not-allowed disabled:text-ink-muted/40
                            ${active ? "font-bold text-brand-dark" : "text-ink-muted hover:text-ink"}`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-2 h-0.5 w-8 rounded-full bg-brand"
                  />
                )}
                <tab.icon className="h-5 w-5" />
                {tab.label}
                {!tab.ready && <span className="sr-only">（準備中）</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// -------------------------------------------------------------- カードの部品

/**
 * 見出しやリンクの左に置く、アイコンの器。
 *
 * 形は**角丸の四角**にする。丸ではない。
 *
 * 以前は全部を丸にしていたが、それが画面を機械的に見せていた。
 * 理由は2つある。
 *
 * - 中身の絵は四角いものが多い（用紙・かばん・こよみ・封筒）。
 *   丸に入れると四隅を空けねばならず、絵だけが小さく縮む
 * - 画面じゅうが丸になると、役割の違う部品が同じ形で並ぶ。
 *   一覧の行も、見出しも、選択肢も、みな同じ粒に見える
 *
 * 支給デザインを測ると 40px の器に半径 12px、中の絵は器の 55% ほど。
 * それに合わせてある。丸は意味のある場所にだけ残す
 * （進み具合の輪、順番を表す点、ポーの似顔絵）。
 */
export function IconBadge({
  icon: Glyph,
  tone = "brand",
  size = "md",
}: {
  icon: Icon;
  tone?: "brand" | "sky" | "teal" | "amber" | "rose" | "violet" | "plain";
  size?: "sm" | "md" | "lg";
}) {
  const tones = {
    brand: "bg-brand text-white",
    sky: "bg-accent-sky-soft text-accent-sky",
    teal: "bg-accent-teal-soft text-accent-teal",
    amber: "bg-accent-amber-soft text-accent-amber",
    rose: "bg-accent-rose-soft text-accent-rose",
    violet: "bg-accent-violet-soft text-accent-violet",
    plain: "bg-brand-soft text-brand-dark",
  } as const;

  // 器に対する絵の大きさは 55% で通す。ここが小さいと弱々しく見える
  const sizes = {
    sm: "h-9 w-9 [&>svg]:h-5 [&>svg]:w-5",
    md: "h-10 w-10 [&>svg]:h-[1.375rem] [&>svg]:w-[1.375rem]",
    lg: "h-14 w-14 [&>svg]:h-8 [&>svg]:w-8",
  } as const;

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-badge
                  ${tones[tone]} ${sizes[size]}`}
    >
      <Glyph />
    </span>
  );
}

/**
 * 器に入れない、線だけの印。
 *
 * 一覧や見出しの左に置く。`IconBadge` は淡い色の面を敷くので、
 * 並べると「淡色の四角＋線画」が画面じゅうに反復し、
 * どの機能も同じ重さに見えてしまう。
 *
 * 見分けが要るだけの場所——教材の種類、分類——はこちらを使う。
 * 面が要るのは、本当にそこが操作の起点になっている場所だけ。
 */
export function IconMark({
  icon: Glyph,
  tone = "brand",
  className = "h-5 w-5",
}: {
  icon: Icon;
  tone?: "brand" | "sky" | "teal" | "amber" | "rose" | "violet" | "muted";
  className?: string;
}) {
  const tones = {
    brand: "text-brand",
    sky: "text-accent-sky",
    teal: "text-accent-teal",
    amber: "text-accent-amber",
    rose: "text-accent-rose",
    violet: "text-accent-violet",
    muted: "text-ink-muted",
  } as const;

  return <Glyph className={`${className} shrink-0 ${tones[tone]}`} aria-hidden="true" />;
}

/**
 * 区切られた面。
 *
 * **一つの独立した操作単位のときだけ**使う。
 * 情報を並べたいだけなら使わない——節の見出しと余白と線で足りる。
 *
 * 以前は画面じゅうがこれで、カードがカードを囲んでいた。
 * 全部が同じ白い面で浮いていると、どれが本題か分からなくなる。
 *
 * 輪郭は、細い線とごく薄い影の両方で出す。支給デザインの面は
 * 下地（薄い青みの灰）の上に白い紙が置かれている見え方で、線だけだと
 * その差が出ない。影は 4px/16px/5% までに留める——濃くすると、面が
 * 並ぶほど画面が「貼り重ねた紙」に見えて、読む順番が伝わらない。
 *
 * 余白は `padded` で切る。className に p-0 を渡す形にはしない。
 * 同じ性質の指定を2つ書くと、どちらが勝つかが CSS の並び順まかせになり、
 * ビルドのたびに変わりうる（実際に背景色でこれをやって、青いカードが
 * 白く出た）。
 */
export function Card({
  children,
  className = "",
  padded = true,
  testId,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={`overflow-hidden rounded-panel border border-line bg-surface shadow-card
                  ${padded ? "p-4" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * 見出し。
 *
 * 印は付けない。見出しの左に淡色の四角を置くと、節が増えるほど
 * 同じ形の印が縦に並び、見出しそのものより印のほうが目立つ。
 * `icon` は受け取るが、線だけの印として控えめに出す。
 */
export function CardHeading({
  icon,
  children,
  action,
}: {
  icon?: Icon;
  /** 使わない。以前の呼び出しと形を合わせるためだけに残している。 */
  tone?: Parameters<typeof IconBadge>[0]["tone"];
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon && <IconMark icon={icon} className="h-[1.125rem] w-[1.125rem]" />}
      <h2 className="min-w-0 flex-1 text-sm font-bold">{children}</h2>
      {action}
    </div>
  );
}

/**
 * 添え物。所要時間やむずかしさ。
 *
 * pill にはしない。ここは押せないし、タグでもない。ただの補足なので、
 * 小さな文字で置けば足りる。囲うと「押せそうなもの」が増える。
 */
export function MetaPill({
  icon: Glyph,
  label,
  value,
}: {
  icon?: Icon;
  label?: string;
  value: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
      {Glyph && <Glyph className="h-3.5 w-3.5 shrink-0" />}
      {label && <span>{label}</span>}
      <span>{value}</span>
    </span>
  );
}
