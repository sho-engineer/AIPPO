/**
 * 画面で使う小さな絵。
 *
 * 絵文字は使わない。理由が3つある。
 *
 * - 端末ごとに絵が違う。Windows・Mac・Android で別物になる
 * - 色を指定できない。ブランドの色に揃えられず、そこだけ浮く
 * - 大きさと余白が字と同じ扱いになり、行の中で揃わない
 *
 * ここでは線画だけを置く。塗りは使わず、太さと角の丸みを揃える。
 * 色は指定せず `currentColor` に任せ、置いた側で決める。
 *
 * すべて飾りなので、読み上げには出さない（`aria-hidden`）。
 * 意味は必ず隣の文字で伝えること。
 */

import type { ReactNode } from "react";

export type IconProps = {
  className?: string;
};

/** アイコン1つ分の型。配列に入れて回すときに使う。 */
export type Icon = (props: IconProps) => JSX.Element;

/** 線の太さと端の形。全部そろえないと、並べたときにちぐはぐになる。 */
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...STROKE}
    >
      {children}
    </svg>
  );
}

// ------------------------------------------------------------ 手順・操作

/** チェックの付いた用紙。質問に答える。 */
export function IconChecklist({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
      <path d="M9 3.5h6v2.2H9z" />
      <path d="M8.5 11l1.6 1.6L13 9.8" />
      <path d="M8.5 16.4h7" />
    </Svg>
  );
}

/** 吹き出し2つ。AIに頼む。 */
export function IconChat({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 8.2a2.5 2.5 0 0 1 2.5-2.5h7a2.5 2.5 0 0 1 2.5 2.5v3.4a2.5 2.5 0 0 1-2.5 2.5H8.2L5 17v-2.9a2.5 2.5 0 0 1-1.5-2.3z" />
      <path d="M17.5 9.4h1a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-1.5 2.3v2.4l-2.8-2.2h-3.3" />
    </Svg>
  );
}

/** 用紙とペン。自分の文章で試す。 */
export function IconWrite({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14.5 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h7" />
      <path d="M8 8h5M8 11.5h4" />
      <path d="M19.8 10.6l1.3 1.3a1.2 1.2 0 0 1 0 1.7l-5.6 5.6-2.6.6.6-2.6 5.6-5.6a1.2 1.2 0 0 1 1.7 0z" />
    </Svg>
  );
}

/** 鉛筆だけ。自分で書く。 */
export function IconPencil({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M16.6 3.9l3.5 3.5a1.3 1.3 0 0 1 0 1.9L8.4 21 3.5 22l1-4.9L16.2 5.4l-1.5-1.5z" />
      <path d="M14.7 5.8l3.5 3.5" />
    </Svg>
  );
}

/** クリップボード。貼り付ける。 */
export function IconPaste({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 5.2H6.8A2.3 2.3 0 0 0 4.5 7.5v11.2a2.3 2.3 0 0 0 2.3 2.3h6" />
      <path d="M9 3.2h6v3.2H9z" />
      <rect x="11.5" y="9.5" width="8" height="11.5" rx="2" />
    </Svg>
  );
}

/** 用紙。別のサンプルを試す。 */
export function IconDocument({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M13.5 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9.5z" />
      <path d="M13.5 3.5v6h6" />
      <path d="M8.5 13.5h7M8.5 16.5h4.5" />
    </Svg>
  );
}

/** 早送り。今回はスキップ。 */
export function IconSkip({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 5.6l9 6.4-9 6.4z" />
      <path d="M18.5 5.4v13.2" />
    </Svg>
  );
}

// ------------------------------------------------------------ 向き・状態

/** 右向きの矢印。飛ばす・次へ。 */
export function IconArrow({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 12h14" />
      <path d="M13.5 6.8L18.9 12l-5.4 5.2" />
    </Svg>
  );
}

/** 右向きの山。もっと見る。 */
export function IconChevronRight({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.2 5.4L15.8 12l-6.6 6.6" />
    </Svg>
  );
}

/** 左向きの山。戻る。 */
export function IconChevronLeft({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14.8 5.4L8.2 12l6.6 6.6" />
    </Svg>
  );
}

/** 下向きの矢印。Before から After へ。 */
export function IconArrowDown({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 4.5v14" />
      <path d="M6.8 13.4L12 18.8l5.2-5.4" />
    </Svg>
  );
}

