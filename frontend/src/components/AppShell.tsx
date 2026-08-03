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

export function AppHeader({ onBack, action, centered }: AppHeaderProps) {
  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-3 bg-canvas/85 px-5 py-3 backdrop-blur"
      data-testid="app-header"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="前の画面へ戻る"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full
                     border border-line bg-surface text-ink-muted shadow-card
                     transition hover:border-brand-line hover:text-brand"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>
      )}

      <div className={centered ? "flex flex-1 justify-center" : "flex-1"}>
        <BrandLogo className="h-8" />
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
        <div className="flex shrink-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted/45"
          >
            <IconBell className="h-5 w-5" />
          </span>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full
                       bg-brand-soft text-brand/45"
          >
            <IconPerson className="h-5 w-5" />
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
              <button
                type="button"
                disabled={!tab.ready}
                aria-current={active ? "page" : undefined}
                onClick={() => onSelect(tab.key)}
                className={`flex w-full flex-col items-center gap-1 rounded-card px-1 py-2
                            text-[0.6875rem] leading-4 transition
                            disabled:cursor-not-allowed disabled:text-ink-muted/40
                            ${
                              active
                                ? // うすい青の上では一段濃い青にする。
                                  // brand のままだと 4.42 で 4.5 に届かない
                                  "bg-brand-soft font-bold text-brand-dark"
                                : "text-ink-muted hover:text-ink"
                            }`}
              >
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
    brand: "bg-brand-grad text-white",
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
 * 白い面。下地が白に近いので、輪郭は線ではなく影で出す。
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
      className={`overflow-hidden rounded-panel bg-surface shadow-card
                  ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

/** 印＋見出し。カードの1行目に置く。 */
export function CardHeading({
  icon,
  tone,
  children,
  action,
}: {
  icon: Icon;
  tone?: Parameters<typeof IconBadge>[0]["tone"];
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <IconBadge icon={icon} tone={tone} />
      <h2 className="min-w-0 flex-1 text-base font-bold">{children}</h2>
      {action}
    </div>
  );
}

/** 小さな添え物。所要時間・むずかしさなど。 */
export function MetaPill({
  icon: Glyph,
  label,
  value,
}: {
  icon: Icon;
  label?: string;
  value: ReactNode;
}) {
  return (
    <span className="flex items-center gap-2 text-sm">
      <Glyph className="h-4 w-4 shrink-0 text-brand" />
      {label && <span className="text-ink-muted">{label}</span>}
      <span className="font-bold">{value}</span>
    </span>
  );
}
