/**
 * アプリ全体の画面遷移。
 *
 * レッスンの中の進行（course/engine.ts）とは別の層。
 * こちらは「ようこそ → ホーム → コース一覧 → レッスン」と、設定を扱う。
 *
 * 入口が2枚ある
 * -------------
 *     WELCOME          はじめて来た人。名乗りと、始め方3つ
 *     DIAGNOSIS_INTRO  始めた直後の1度だけ。診断への案内
 *
 * どちらも下タブを出さない。**まだ「アプリの中」ではない**ので、
 * 行き先を5つ並べても選びようがない。どちらを出すか（あるいは
 * どちらも出さずにホームへ行くか）は `app/entry.ts` が決める。
 *
 * ホームとコース一覧を分けたのは、支給デザインの下タブに合わせたため。
 * ホームは「今日どこから始めるか」、コース一覧は「どのコースにするか」を
 * 決める場所で、役割が違う。1画面に混ぜると、どちらの用も中途半端になる。
 *
 * コースは3段
 * -----------
 *     COURSE（どれにするか） → COURSE_DETAIL（道のり） → LESSON（学ぶ）
 *
 * 前は COURSE から直接 LESSON へ行っていた。コースが1つしか無いあいだは
 * それで足りたが、7つに増えると「どのコースの何本目か」が画面から
 * 消える。段を1つ足して、いまどのコースの中にいるかを常に持たせる。
 *
 * 画面数が少ないうちはルーターを入れない。
 * URL共有やブラウザバックが要るようになった時点で導入する。
 */

export const SCREENS = [
  // はじめて来た人の入口。名乗りと、始め方3つ
  "WELCOME",
  // 始めた直後に1度だけ出る、診断への案内
  "DIAGNOSIS_INTRO",
  "HOME",
  "COURSE",
  "COURSE_DETAIL",
  "LESSON",
  // 「こんな使い方もできます」のくわしい説明。完了画面から来る
  "RECIPE",
  "RECORD",
  // AI技図鑑。「何ができるようになったか」を見る場所
  "SKILLS",
  // 学習マップ。「いまどの段で、次に何が要るか」を見る場所
  "MAP",
  // マイ成果物。「何を作ったか」を取り出す場所
  "WORKS",
  "SAVED",
  "SETTINGS",
] as const;

export type Screen = (typeof SCREENS)[number];

export type ScreenEvent =
  | "START"
  | "SELECT_LESSON"
  | "BACK_TO_HOME"
  | "OPEN_COURSE"
  | "OPEN_COURSE_DETAIL"
  | "OPEN_RECIPE"
  | "OPEN_DIAGNOSIS_INTRO"
  | "OPEN_RECORD"
  | "OPEN_SKILLS"
  | "OPEN_MAP"
  | "OPEN_WORKS"
  | "OPEN_SAVED"
  | "OPEN_SETTINGS"
  | "BACK_TO_WELCOME";