/** 丸の中のチェック。できた。 */
export function IconCheckCircle({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M8.4 12.2l2.4 2.4 4.8-5" />
    </Svg>
  );
}

/** チェックだけ。 */
export function IconCheck({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 12.6l4.4 4.4L19 7.4" />
    </Svg>
  );
}

/**
 * 鍵。パスキーの入口に添える。
 *
 * 錠前（IconLock）と分ける。錠前は「閉まっている・押せない」を表しており、
 * 同じ絵を使うと「使えない」に見える。ここは押せる入口なので、
 * 開ける側の絵にする。
 */
export function IconKey({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8.2" cy="8.2" r="4.4" />
      <path d="M11.4 11.4L20 20" />
      <path d="M17.2 17.2l2.2-2.2" />
    </Svg>
  );
}

/** 三角の注意。気をつけて。 */
export function IconCaution({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.9L21.4 20H2.6z" />
      <path d="M12 9.6v4.2" />
      <path d="M12 17h.01" />
    </Svg>
  );
}

/** 斜線の入った丸。ここは消してほしい。 */
export function IconBlocked({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M6.2 6.2l11.6 11.6" />
    </Svg>
  );
}

/** 時計。かかる時間。 */
export function IconClock({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.4V12l3 1.8" />
    </Svg>
  );
}

/** 四つ角の光。AIがやること・おすすめ。 */
export function IconSparkle({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.4l1.7 4.6 4.6 1.7-4.6 1.7L12 16l-1.7-4.6L5.7 9.7l4.6-1.7z" />
      <path d="M18.4 15.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </Svg>
  );
}

// ------------------------------------------------------------ 用途・分類

/** 封筒。メールや文章作成。 */
export function IconMail({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3.6 7.4l7.3 5a2 2 0 0 0 2.2 0l7.3-5" />
    </Svg>
  );
}

/** 開いた本。長い資料を読む・レッスン。 */
export function IconBook({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 6.4C10.4 5.2 8.4 4.6 5.6 4.6A1.6 1.6 0 0 0 4 6.2v10.4a1.6 1.6 0 0 0 1.6 1.6c2.8 0 4.8.6 6.4 1.8" />
      <path d="M12 6.4c1.6-1.2 3.6-1.8 6.4-1.8A1.6 1.6 0 0 1 20 6.2v10.4a1.6 1.6 0 0 1-1.6 1.6c-2.8 0-4.8.6-6.4 1.8z" />
      <path d="M12 6.4V20" />
    </Svg>
  );
}

/** 箇条書き。要約・長さ。 */
export function IconList({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 7h15M4.5 12h11M4.5 17h7" />
    </Svg>
  );
}

/** 書類ばさみ。情報を整理する。 */
export function IconFolder({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 7.4a2 2 0 0 1 2-2h3.3l2 2.4h7.7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </Svg>
  );
}

/**
 * 写真。画像をつくる・直す。
 *
 * 前はここに星（`IconSparkle`）を当てていた。あれは「AIが何か
 * すごいことをする」の記号で、絵を作る話とは関係がない。診断の
 * 選択肢に星が1つだけ光っていると、そこだけ別の意味を持って見える。
 */
export function IconImage({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.4" />
      <path d="M3.9 16.2 8.8 11.6a1.6 1.6 0 0 1 2.2 0l4.2 4M14.6 13.6l1.6-1.5a1.6 1.6 0 0 1 2.2 0l1.7 1.6" />
      <circle cx="9.1" cy="9.4" r="1.2" />
    </Svg>
  );
}

/** 電球。アイデアを考える。 */
export function IconBulb({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 16.4a6 6 0 1 1 6 0v1.4a1.4 1.4 0 0 1-1.4 1.4h-3.2A1.4 1.4 0 0 1 9 17.8z" />
      <path d="M10 21.4h4" />
    </Svg>
  );
}

/** 卓上こよみ。計画を立てる。 */
export function IconCalendar({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="5.4" width="17" height="15" rx="2.4" />
      <path d="M3.5 10h17" />
      <path d="M8 3.4v3.4M16 3.4v3.4" />
    </Svg>
  );
}

/** てんびん。選択肢を比較する。 */
export function IconScale({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 4.4v15.2" />
      <path d="M6.6 19.6h10.8" />
      <path d="M4 8.2h16" />
      <path d="M4 8.2L1.8 13.4a2.6 2.6 0 0 0 4.4 0z" />
      <path d="M20 8.2l2.2 5.2a2.6 2.6 0 0 1-4.4 0z" />
    </Svg>
  );
}

