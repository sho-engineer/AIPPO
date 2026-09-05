/**
 * 教材の型。
 *
 * 教材の中身をコンポーネントに書かないための土台。
 * ここに載っている形であれば、React を触らずにレッスンを足せる。
 *
 * 進行を決めるのはアプリであって AI ではない。
 * `next` は教材データが宣言し、engine.ts がそのとおりに進める。
 * AI の返事は表示を変えるだけで、ステップを動かさない。
 */

/** ポーの表示状態。8種類（要件 §5）。 */
export const PO_EMOTIONS = [
  "neutral",
  "question",
  "thinking",
  "talking",
  "hint",
  "warning",
  "celebrate",
  "blink",
] as const;

export type PoEmotion = (typeof PO_EMOTIONS)[number];

/** ポーが促す次の動き。画面はこれを見てボタンの見た目を変える。 */
export type PoAction = "wait" | "next" | "retry" | "show_hint" | "review" | "complete";

export interface PoMessage {
  message: string;
  emotion: PoEmotion;
  action: PoAction;
}

/** ステップの種類。要件 §8 の14種。 */
export const STEP_TYPES = [
  "intro",
  /*
    章扉。**学習の段が変わったことだけを言う。**

    前は無かった。区切りは進み具合の帯にしか出ておらず、押した次の
    瞬間に別の話が始まる——「気づいたら次の画面にいる」状態だった。
    帯は1本の線なので、**変わったことには気づけても、何に変わったのかは
    言っていない**。

    ここは1枚の絵と「つづける」だけ。教材の中身は置かない。読むもの
    ではなく、息継ぎとして置いている。
  */
  "section_transition",
  //: 今日つくるものを最初に見せる。抽象的な学習目標だけにしない
  "outcome_preview",
  //: 選ぶのは1つだけ。60秒で最初の結果まで届かせる
  "quick_try",
  "single_choice",
  "multi_choice",
  /*
    いくつかの枠を、それぞれ選んで埋める回。

    AI活用診断のミニ問題に使う。1つの問いに1つ答える形（`single_choice`）
    では、**組み立てられるか**も**対応づけられるか**も測れない。

      Q3 … 1つのお願いを3つの枠で組み立てる
            （何をしてほしい？ / 誰向け？ / どんな言い方？）
      Q4 … 3つの状況に、それぞれ合う使い方を当てる

    見た目は違うが、やっていることは同じ——**名前の付いた枠が並び、
    それぞれを一覧から選ぶ**。型を2つに分けると、その分だけ
    `poPresence` の表と検査を二重に持つことになる。

    答えは `|` でつないだ1つの文字列にする（値はすべて文字列で持つ、
    という決まりに合わせる）。全部の枠が埋まるまで「答えた」にしない。
  */
  "assemble",
  "text_input",
  "template_builder",
  "prompt_preview",
  "ai_generate",
  //: 解説の前に、自分で「どう変わったか」を見る
  "observation",
  //: 1画面1ポイントの短い解説
  "concept_card",
  //: 条件を1つだけ足して、変化を体験する
  "condition_choice",
  "result_review",
  "result_compare",
  "improvement_choice",
  "safety_check",
  "real_task",
  "reflection",
  "completion",
] as const;

export type StepType = (typeof STEP_TYPES)[number];

export interface StepOption {
  value: string;
  label: string;
  /** 選ぶと本文欄へ入る例文。用途の選択で使う。 */
  sampleText?: string;
  /** 選んだときに補足したいこと。 */
  note?: string;
  /** 「その他」。選んだときだけ自由入力欄を出す（要件 §6.3）。 */
  free?: boolean;
  /**
   * 添える絵の名前。
   *
   * ここには名前だけを置き、どの絵にするかは presentation.ts で決める。
   * 教材データが React のコンポーネントを直接持つと、
   * 教材を足すたびに画面側を触ることになる。
   */
  icon?: OptionIconName;
}

