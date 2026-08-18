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
import {
  IconBell,
  IconBook,
  IconChevronLeft,
  IconClock,
  IconHome,
  IconPerson,
  IconSliders,
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
};

/**
 * 上の帯。
 *
 * 中身はロゴと、お知らせ・本人の欄だけ。それ以上のものは載らないので、
 * 高さもそれに見合う分しか取らない。
 *
 * 以前は py-3 に 40px の丸ボタンを積んで 64px あった。スマホの
 * 縦は限られていて、帯が厚いぶんそのまま教材の見える量が減る。
 * 44px まで詰め、下端に線を1本引いて中身との境を示している
 * （線を引けば、背景をぼかして浮かせる必要が無くなる）。
 */
export function AppHeader({ onBack, action, centered }: AppHeaderProps) {
  return (
    <header
      className="sticky top-0 z-20 flex h-11 items-center gap-2 border-b border-line
                 bg-canvas px-4"
      data-testid="app-header"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="前の画面へ戻る"
          className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-badge
                     text-ink-muted transition hover:bg-brand-soft hover:text-brand"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
      )}

      <div className={centered ? "flex flex-1 justify-center" : "flex-1"}>
        <BrandLogo className="h-6" />
      </div>

      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="shrink-0 text-sm font-bold text-brand transition hover:text-brand-dark"
        >
          {action.label}
        </button>
      ) : (
        /*
          お知らせと本人の欄。まだ中身が無いので押せなくしてある。
          置かない選択もあるが、そうすると後で足したときに
          右上の並びが動いて、覚えた位置が変わってしまう。
        */
        <div className="flex shrink-0 items-center gap-1 text-ink-muted/40">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center">
            <IconBell className="h-[1.125rem] w-[1.125rem]" />
          </span>
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center">
            <IconPerson className="h-[1.125rem] w-[1.125rem]" />
          </span>
        </div>
      )}
    </header>
  );
}

// ------------------------------------------------------------------ 下タブ

export type TabKey = "home" | "course" | "record" | "settings";

const TABS: { key: TabKey; label: string; icon: Icon; ready: boolean }[] = [
  { key: "home", label: "ホーム", icon: IconHome, ready: true },
  { key: "course", label: "教材一覧", icon: IconBook, ready: true },
  { key: "record", label: "学習履歴", icon: IconClock, ready: false },
  { key: "settings", label: "設定", icon: IconSliders, ready: true },
];

export function BottomTabBar({
  current,
  onSelect,
}: {
  current: TabKey;
  onSelect: (key: TabKey) => void;
}) {
  return (
    <nav
      aria-label="画面の切り替え"
      data-testid="tab-bar"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95
                 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-2xl" role="list">
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
                className={`relative flex w-full flex-col items-center gap-1 px-1 py-1.5
                            text-[0.6875rem] leading-4 transition
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
 * 輪郭は影ではなく線で出す。影で浮かせた面が並ぶと、画面が
 * 「貼り重ねた紙」に見えて、読む順番が伝わらない。
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
      className={`overflow-hidden rounded-panel border border-line bg-surface
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