/** はてな。まだ分からない。 */
export function IconQuestion({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M9.7 9.6a2.4 2.4 0 1 1 3.1 2.4c-.6.2-.8.7-.8 1.3v.5" />
      <path d="M12 16.8h.01" />
    </Svg>
  );
}

// ------------------------------------------------------------ 人・相手

/** ひとり。上司・自分。 */
export function IconPerson({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
    </Svg>
  );
}

/** ふたり。同僚。 */
export function IconPeople({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="9.4" cy="8.4" r="3.2" />
      <path d="M3.4 19.6a6 6 0 0 1 12 0" />
      <path d="M16.4 6a3.2 3.2 0 0 1 0 6.4" />
      <path d="M17.6 14.6a6 6 0 0 1 3 5" />
    </Svg>
  );
}

/** 建物。顧客・取引先。 */
export function IconBuilding({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 20.4V5.6a1.6 1.6 0 0 1 1.6-1.6h7a1.6 1.6 0 0 1 1.6 1.6v14.8" />
      <path d="M14.7 9.4h3.7a1.6 1.6 0 0 1 1.6 1.6v9.4" />
      <path d="M3.2 20.4h17.6" />
      <path d="M7.8 8h3.4M7.8 12h3.4M7.8 16h3.4" />
    </Svg>
  );
}

// ------------------------------------------------------------ 進み具合

/** 右上がりの折れ線。学習の進み具合。 */
export function IconTrend({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.6 15.8l5-5.2 3.4 3.2 5.2-6" />
      <path d="M14 7.4h3.6V11" />
    </Svg>
  );
}

/** 棒グラフ。むずかしさ・人気。 */
export function IconBars({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 19.4v-5.2M12 19.4V8.6M18 19.4v-8" />
    </Svg>
  );
}

/** 的。今日できるようになること。 */
export function IconTarget({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="12" cy="12" r="0.6" />
    </Svg>
  );
}

/** つまみ。いまの条件。 */
export function IconSliders({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 7.6h4M12.5 7.6h7" />
      <path d="M4.5 16.4h7M15.5 16.4h4" />
      <circle cx="10.4" cy="7.6" r="2.1" />
      <circle cx="13.4" cy="16.4" r="2.1" />
    </Svg>
  );
}

/** 星。ほめ言葉に添える。 */
export function IconStar({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" />
    </Svg>
  );
}

// ------------------------------------------------------------ 画面の枠

/** 家。ホーム。 */
export function IconHome({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 10.4l8-6.2 8 6.2v8.6a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19z" />
      <path d="M9.6 20.6v-6h4.8v6" />
    </Svg>
  );
}

/** しおり。保存したもの。 */
export function IconBookmark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.4 4.6h11.2v16l-5.6-4-5.6 4z" />
    </Svg>
  );
}

/** 点3つ。その他。 */
export function IconMore({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="5.4" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="18.6" cy="12" r="1.3" />
    </Svg>
  );
}

/** ベル。お知らせ。 */
export function IconBell({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.4 10.4a5.6 5.6 0 1 1 11.2 0c0 3.3.8 5 1.8 6H4.6c1-1 1.8-2.7 1.8-6z" />
      <path d="M10 19.6a2.2 2.2 0 0 0 4 0" />
    </Svg>
  );
}

// ------------------------------------------------------------ 結果を扱う

/** 紙が2枚。手元に写す。 */
export function IconCopy({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="9" y="9" width="11.5" height="11.5" rx="2.4" />
      <path d="M15 6.6V6a2.4 2.4 0 0 0-2.4-2.4H6A2.4 2.4 0 0 0 3.6 6v6.6A2.4 2.4 0 0 0 6 15h.6" />
    </Svg>
  );
}

/** 回る矢印。もう一度。 */
export function IconRefresh({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20.4 4v4.4H16" />
    </Svg>
  );
}

/** 記章。レッスンを終えた印。 */
export function IconMedal({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="9.4" r="5.6" />
      <path d="M9.6 9.2l1.7 1.7 3.1-3.2" />
      <path d="M8.6 14.2L7 21l5-2.4L17 21l-1.6-6.8" />
    </Svg>
  );
}

