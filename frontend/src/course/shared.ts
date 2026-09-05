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

import type {
  AiAction,
  ConceptCard,
  LessonPhase,
  LessonStep,
  StepOption,
} from "./types";

/**
 * 章扉1枚ぶん。**1つの章について言うことは、ここに全部ある。**
 *
 * 前は絵だけ別の表（`course/teachingImages.ts`）が持っていた。章扉を
 * 1枚足すのに2つのファイルを直すことになり、**片方を忘れても
 * それらしく動く**——絵の無い章扉が出るだけなので、画面を見るまで
 * 気づけない。Day2 以降へ広げると、その分岐が8日ぶんに増える。
 *
 * 番号・題・絵・次にやること（`before`）を1か所にまとめてある。
 * 差し替えるときも、足すときも、見るのはここだけ。
 */
export interface SectionTransition {
  /**
   * 章の番号。
   *
   * 絵の中にも「Section 1」と焼き込まれている。**同じ番号を2か所に
   * 書くことになる**が、片方は絵の中で読めないので、読める側を
   * 持っておく（読み上げに渡すのと、並びの検査に使う）。
   */
  number: number;
  /** ステップの id（`section_1` など）。 */
  id: string;
  /** このステップの**直前**へ挟む。＝この章で最初にやること。 */
  before: string;
  /** 読み上げと、絵が出ないときの見出し。 */
  title: string;
  /**
   * 進み具合の帯に出す短い名前。
   *
   * 見出し（「まずは試してみよう」）をそのまま帯に出すと、4つ並んだ
   * ときに1つも読めない幅になる。帯は「試す」「相手」のように詰める。
   */
  label: string;
  poMessage: string;
  /**
   * 章扉の絵。**画面いっぱいに出す1枚。**
   *
   * 実寸を書くのは、読み込む前と後で箱の高さを変えないため
   * （書かないと絵が届いた瞬間に下のボタンが飛ぶ）。
   * 絵を差し替えたら、ここも測り直すこと——
   * `tests/sectionTransition.test.tsx` が実物と突き合わせる。
   */
  image: {
    src: string;
    /** 何の絵かを1文で。**絵の中の文字を書き写さない**（題は `title`）。 */
    alt: string;
    width: number;
    height: number;
  };
}

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

/**
 * 誰向けか。最初の1回は3つに絞る。多いと選べない。
 *
 * いまはどの教材からも参照していない（Day1 が使うのをやめた——役職ではなく
 * 「どれだけ知っているか」で分けたかったため）。教材を足すときの下敷きとして
 * 残してある。
 */
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
  /**
   * 結果を見たあとの問いかけ。省略すると共通のものを使う。
   *
   * **教材ごとに違う。** Day1 は「読みやすくなった？」、Day2 は
   * 「短くなった？」。骨格に書くとどれか1本の言い回しが全部に付く。
   */
  observeTitle?: string;
  /** 観察の選択肢。省略すると共通のものを使う。 */
  observationOptions?: StepOption[];
  /**
   * 「まだ微妙」を選んだ人にだけ聞く、任意の理由。
   *
   * 選択肢を2つに減らすと画面は軽くなるが、**何に気づいたかが
   * 測れなくなる**。困っている人にだけ、その場で1行聞く形にすれば
   * 両立できる。答えなくても進める。
   */
  observeReasons?: StepOption[];
  /**
   * 結果を見て答えたあとの、下のボタンの文言。
   *
   * 既定は「条件を足してみる」——ふつうはそこが次の画面だから。
   * Day1 は解説を1枚（プロンプト）挟むので、**押した先に書いてある
   * ものが来ない**（`tests/primaryLabel.test.ts` が捕まえた）。
   * 挟む教材は、挟んだ先を言う言葉に差し替える。
   */
  observePrimaryLabel?: string;
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
  /**
   * その解説で覚える技の名前。`conceptCards` と同じ並び。
   *
   * カードの見出しは**やさしい言い方**（「誰向けかを伝える」）で、
   * こちらは**技の名前**（「ターゲット指定」）。分けているのは、
   * 名前だけ見せても何のことか分からず、やさしい言い方だけでは
   * 他所で通じないため。画面は名前を先に、言い換えを下に出す。
   *
   * AI分野で普通に使われている言葉にする。AIPPO だけの造語は使わない
   * ——ここで覚えた言葉が、外の記事や同僚との会話で通じなくなる。
   *
   * 省いてよい。無ければ、その解説では技の名前を渡さない。
   */
  conceptSkills?: string[];
  /**
   * その解説をどのステップの手前へ置くか。`conceptCards` と同じ並び。
   *
   * 空（または並びが足りない）ときは、これまでどおり比べたあと
   * （`compare_results` の直後）にまとめて出る。
   *
   * なぜ要るか
   * ----------
   * Day1 の「プロンプト」は、**自分が送った文がまだ画面に残っている
   * うちに**出さないと意味が無い。「さっき送ったこれがプロンプト」と
   * 言うためのカードなので、比べたあとまで待つと指すものが消えている。
   */
  conceptAnchors?: (string | undefined)[];
  /**
   * 章扉。段が変わる切れ目で、1枚だけ挟む。
   *
   * `before` に置いたステップの**直前**へ入る。並びは書いた順。
   * 同じ `before` を2つ書けば、書いた順に2枚続く。
   */
  sections?: SectionTransition[];
  /** 結果を見るときの着眼点。 */
  reviewPoints: string[];

  /**
   * 技をもう少し深める回。**自分の文章を書く前**に置く。
   *
   * ここに来るのは、条件を選ぶ回と、その技の解説。前は
   * `realTaskSteps` に入れて自分の文章を書いた**あと**に置いていたが、
   * そうすると「自分の文章を書く → 誰向け？ → トーンの解説 →
   * トーンを選ぶ → 送る」となり、書き終えた人を足止めしてから
   * 送ることになる。
   *
   * 条件も解説も、自分の文章とは関係なく決められる。先に済ませて、
   * 自分の文章を書いてからは**書く → 確かめる → 送る**を続けさせる。
   */
  deepenSteps?: LessonStep[];

  // -- 自分の課題 --------------------------------------------------------
  realTaskLabel: string;
  realTaskPlaceholder: string;
  /**
   * 自分の文章の回で出すヒント。
   *
   * **答えを全部は言わない。** 次に試す条件を1つだけ示す。
   * 「こう書けば正解」と渡すと、自分で条件を選ぶ練習にならない。
   *
   * 仕組み（`showHint` と「ヒントを見る」ボタン）は前からあったが、
   * **どの教材もヒントを1つも持っていなかった**ので、ボタンごと
   * 出ていなかった。詰まった人の逃げ道が、あるのに閉じていた。
   */
  realTaskHints?: string[];
  /**
   * 自分の課題を書いた**あと**に聞くこと。
   *
   * 書いた文章そのものを見ないと答えられないことだけを置く。
   * 条件や解説は上の `deepenSteps` へ。
   */
  realTaskSteps?: LessonStep[];

  takeaway: string;
  nextSuggestion: string;
  /** 事実確認をとくに促すか（比較・計画）。 */
  factCheck?: boolean;
}