/** 選択肢に添えられる絵の名前。増やすときは presentation.ts も直す。 */
export type OptionIconName =
  | "person"
  | "people"
  | "building"
  | "mail"
  | "book"
  | "folder"
  | "bulb"
  | "calendar"
  | "scale"
  | "question"
  | "document"
  | "chat"
  // 条件を足すときの選択肢
  | "scissors"
  | "heart"
  | "smile"
  | "list-ordered"
  | "list-bullet"
  | "plus";

export interface ValidationRules {
  /** 短すぎるときは、エラーではなく提案を出す（要件 §6.6）。 */
  suggestLength?: number;
  maxLength?: number;
  required?: boolean;
}

/**
 * AI へ何を頼むか。
 *
 * `action` はバックエンドの `apps/ai/actions.py` にある id。
 * プロンプトそのものは教材に持たせない。持たせると、
 * 画面側から書き換えられるうえ、安全ルールを1か所で守れなくなる。
 *
 * `provider` / `model` は将来のモデル比較コース用。
 * 通常の教材では指定しない（利用者にモデルを意識させないため）。
 */
export interface AiAction {
  action: string;
  /** 入力キー → この AI アクションの引数名。 */
  inputs: Record<string, string>;
  /** 決め打ちで渡す値。 */
  fixed?: Record<string, string>;
  provider?: string;
  model?: string;
}

/**
 * レッスンの大きな区切り。帯の見出しに出る。
 *
 * 20歩ぶんの点を並べても「あとどれくらいか」は読めるが、
 * 「いま何をしている最中か」は分からない。4つに束ねて名前を付けると、
 * 途中で開き直した人でも、自分の位置が言葉で分かる。
 *
 * 付けるのは骨格を組む buildLessonFlow。手書きのレッスン
 * （Lesson 0・7）には付けない。付いていなければ点の目盛りに戻る。
 *
 * `deepen` を足した理由
 * ---------------------
 * 前の4つで Day1 を数えると
 * **完成イメージ1歩 / お試し3歩 / 比較4歩 / 自分で試す11歩**。
 * 最後の1つが全体の6割近くを占めていて、帯は8画面目で「4 / 4」に
 * 達したあと、**11画面ぶん止まったまま**だった。あと何回押すのかが
 * 分からない時間が、レッスンの後半ずっと続く。
 *
 * 中身を見ると、後半は性質の違う2つが混ざっていた。
 *
 *   条件を足して技を覚える（誰向けか・トーン）
 *   自分の文章でやってみる（書く・送る・確かめる）
 *
 * 前半を `deepen` として分ける。**歩数は増えない。**
 */
export const LESSON_PHASES = [
  /*
    「完成イメージ」という区切りは無くした。**1歩しか入っていない**ので、
    帯は開いた瞬間に「1 / 5」を出し、次を押すと即「2 / 5」になる。
    始まる前に終わる区切りは、あと何回押すのかを教えてくれない。
    今日つくるものを見るところは、試す前のひと呼吸として「試す」に含める。
  */
  { key: "try", label: "試す" },
  { key: "compare", label: "変える" },
  { key: "deepen", label: "深める" },
  { key: "own", label: "自分で使う" },
] as const;

export type LessonPhase = (typeof LESSON_PHASES)[number]["key"];