/** 右向きの三角。前から後ろへ移る。 */
export function IconPlay({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8.4 5.4l8.6 6.6-8.6 6.6z" />
    </Svg>
  );
}

// ------------------------------------------------------------ 条件の種類

/** はさみ。もっと短く。 */
export function IconScissors({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="6.4" cy="18" r="2.6" />
      <circle cx="17.6" cy="18" r="2.6" />
      <path d="M8.3 16.1L19 4.4M15.7 16.1L5 4.4" />
    </Svg>
  );
}

/** 心。もっと丁寧に。 */
export function IconHeart({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 20.2l-7.3-7a4.4 4.4 0 0 1 6.2-6.2l1.1 1.1 1.1-1.1a4.4 4.4 0 0 1 6.2 6.2z" />
    </Svg>
  );
}

/** 笑顔。やわらかく。 */
export function IconSmile({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M8.6 13.6a4 4 0 0 0 6.8 0" />
      <path d="M9.4 9.6h.01M14.6 9.6h.01" />
    </Svg>
  );
}

/** 番号つきの並び。要点を先に。 */
export function IconListOrdered({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.4 6.6h10M9.4 12h10M9.4 17.4h10" />
      <path d="M4.6 5.6l1.4-.8v4M4.4 15.6a1.4 1.4 0 1 1 2.4 1L4.4 19.4h2.6" />
    </Svg>
  );
}

/** 点つきの並び。箇条書きにする。 */
export function IconListBullet({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.4 6.6h10M9.4 12h10M9.4 17.4h10" />
      <circle cx="5.2" cy="6.6" r="1.1" />
      <circle cx="5.2" cy="12" r="1.1" />
      <circle cx="5.2" cy="17.4" r="1.1" />
    </Svg>
  );
}

/** 丸の中の＋。自分で足す。 */
export function IconPlus({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 8.4v7.2M8.4 12h7.2" />
    </Svg>
  );
}

/** 星のついた棒。次はどう変えますか。 */
export function IconWand({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.6 19.4L14.8 9.2" />
      <path d="M14 5.4l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z" />
      <path d="M19.4 13.4l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z" />
    </Svg>
  );
}

// ------------------------------------------------------------ 設定まわり

/** 地球。表示する言語。 */
export function IconGlobe({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M3.8 12h16.4" />
      <path d="M12 3.8c2.1 2.2 3.2 5.1 3.2 8.2s-1.1 6-3.2 8.2c-2.1-2.2-3.2-5.1-3.2-8.2s1.1-6 3.2-8.2z" />
    </Svg>
  );
}

/** 盾。預けているものと、預けていないもの。 */
export function IconShield({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.4l7 2.6v5.4c0 4.2-2.8 7.6-7 8.8-4.2-1.2-7-4.6-7-8.8V6z" />
      <path d="M9 12.2l2 2 4-4.2" />
    </Svg>
  );
}

/**
 * 炎。続けている日数に添える。
 *
 * 数字だけを並べると、進み具合の分子（何本終えたか）と見分けが付かない。
 * 線だけで描く——塗った炎は絵文字に近づいて、画面の中で浮く。
 */
export function IconStreak({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.2c2.6 2.4 4.6 4.9 4.6 7.8a4.6 4.6 0 0 1-9.2 0c0-1.2.4-2.2 1.1-3.2.5 1 1.2 1.6 2 1.9-.4-2.4.2-4.6 1.5-6.5z" />
      <path d="M12 20.8a2.6 2.6 0 0 0 2.6-2.6c0-1.3-.9-2.3-2.6-3.6-1.7 1.3-2.6 2.3-2.6 3.6a2.6 2.6 0 0 0 2.6 2.6z" />
    </Svg>
  );
}

/**
 * 拡声器。音の設定に使う。
 *
 * 右へ出る2本の弧が「鳴っている」を表す。切ってあるときに斜線を重ねる
 * 描き分けはしない——設定の行では、入り切りは言葉とつまみが伝える。
 */
export function IconSound({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.4 9.6h3.2L12 5.8v12.4l-4.4-3.8H4.4z" />
      <path d="M15.4 9.6a3.4 3.4 0 0 1 0 4.8" />
      <path d="M17.9 7a6.9 6.9 0 0 1 0 10" />
    </Svg>
  );
}

/** 錠。まだ開けられない。 */
export function IconLock({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2.4" />
      <path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8" />
    </Svg>
  );
}
