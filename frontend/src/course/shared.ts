/**
 * 成果物ファーストのレッスン骨格。
 *
 * 順番はこうと決めている。
 *
 *   成果物を見る → サンプルで一度試す → 変化を観察する → 短い解説
 *   → 条件を一つ足す → 前後を比べる → 自分の課題で試す → できたことを確認
 *
 * なぜこの順番か
 * --------------
 * 先に説明してから操作させると、初心者は説明の途中で離れる。
 * 「何のためにこれを覚えるのか」が分からないまま読まされるため。
 *
 * 先に**小さな成功**を作ってから原理を出すと、
 * 解説が「さっき起きたことの説明」になり、読む理由ができる。
 *
 * だから最初の1回は、選ばせるのを**1つだけ**にする。
 * 相手・表現・長さ・形式を全部聞いてからでは、最初の結果まで遠すぎる。
 *
 * 教材が9本あるので、同じ形を9回書くと必ずずれる。
 * 骨格はここで1度だけ組み立て、レッスン固有の言い回しだけ受け取る。
 */

import type { AiAction, ConceptCard, LessonStep, StepOption } from "./types";

/** 条件を1つだけ足すときの選択肢。 */
export const CONDITION_OPTIONS: StepOption[] = [
  { value: "もっと短く", label: "もっと短く", icon: "scissors" },
  { value: "もっと丁寧に", label: "もっと丁寧に", icon: "heart" },
  { value: "やわらかく", label: "やわらかく", icon: "smile" },
  { value: "要点を先に", label: "要点を先に", icon: "list-ordered" },
  { value: "箇条書きにする", label: "箇条書きにする", icon: "list-bullet" },
  { value: "", label: "自分で条件を追加", free: true, icon: "plus" },
];

/** 長さの選択肢。自分の課題のときに使う。 */
export const LENGTH_OPTIONS: StepOption[] = [
  { value: "1行", label: "1行" },
  { value: "3行くらい", label: "3行くらい" },
  { value: "半分の長さ", label: "半分の長さ" },
  { value: "今のままの長さ", label: "今のままの長さ" },
  { value: "", label: "そのほか", free: true },
];

/** 誰向けか。最初の1回は3つに絞る。多いと選べない。 */
export const AUDIENCE_OPTIONS: StepOption[] = [
  { value: "上司", label: "上司", icon: "person" },
  { value: "同僚", label: "同僚", icon: "people" },
  { value: "顧客", label: "顧客", icon: "building" },
];

/**
 * 「どこが変わったと思いますか」の選択肢。
 *
 * 正誤を強く付けない。**「よく分からない」でも進める**のが肝心で、
 * ここで間違い扱いされると、次から選ばずに飛ばすようになる。
 */
export const OBSERVATION_OPTIONS: StepOption[] = [
  { value: "短くなった", label: "短くなった" },
  { value: "丁寧になった", label: "丁寧になった" },
  { value: "要点が先に来た", label: "要点が先に来た" },
  { value: "相手に合った表現になった", label: "相手に合った表現になった" },
  { value: "よく分からない", label: "よく分からない" },
];

export interface FlowOptions {
  /** AI に何を頼むか。 */
  aiAction: AiAction;

  // -- 最初の1回（QUICK_TRY） --------------------------------------------
  /** 事前に入れておく本文。空欄から始めさせない。 */
  sampleText: string;
  /** 最初に選ばせる**唯一**の項目。 */
  quickTitle: string;
  quickInstruction: string;
  quickKey: string;
  quickOptions: StepOption[];
  /** 選ばなかった条件の既定値。最初の1回を成立させるために埋める。 */
  quickDefaults: Record<string, string>;

  /** 生成中に出す一言。「考えています」だけにしない。 */
  working: string;
  /** 観察の選択肢。省略すると共通のものを使う。 */
  observationOptions?: StepOption[];
  /**
   * 「条件を一つ足す」の選択肢。省略すると共通のものを使う。
   *
   * 共通のもの（もっと短く・もっと丁寧に・やわらかく…）は**文章を直す**
   * 言い回しで、文章以外を扱う回には当たらない。比べる回に「もっと丁寧に」
   * を出しても、足す条件として意味をなさない。
   */
  conditionOptions?: StepOption[];
  /** 短い解説。**3枚まで**。 */
  conceptCards: ConceptCard[];
  /** 結果を見るときの着眼点。 */
  reviewPoints: string[];

  // -- 自分の課題 --------------------------------------------------------
  realTaskLabel: string;
  realTaskPlaceholder: string;
  /** 自分の課題で追加で聞くこと。1画面1判断で並べる。 */
  realTaskSteps?: LessonStep[];

  takeaway: string;
  nextSuggestion: string;
  /** 事実確認をとくに促すか（比較・計画）。 */
  factCheck?: boolean;
}

/** 解説カードは3枚まで。増えた時点で講義に戻っている。 */
export const MAX_CONCEPT_CARDS = 3;

function conceptSteps(cards: ConceptCard[]): LessonStep[] {
  return cards.slice(0, MAX_CONCEPT_CARDS).map((card, index) => ({
    id: `concept_${index + 1}`,
    type: "concept_card" as const,
    phase: "try" as const,
    title: card.title,
    poMessage: card.body,
    poEmotion: "neutral" as const,
    // 解説は必ず飛ばせる。読みたくない人を足止めしない
    skippable: true,
    card,
  }));
}