export interface LessonStep {
  id: string;
  type: StepType;
  title: string;
  /** どの区切りに属するか。画面上の帯の見出しに使う。 */
  phase?: LessonPhase;
  /** その画面で何をすればよいか。1画面1タスク（要件 §6.1）。 */
  instruction?: string;
  poMessage: string;
  poEmotion: PoEmotion;
  required?: boolean;
  /** 入力の保存先。同じキーを複数ステップから読める。 */
  key?: string;
  options?: StepOption[];
  placeholder?: string;
  example?: string;
  /** 段階的に出すヒント（要件 §5）。 */
  hints?: string[];
  validationRules?: ValidationRules;
  aiAction?: AiAction;
  /**
   * 次のステップ id。
   * 省略すると教材データの並び順で次へ進む。
   */
  next?: string;
  /** このステップで身につくこと。完了画面で使う。 */
  skill?: string;
  /** 種類ごとの追加設定。 */
  meta?: Record<string, unknown>;
  /** 飛ばせるか。解説カードは必ず飛ばせる。 */
  skippable?: boolean;
  /**
   * 画面の下のボタンに出す文言。
   *
   * 省くと種類ごとの既定になる（`course/primaryLabel.ts`）。
   * 同じ種類でも場面で言うことが変わるときに書く——Day1 の
   * 「誰向けか決めた」と「この言い方で書く」は、どちらも
   * `single_choice` だが別のことをしている。
   *
   * **押すと何が起きるかを書く。** 「次へ」は何も言っていない。
   */
  primaryLabel?: string;
  /** concept_card の中身。 */
  card?: ConceptCard;
  /** `assemble` の枠。並んだ順に、答えを `|` でつなぐ。 */
  parts?: AssemblePart[];
}

/**
 * 埋める枠を1つ。
 *
 * `label` は枠の名前（「誰向け？」「会議メモがバラバラで読み返しにくい」）。
 * 問いそのものはステップの見出しが言うので、ここは短くする。
 */
export interface AssemblePart {
  /** 採点で引くための名前。画面には出さない。 */
  key: string;
  label: string;
  options: StepOption[];
}

/** `assemble` の答えを、枠ごとの配列に戻す。 */
export function assembleParts(value: string): string[] {
  return value.split("|");
}

/** 枠ごとの答えを、1つの文字列にまとめる。 */
export function assembleValue(picked: string[]): string {
  return picked.join("|");
}

/** ミニ解説カードの見せ方。凝った図は作らない。 */
export const CARD_VISUALS = [
  "text",
  "before_after",
  "highlight",
  "three_points",
  "simple_flow",
] as const;

export type CardVisual = (typeof CARD_VISUALS)[number];

/**
 * 1画面1ポイントの解説。
 *
 * 制約は守る側ではなく、**データの形で守らせる**。
 * 長い説明を書けてしまうと、必ず講義スライドに戻る。
 *   タイトル 20文字 / 本文 80文字 / 1レッスン3枚まで
 * （tests/course.test.ts が検査する）
 */
export interface ConceptCard {
  title: string;
  body: string;
  visual: CardVisual;
  /** before_after のとき使う。 */
  before?: string;
  after?: string;
  /** highlight のとき、強調する語。 */
  highlight?: string;
  /** three_points / simple_flow のとき使う。 */
  points?: string[];

  /**
   * 見返すときに出す、**別の例**。
   *
   * 飛ばした解説をあとで見るとき、同じ文をもう一度出しても
   * 「さっき飛ばしたもの」でしかない。読まなかった理由が
   * 「その例がぴんと来なかった」ことなら、二度目も同じになる。
   *
   * 別の例を1つ持たせておけば、同じ理屈を違う場面で見せられる。
   * **AIは呼ばない。**その場で作らせると、見返すたびに費用がかかるうえ、
   * 出来がその時々で変わって、教材として確かめられなくなる。
   *
   * 省略してよい。無ければ、見返しでも元の例をそのまま出す。
   */
  reviewExample?: {
    /** 言い換えた説明。無ければ本文をそのまま使う。 */
    body?: string;
    before?: string;
    after?: string;
    points?: string[];
  };
}

/**
 * 教材の種類。
 *
 * standard        … 利用者にモデルを意識させない（通常の教材）
 * model_comparison … モデル名と得手不得手を見せる（将来のコース）
 */
export type LessonMode = "standard" | "model_comparison";

/** いま始められるか。 */
export type LessonAvailability = "available" | "coming_soon";

/**
 * むずかしさの目安。
 *
 * いまはコースにだけ付けている。レッスン1本ずつに付けると、
 * 9本すべてが「初級」と並ぶだけで、何の手がかりにもならない。
 */
export type Difficulty = "beginner" | "intermediate" | "advanced";