const TRANSITIONS: Record<Screen, Partial<Record<ScreenEvent, Screen>>> = {
  /*
    ようこそ。ここから出る道は2つ。

      START           ゲストで始める。案内を経て、あるいは直接ホームへ
      OPEN_DIAGNOSIS  登録・ログインが済んだ直後。案内へ

    どちらに進むかを決めるのは `app/entry.ts`。この表は
    「その行き先があること」だけを持つ。
  */
  WELCOME: { START: "HOME", OPEN_DIAGNOSIS_INTRO: "DIAGNOSIS_INTRO" },
  /*
    診断への案内。**行き止まりにしない。**

      SELECT_LESSON  「診断をはじめる」。1問目へ直行する
      BACK_TO_HOME   「あとで」。そのままホームへ
  */
  DIAGNOSIS_INTRO: { SELECT_LESSON: "LESSON", BACK_TO_HOME: "HOME" },
  HOME: {
    SELECT_LESSON: "LESSON",
    OPEN_COURSE: "COURSE",
    OPEN_MAP: "MAP",
    // ホームの「学習の道のり」から、いま学んでいるコースの道のりへ。
    // 一覧を経由させない——どのコースを見たいかは、もう決まっている
    OPEN_COURSE_DETAIL: "COURSE_DETAIL",
    OPEN_RECORD: "RECORD",
    OPEN_SKILLS: "SKILLS",
    OPEN_WORKS: "WORKS",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_WELCOME: "WELCOME",
  },
  COURSE: {
    // 続きの1本は、一覧から直接ひらける。読みたいのは中身であって、
    // 途中の画面ではない
    SELECT_LESSON: "LESSON",
    OPEN_COURSE_DETAIL: "COURSE_DETAIL",
    BACK_TO_HOME: "HOME",
    OPEN_RECORD: "RECORD",
    OPEN_SKILLS: "SKILLS",
    OPEN_WORKS: "WORKS",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_WELCOME: "WELCOME",
  },
  // コースの中身。ここから戻る先は、必ずコース一覧
  COURSE_DETAIL: {
    SELECT_LESSON: "LESSON",
    OPEN_COURSE: "COURSE",
    // 「作れるようになるもの」から、やり方の説明へ
    OPEN_RECIPE: "RECIPE",
    BACK_TO_HOME: "HOME",
    OPEN_RECORD: "RECORD",
    OPEN_SKILLS: "SKILLS",
    OPEN_WORKS: "WORKS",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_WELCOME: "WELCOME",
  },
  // レッスンを終えたらホームへ戻す。行き止まりにしない（憲章 原則 I）
  LESSON: {
    BACK_TO_HOME: "HOME",
    // 診断の結果と完了画面から、次に何が要るかを見に行ける
    OPEN_MAP: "MAP",
    OPEN_COURSE: "COURSE",
    OPEN_COURSE_DETAIL: "COURSE_DETAIL",
    // 完了画面の「こんな使い方もできます」から、くわしい説明へ
    OPEN_RECIPE: "RECIPE",
    BACK_TO_WELCOME: "WELCOME",
  },
  /*
    使い方のくわしい説明。

    ここから足りない技のレッスンへ入れる（読んで終わりにしない）。
    戻る先はホーム——来たのは完了画面からで、そこへ戻しても
    同じレッスンをもう一度終える画面が出るだけになる。
  */
  RECIPE: {
    SELECT_LESSON: "LESSON",
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_RECORD: "RECORD",
    OPEN_SKILLS: "SKILLS",
    OPEN_WORKS: "WORKS",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_WELCOME: "WELCOME",
  },
  // 学習履歴。ここから同じ教材をやり直せるので、レッスンへも出られる
  RECORD: {
    SELECT_LESSON: "LESSON",
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    // 「何を学んだか」の隣に「何ができるか」を置く
    OPEN_SKILLS: "SKILLS",
    OPEN_WORKS: "WORKS",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_WELCOME: "WELCOME",
  },
  /*
    AI技図鑑。ここから「習得する」で教材へ入れる。

    読んで終わりにしない——取れていない技の隣に、取れる教材への
    行き先を必ず置く。
  */
  SKILLS: {
    SELECT_LESSON: "LESSON",
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    // 「何ができるか」の隣に「次に何が要るか」を置く
    OPEN_MAP: "MAP",
    OPEN_RECORD: "RECORD",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_WELCOME: "WELCOME",
  },
  /*
    マイ成果物。作ったものを取り出す場所。

    ここからも教材へ入れる——「これをもう一度」で戻ってくるのが、
    この画面のいちばん多い使われ方になる。
  */
  WORKS: {
    SELECT_LESSON: "LESSON",
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_RECORD: "RECORD",
    OPEN_SKILLS: "SKILLS",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_WELCOME: "WELCOME",
  },
  /*
    学習マップ。**行き止まりにしない。**

    足りない技のレッスンへ、ここから直接入れる。見て終わりにすると、
    「あと2つ」と言われた人が、どこへ行けばよいか分からないまま
    画面を閉じることになる。
  */
  MAP: {
    SELECT_LESSON: "LESSON",
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_SKILLS: "SKILLS",
    OPEN_RECORD: "RECORD",
    OPEN_WORKS: "WORKS",
    OPEN_SAVED: "SAVED",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_WELCOME: "WELCOME",
  },
  // 取っておいた教材の置き場。ここからそのまま開ける
  SAVED: {
    SELECT_LESSON: "LESSON",
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_RECORD: "RECORD",
    OPEN_SKILLS: "SKILLS",
    OPEN_WORKS: "WORKS",
    OPEN_SETTINGS: "SETTINGS",
    BACK_TO_WELCOME: "WELCOME",
  },
  // 設定はどこからでも抜けられる
  SETTINGS: {
    BACK_TO_HOME: "HOME",
    OPEN_COURSE: "COURSE",
    OPEN_RECORD: "RECORD",
    OPEN_SKILLS: "SKILLS",
    OPEN_WORKS: "WORKS",
    OPEN_SAVED: "SAVED",
    BACK_TO_WELCOME: "WELCOME",
  },
};

/** 遷移表に無いイベントは無視し、現在の画面を維持する。 */
export function nextScreen(screen: Screen, event: ScreenEvent): Screen {
  return TRANSITIONS[screen][event] ?? screen;
}

export function canTransition(screen: Screen, event: ScreenEvent): boolean {
  return event in TRANSITIONS[screen];
}