/** 解説カードは3枚まで。増えた時点で講義に戻っている。 */
export const MAX_CONCEPT_CARDS = 3;

function conceptStep(
  card: ConceptCard,
  index: number,
  skill: string | undefined,
  phase: LessonPhase,
): LessonStep {
  return {
    id: `concept_${index + 1}`,
    type: "concept_card" as const,
    phase,
    title: card.title,
    poMessage: card.body,
    poEmotion: "neutral" as const,
    // 解説は必ず飛ばせる。読みたくない人を足止めしない
    skippable: true,
    skill,
    card,
  };
}

function conceptSteps(
  cards: ConceptCard[],
  skills: string[] = [],
  anchors: (string | undefined)[] = [],
): LessonStep[] {
  return cards
    .slice(0, MAX_CONCEPT_CARDS)
    .map((card, index) =>
      /*
        比べたあとに出るので、区切りは「比べる」に属する。
        `try` のままだと、比べる画面の直後で帯が1つ戻って見える。
      */
      conceptStep(card, index, skills[index], "compare"),
    )
    // 置き場所を指定されたものは、ここには出さない（下で挟む）
    .filter((_, index) => !anchors[index]);
}

/**
 * 場所を指定された解説を、その手前へ挟む。
 *
 * 区切りは**ひとつ前の回に合わせる**。
 *
 * 場所を指定する解説は「たったいま起きたことに名前を付ける」もの
 * （Day1 の「さっき送ったこれがプロンプト」）で、**前の段の締めくくり**
 * に当たる。次の回の区切りを取ると、章扉より手前にいるのに帯だけが
 * 次の段を差し、章扉を見る前に段が変わってしまう。
 */
function insertConcepts(
  steps: LessonStep[],
  cards: ConceptCard[],
  skills: string[] = [],
  anchors: (string | undefined)[] = [],
): LessonStep[] {
  const result = [...steps];

  cards.slice(0, MAX_CONCEPT_CARDS).forEach((card, index) => {
    const before = anchors[index];
    if (!before) return;

    const at = result.findIndex((step) => step.id === before);
    if (at < 0) return;

    const phase = result[at - 1]?.phase ?? result[at].phase ?? "compare";
    result.splice(at, 0, conceptStep(card, index, skills[index], phase));
  });

  return result;
}