export function buildLessonFlow(options: FlowOptions): LessonStep[] {
  const review = {
    reviewPoints: options.reviewPoints,
    factCheck: options.factCheck ?? false,
  };

  return [
    {
      id: "outcome_preview",
      type: "outcome_preview",
      phase: "outcome",
      title: "今日つくるもの",
      poMessage: "まず、できあがりを見てみましょう。",
      poEmotion: "neutral",
    },
    {
      // 選ぶのは1つだけ。ここを増やすと最初の結果が遠くなる
      id: "quick_try",
      type: "quick_try",
      phase: "try",
      title: options.quickTitle,
      instruction: options.quickInstruction,
      poMessage: "ひとつ選ぶだけで、すぐ結果が見られます。",
      poEmotion: "question",
      key: options.quickKey,
      required: true,
      options: options.quickOptions,
      aiAction: options.aiAction,
      meta: {
        sampleText: options.sampleText,
        defaults: options.quickDefaults,
      },
    },
    {
      id: "generate_first",
      type: "ai_generate",
      phase: "try",
      title: "AIに送っています",
      instruction: options.working,
      poMessage: "送っています。少しだけ待ってください。",
      poEmotion: "thinking",
      aiAction: options.aiAction,
    },
    {
      id: "observe_result",
      type: "observation",
      phase: "try",
      title: "どこが変わったと思いますか",
      instruction: "当てはまると思うものを選んでください。いくつでも大丈夫です。",
      poMessage: "正解を当てる問題ではありません。気づいたことを選んでください。",
      poEmotion: "question",
      key: "observation",
      options: options.observationOptions ?? OBSERVATION_OPTIONS,
      meta: review,
    },
    ...conceptSteps(options.conceptCards),
    {
      id: "add_condition",
      type: "condition_choice",
      phase: "compare",
      title: "条件を一つ足してみましょう",
      instruction: "一度に一つだけ選ぶのがコツです。",
      poMessage: "一度で完成させなくて大丈夫です。足すたびに近づきます。",
      poEmotion: "hint",
      key: "condition",
      required: true,
      options: options.conditionOptions ?? CONDITION_OPTIONS,
      aiAction: { ...options.aiAction, action: "improve", inputs: {} },
    },
    {
      id: "generate_improved",
      type: "ai_generate",
      phase: "compare",
      title: "AIに送っています",
      instruction: "足した条件だけを直してもらっています。",
      poMessage: "送っています。少しだけ待ってください。",
      poEmotion: "thinking",
      aiAction: { ...options.aiAction, action: "improve", inputs: {} },
    },
    {
      id: "compare_results",
      type: "result_compare",
      phase: "compare",
      title: "変わり方を見比べる",
      instruction: "元の文章・1回目・条件を足したあと、の3つを比べます。",
      poMessage:
        "「誰向けか」と「どうしたいか」を伝えると、結果を調整できます。",
      poEmotion: "talking",
      meta: { ...review, threeWay: true },
    },
    {
      id: "real_task_intro",
      type: "safety_check",
      phase: "own",
      title: "次は、自分の文章で試してみましょう",
      instruction: "どうしますか？",
      poMessage: "会社の秘密や個人情報は入力しないようにしましょう。",
      poEmotion: "warning",
      key: "real_task_choice",
      options: [
        { value: "自分で入力する", label: "自分で入力する" },
        { value: "貼り付ける", label: "クリップボードから貼り付ける" },
        { value: "別のサンプルを試す", label: "別のサンプルを試す" },
      ],
    },
    {
      id: "real_task",
      type: "real_task",
      phase: "own",
      title: "自分の文章",
      instruction: options.realTaskLabel,
      poMessage: "自分の仕事のことで試すと、そのまま使えるようになります。",
      poEmotion: "hint",
      key: "real_task_text",
      placeholder: options.realTaskPlaceholder,
      /*
        空のままでは進めない。

        短いだけなら止めない（要件 §6.6 のとおり提案にとどめる）が、
        1文字も無いのは別で、そのまま進むと空の依頼を AI へ送ることになる。
        書きたくない人には「今回はスキップする」を別に置いてある。
      */
      required: true,
      validationRules: { suggestLength: 20, maxLength: 5000 },
    },
    ...(options.realTaskSteps ?? []),
    {
      // 自分で条件を組み立てた回だけ、送る前に依頼内容を見せる。
      // 最初の1回で挟むと、成功までが遠くなって離脱する。
      id: "prompt_preview",
      type: "prompt_preview",
      phase: "own",
      title: "AIにはこう伝えます",
      instruction: "送る前に、どう伝わるかを確かめましょう。",
      poMessage: "この内容でお願いします。直したいところがあれば戻れます。",
      poEmotion: "talking",
      aiAction: options.aiAction,
    },
    {
      id: "generate_real",
      type: "ai_generate",
      phase: "own",
      title: "AIに送っています",
      instruction: options.working,
      poMessage: "送っています。少しだけ待ってください。",
      poEmotion: "thinking",
      aiAction: options.aiAction,
    },
    {
      id: "real_task_result",
      type: "result_compare",
      phase: "own",
      title: "自分の文章の結果",
      instruction: "そのまま使える形になっているか見てみましょう。",
      poMessage: "使えそうなら、そのまま今日の仕事に持っていけます。",
      poEmotion: "celebrate",
      meta: review,
    },
    {
      id: "reflection",
      type: "reflection",
      phase: "own",
      title: "ふりかえり",
      instruction: "今日おぼえたことを確認しましょう。",
      poMessage: options.takeaway,
      poEmotion: "neutral",
    },
    {
      id: "completion",
      type: "completion",
      phase: "own",
      title: "できるようになりました",
      poMessage: options.nextSuggestion,
      poEmotion: "celebrate",
    },
  ];
}