/**
 * コースの中の STEP。
 *
 * 8本を平らに並べると、8回ぶんの一本道に見える。3つに束ねて名前を
 * 付けると「いま何をしている最中か」が言葉で分かる。
 *
 * 束はサーバーが決める（`Lesson.stage_key` が続くひとかたまり）。
 * 画面はここに来た順にそのまま描く——並べ替えない。
 */
export interface CourseStage {
  key: string;
  title: string;
  /** この束に入るレッスンの id。コースの並び順そのまま。 */
  lessonIds: string[];
}

export interface Lesson {
  id: string;
  /** 一覧に出す番号。「Day 1」など。0 は Day として数えない（診断）。 */
  number: number;
  title: string;
  goal: string;
  /** どの STEP に属するか。属さないものは空か省略。 */
  stageKey?: string;

  /**
   * 一覧やカードに出す絵。`public/` からの道筋。
   *
   * 省略してよい。無ければ `course/lessonThumbnail.ts` の表を引く
   * （サーバーから届く教材データがまだこれを持っていないため）。
   * 絵の有無は**公開状態とは関係が無い**。始められるかどうかは
   * `availability` が決める。
   */
  thumbnail?: string;

  /** 今日つくるもの。最初の画面に出す。 */
  outcomeTitle?: string;
  outcomeDescription?: string;
  /** だいたいの所要時間（分）。先が見えないと始めにくい。 */
  estimatedMinutes?: number;
  /** 完成イメージ。抽象的な説明より、これ1組のほうが伝わる。 */
  beforeExample?: string;
  afterExample?: string;
  /** 今日できるようになること。完了画面に出す。 */
  learnedSkills?: string[];

  /** 何ができるようになるか。進捗画面に出す。 */
  outcomes: string[];
  /** 診断結果からの推薦に使う。 */
  tags: string[];
  /** AI を使うか。Lesson 0 と 7 は使わない。 */
  usesAi: boolean;
  /** 既定は standard。将来のモデル比較コース用の目印。 */
  mode?: LessonMode;

  /**
   * いま始められるか。
   *
   * 「一覧に出すか」とは別。近日公開の教材は一覧に出るが始められない。
   * 1つの項目で表そうとすると、近日公開のつもりが一覧から消える。
   *
   * 省略されたときは available とみなす。教材を同梱データから読む
   * （サーバーへ届かない）場合に、全部が近日公開になると何も始められない。
   */
  availability?: LessonAvailability;
  /** 決まっているときだけ入る。無ければ日付を出さない。 */
  plannedReleaseDate?: string;
  comingSoonMessage?: string;

  steps: LessonStep[];
}

export interface Course {
  id: string;
  title: string;
  description: string;
  /**
   * 終えると何ができるようになるか。**1文。**
   *
   * レッスンごとの成果を全部並べると、始める前の人には長すぎる。
   * 1本ずつの詳しい話は、レッスンの最初の画面（完成イメージ）が持つ。
   */
  outcome?: string;
  /**
   * STEP の束。
   *
   * 省略されていたら束にしない（古い応答との互換）。そのときは
   * レッスンが平らに並ぶだけで、画面は壊れない。
   */
  stages?: CourseStage[];
  /** 一覧のカードに出す目安。レッスンごとの難易度とは別。 */
  difficulty?: Difficulty;
  /**
   * いま始められるか。
   *
   * レッスンと同じで、「一覧に出すか」とは別に持つ。
   * 中身がまだ無いコースも、何ができるようになるかを先に見せたい。
   * そのとき、出すことと始められることを1つの項目で表すと、
   * 出した瞬間に始められてしまう。
   *
   * 省略されていたら「始められる」とみなす（古い応答との互換）。
   */
  availability?: LessonAvailability;
  /** 近日公開のときに添える一言。空なら既定の文言。 */
  comingSoonMessage?: string;
  lessons: Lesson[];
}

/** 学習者が入力した値。すべて文字列で持つ（保存と復元を単純にするため）。 */
export type StepValues = Record<string, string>;