/** 章扉を、指定されたステップの手前へ挟む。 */
function insertSections(
  steps: LessonStep[],
  sections: SectionTransition[] = [],
): LessonStep[] {
  const result = [...steps];

  for (const section of sections) {
    const at = result.findIndex((step) => step.id === section.before);
    if (at < 0) continue;

    result.splice(at, 0, {
      id: section.id,
      type: "section_transition",
      /*
        区切りは**これから始まる回**に合わせる。直前の回に合わせると、
        章扉を見ているあいだ帯がまだ前の段を差していて、
        「変わった」と言いながら帯が変わらない。
      */
      phase: result[at].phase,
      title: section.title,
      poMessage: section.poMessage,
      poEmotion: "celebrate",
      /*
        番号と絵も、ステップに持たせて運ぶ。

        画面側が別の表を引きに行かなくて済む——引きに行く形だと、
        章扉を足したのに絵の表へ書き忘れた日に、**絵の無い章扉**が
        黙って出る（画面を見るまで気づけない）。
      */
      meta: {
        sectionNumber: section.number,
        sectionLabel: section.label,
        image: section.image,
      },
    });
  }

  return result;
}

export function buildLessonFlow(options: FlowOptions): LessonStep[] {
  const review = {
    reviewPoints: options.reviewPoints,
    factCheck: options.factCheck ?? false,
  };

  const steps: LessonStep[] = [
    {
      id: "outcome_preview",
      type: "outcome_preview",
      phase: "try",
      title: "今日つくるもの",
      /*
        話しかける言い方にする。「見てみましょう」は案内文の言い回しで、
        隣に立って一緒に始める役のポーの言葉ではない。
      */
      poMessage: "まず、できあがりを見てみよう！",
      poEmotion: "neutral",
    },
    {
      // 選ぶのは1つだけ。ここを増やすと最初の結果が遠くなる
      id: "quick_try",
      type: "quick_try",
      phase: "try",
      title: options.quickTitle,
      instruction: options.quickInstruction,
      /*
        見出しと `quickInstruction` が既に問いかけている。3回目は要らない。

        ここは**どの教材でも同じ骨格**なので、Day1 の言い回し
        （「誰向けかな？」）を書かない。Day2 は要約、Day5 は比較で、
        聞いていることが違う。
      */
      poMessage: "選んでみよう！",
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
      /*
        送信中の画面。**1つのことだけ言う。**

        前は「AIに送っています」（見出し）と「送っています。少しだけ
        待ってください。」（吹き出し）で、**同じことを2回**言っていた。
        待っている人が読む文が増えるだけで、増えた分の中身が無い。
      */
      title: "書き直しています",
      instruction: options.working,
      poMessage: "もう少し！",
      poEmotion: "thinking",
      aiAction: options.aiAction,
    },
    {
      id: "observe_result",
      type: "observation",
      phase: "try",
      /*
        結果を見た直後。**ここで聞くのは1つだけ。**

        前は「どこが変わったと思いますか」＋説明2行＋5つの選択肢＋
        観点3つで、1画面に151字あった。結果の本文と合わせると
        スマホで2〜3スクロール——いちばん手応えのある瞬間に、
        いちばん読ませていた。

        いまは「よくなった？」の2択だけ。何に気づいたかは、
        **うまくいかなかった人にだけ**その場で聞く（`observeReasons`）。
      */
      /*
        既定は短くするだけに留める。共通の選択肢（短くなった・丁寧に
        なった…）は「どこが変わったか」を聞くものなので、既定の
        問いかけもそれに合わせる。2択へ変えるのは、選択肢も一緒に
        差し替える教材だけ（Day1）。
      */
      title: options.observeTitle ?? "どこが変わった？",
      primaryLabel: options.observePrimaryLabel,
      instruction: "",
      poMessage: "どうだった？",
      poEmotion: "question",
      key: "observation",
      options: options.observationOptions ?? OBSERVATION_OPTIONS,
      /*
        理由を持たない教材では、鍵ごと置かない。

        空の配列を入れると、サーバー側の展開（`drop_empty` は浅くしか
        見ない）と姿が食い違い、`test_catalog_parity` が落ちる。
        「空が入っている」と「指定されていない」を区別する作りなので、
        指定していないなら置かない。
      */
      meta: options.observeReasons?.length
        ? { ...review, reasons: options.observeReasons }
        : review,
    },
    {
      id: "add_condition",
      type: "condition_choice",
      phase: "compare",
      /*
        「一度に一つだけ」は見出しが言っている（「ひとつ」）。
        「一度で完成させなくて大丈夫」は、この先の比べる画面で
        **実際に変わるのを見れば分かる**——先に文で言わない。
      */
      title: "条件をひとつ足そう",
      instruction: "",
      poMessage: "どれにする？",
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
      title: "直しています",
      instruction: "",
      poMessage: "もう少し！",
      poEmotion: "thinking",
      aiAction: { ...options.aiAction, action: "improve", inputs: {} },
    },
    {
      id: "compare_results",
      type: "result_compare",
      phase: "compare",
      /*
        比べるところは**説明で分からせない**。並んだ2つと、足した条件の
        札（Chip）と、変わった箇所の色で分かる。何が並んでいるかを
        文で言い足すと、見る前に読むことになる。
      */
      title: "こんなに変わった",
      instruction: "",
      poMessage: "変わった！",
      poEmotion: "celebrate",
      meta: { ...review, threeWay: true },
    },
    /*
      AI技の名前は、**使って、違いを見たあと**に出す。

      前はここが `observe_result` の直後——条件を足す前・比べる前に
      あった。「出力形式の指定とは」を、それが何の役に立つのか
      分からないまま読ませていたことになる。

      いまは順がこうなる:

          条件を足す → 結果が変わる → 見比べる → 「今のが〜です」

      名前が、たったいま自分で起こした変化に貼り付く。読む理由が
      できてから読むので、飛ばす人も減る。

      歩数は変わっていない。**入れ替えただけ**で、足しても引いてもいない。
    */
    ...conceptSteps(
      options.conceptCards,
      options.conceptSkills,
      options.conceptAnchors,
    ),
    /*
      技を深める回。**自分の文章を書く前**に置く。

      相手もトーンも、これから書く自分の文章について聞くこと。
      書いたあとに聞くと、書き終えた人を足止めしてから送ることになる。
    */
    ...(options.deepenSteps ?? []),
    /*
      ここが**主導線の終わり**。この先は任意。

      前はこの手前に「技を深める回」（相手・トーン）が3画面、
      そのあと自分の文章が6画面あり、**全部通らないと終われなかった**。
      19画面で7〜9分。仕事終わりに開ける長さではない。

      **分かれ道はここに置く。** 前は深める回の**手前**にあった。
      そうすると「試す？」で降りた人は、その日の技を1つしか受け取れない
      ——Day1 でいえば、トーン指定を一度も見ないまま終わる。
      習うことと、自分の文章で使うことは別なので、分かれるのは
      習い終わってから。

      降りた人が失うのは「自分の文章で試す」だけ。教材が教えると
      言っている技は、ここまでで全部渡し終えている。
    */
    {
      id: "real_task_intro",
      type: "safety_check",
      phase: "own",
      title: "自分の文章でも試す？",
      /*
        注意はここでは出さない。**まだ何も書いていない。**
        入力欄のところ（`real_task`）で SafetyNote が出るので、
        書く直前にちょうど届く。ここで先に出すと、
        「やめておこう」だけが残る。
      */
      poMessage: "自分の仕事でも試してみる？",
      poEmotion: "hint",
      key: "real_task_choice",
      options: [
        { value: "自分で入力する", label: "自分の文章で試す" },
        { value: "別のサンプルを試す", label: "別の例で試す" },
      ],
    },
    {
      id: "real_task",
      type: "real_task",
      phase: "own",
      /*
        次に何が来るかで、言うことが変わる。あとに何も挟まなければ
        次は送る内容の確認なので、そう書ける。まだ並べ替えていない
        教材では条件や解説が続くので、行き先を約束しない既定に任せる。
      */
      primaryLabel:
        (options.realTaskSteps ?? []).length === 0
          ? "AIに送る内容を見る"
          : undefined,
      title: "自分の文章",
      instruction: options.realTaskLabel,
      poMessage: "自分の仕事でも試してみる？",
      poEmotion: "hint",
      key: "real_task_text",
      placeholder: options.realTaskPlaceholder,
      hints: options.realTaskHints,
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
      poMessage: "これでお願いするね！",
      poEmotion: "talking",
      aiAction: options.aiAction,
    },
    {
      id: "generate_real",
      type: "ai_generate",
      phase: "own",
      // 送信中の3画面は同じ扱いにする。ここだけ長いと、
      // 自分の文章のときだけ待ち時間が重く感じる
      title: "書き直しています",
      instruction: options.working,
      poMessage: "もう少し！",
      poEmotion: "thinking",
      aiAction: options.aiAction,
    },
    {
      id: "real_task_result",
      type: "result_compare",
      phase: "own",
      title: "自分の文章の結果",
      instruction: "そのまま使える形になっているか見てみましょう。",
      poMessage: "そのまま使えそう？",
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

  /*
    挟むのは**最後にまとめて**。

    上の並びの途中で挟むと、`before` に指定できるのがそこまでに
    出てきたステップだけになる。章扉③は「誰が読みますか」（教材が
    持ち込む回）の手前に来るので、深める回まで並んだあとでないと
    挟む先が見つからない。
  */
  return insertSections(
    insertConcepts(
      steps,
      options.conceptCards,
      options.conceptSkills,
      options.conceptAnchors,
    ),
    options.sections,
  );
}
