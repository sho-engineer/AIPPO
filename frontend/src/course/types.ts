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
  //: 今日つくるものを最初に見せる。抽象的な学習目標だけにしない
  "outcome_preview",
  //: 選ぶのは1つだけ。60秒で最初の結果まで届かせる
  "quick_try",
  "single_choice",
  "multi_choice",
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
 * レッスンの大きな区切り。
 *
 * 20歩ぶんの点を並べても「あとどれくらいか」は読めるが、
 * 「いま何をしている最中か」は分からない。4つに束ねて名前を付けると、
 * 途中で開き直した人でも、自分の位置が言葉で分かる。
 *
 * 付けるのは骨格を組む buildLessonFlow。手書きのレッスン
 * （Lesson 0・7）には付けない。付いていなければ点の目盛りに戻る。
 */
export const LESSON_PHASES = [
  { key: "outcome", label: "完成イメージ" },
  { key: "try", label: "お試し" },
  { key: "compare", label: "比較" },
  { key: "own", label: "自分で試す" },
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
  /** concept_card の中身。 */
  card?: ConceptCard;
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

export interface Lesson {
  id: string;
  /** 一覧に出す番号。「Lesson 1」など。 */
  number: number;
  title: string;
  goal: string;

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
