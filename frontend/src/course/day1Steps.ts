/**
 * Day1「文章を分かりやすくする」の、画面の並び。
 *
 * なぜ `catalog.ts` から切り出したか
 * ----------------------------------
 * Day2〜Day5 は骨格（`shared.ts` の `buildLessonFlow`）から組み立てて
 * いて、教材データ側には**材料だけ**が並ぶ。Day1 はその骨格をやめて
 * 手書きにしたので、23画面ぶんの定義がそのまま教材データの中に入る。
 * 入れたままにすると、`catalog.ts` の中で Day1 だけが 500 行を占めて、
 * ほかの教材の材料が見えなくなる。
 *
 * 骨格をやめた理由は `catalog.ts` の Day1 の頭に書いた。
 *
 * 並びの決まり
 * ------------
 * **操作が先、説明はあと。** どの段も、選ぶ → 結果 → 名前を付ける、の順。
 * 読ませてから選ばせると、選ぶのは読んだことの確認になる。
 *
 * AIを呼ぶのは4回
 * ---------------
 *     ① 条件なし          … まず1回。ここが比べる基準になる
 *     ② ＋読む人          … 足したものだけが変わる
 *     ③ ＋伝え方          … もう1つ足す
 *     ④ 自分の文章に3つ   … 組み上げたものを、自分の題材へ
 *
 * 前は3回だった（①②と、自分の文章）。②と③のあいだに生成が無く、
 * 読む人と伝え方を**続けて選んでから**まとめて1回送っていたので、
 * どちらがどう効いたのかが分からなかった。1つ足すごとに1回送る。
 *
 * 待ち時間は増やさない
 * --------------------
 * 偽の待機は入れない。送っているあいだに出すのは、**そのとき何を
 * 足したか**だけ（`meta.waiting`）。同じ絵の待ち画面を4回出すと、
 * 4回とも同じ場面に見える。
 */

import type { LessonStep } from "./types";

/** Day1 の題材。専門用語だらけで、そのままでは読み下せない文章。 */
export const DAY1_SOURCE =
  "Transformer型言語モデルにおける自己注意機構では、各トークンから生成されたQueryとKeyの内積をスケーリングし、Softmax関数によって正規化したAttention WeightをValueに適用することで、系列内のトークン間依存関係を動的に表現する。さらに、多層化されたMulti-Head Attentionにより異なる表現部分空間における依存関係を並列的に学習することが可能となる。";

/**
 * 1回目にAIへ渡す頼みかた。**選ばせない。**
 *
 * 前はここで「専門用語を減らす／かみくだいて説明する／要点から先に」の
 * 3つから選ばせていた。選ぶ手応えはあるが、**1回目から条件が1つ入る**
 * ので、そのあと「新入社員向けに」を足しても、変わったのがどちらの
 * せいなのか分からない。1回目は素のまま送って、あとの2回との差で見せる。
 */
const FIRST_INSTRUCTION = "分かりやすく書き直してください";

/** 書き直す目的。4回とも同じ。指示の1行目に出る。 */
const PURPOSE = "文章を分かりやすくする";

/**
 * AIへの頼み方。4回とも同じ `rewrite` で、**渡す条件だけが増えていく**。
 *
 * `instruction` は決め打ち（`fixed`）。学習者が選ぶのは読む人と伝え方の
 * 2つで、目的は Day1 のあいだ動かない。
 */
const REWRITE = {
  action: "rewrite",
  fixed: { instruction: FIRST_INSTRUCTION },
  inputs: {
    source_text: "original_text",
    audience: "audience",
    tone: "tone",
  },
} as const;

/** 自分の文章を送る回だけ、本文の置き場が違う。 */
const REWRITE_OWN = {
  action: "rewrite",
  fixed: { instruction: FIRST_INSTRUCTION },
  inputs: {
    real_task_text: "original_text",
    audience: "audience",
    tone: "tone",
  },
} as const;

export const DAY1_STEPS: LessonStep[] = [
  /* ══════════════ SECTION 1 ══════════════ まずはAIに頼んでみる */
  {
    id: "section_1",
    type: "section_transition",
    phase: "try",
    title: "まずはAIに頼んでみる",
    poMessage: "まずは、そのまま送ってみよう！",
    poEmotion: "celebrate",
    meta: {
      sectionNumber: 1,
      sectionLabel: "頼む",
      image: {
        src: "/assets/teaching/day1_section_01.webp",
        alt: "ポーが、読みにくい文章の吹き出しからAIへ向かう矢印を指し示している絵。",
        width: 941,
        height: 1672,
      },
    },
  },
  {
    /*
      開始画面。**ここでは何も選ばせない。**

      前はここが「どこから分かりやすくする？」で、3つの札から1つ選ぶ
      形だった。選ぶ手応えはあるが、選んだものが何をしたのかは
      1回目の結果からは分からない（比べる相手がまだ無い）。

      いま出すのは、読む相手の状況と、元の文章の頭3行だけ。
      押すことは1つ——分かりやすくしてもらう。
    */
    id: "ask_first",
    type: "quick_try",
    phase: "try",
    title: "まずはAIに頼んでみよう",
    instruction:
      "新人にこの文章を読んでもらいます。でも、専門用語が多く、このままでは伝わりにくそうです。",
    poMessage: "そのまま送ってみよう！",
    poEmotion: "neutral",
    primaryLabel: "分かりやすくしてもらう",
    aiAction: REWRITE,
    meta: {
      sampleText: DAY1_SOURCE,
      /* 選択肢を持たない回。元の文章の頭だけを見せる（`StepRenderer`） */
      sourcePreview: true,
    },
  },
  {
    id: "generate_first",
    type: "ai_generate",
    phase: "try",
    title: "書き直しています",
    poMessage: "いま読んでいるところ！",
    poEmotion: "thinking",
    aiAction: REWRITE,
    meta: { waiting: "むずかしい言葉を、やさしい言葉に置きかえています…" },
  },
  {
    /*
      結果。**全文を読ませない。**

      出すのは代表的な変化2つと、そこから読み取れる1行。
      202字の専門文とその書き直しを毎回読み比べさせると、
      いちばん見てほしい変化がその中に埋もれる。

      聞くのも感想ではなく、**変化を見つける操作**にする。
      「分かりやすくなった？」は、答えても次にすることが変わらない。
    */
    id: "find_change",
    type: "observation",
    phase: "try",
    title: "何が変わった？",
    poMessage: "どこが変わったか、見てみよう！",
    poEmotion: "question",
    primaryLabel: "次へ",
    key: "observation",
    required: true,
    options: [
      { value: "専門用語が言い換えられた", label: "専門用語が言い換えられた" },
      { value: "文章が短くなった", label: "文章が短くなった" },
      { value: "内容が追加された", label: "内容が追加された" },
    ],
    meta: {
      question: "一番大きく変わったのは？",
      /* 代表例だけを出す。全文は「全文を見る」の一枚へ */
      changesOnly: true,
    },
  },
  {
    /*
      たったいま送ったお願いに、名前を付ける。

      **受け取る演出は出さない。** 3つの技をそれぞれの場所で祝うと、
      そのたびに学習が止まる。ここは名前を言うだけで、受け取るのは
      自分の文章を仕上げたあとに1度（`skills_recap`）。
    */
    id: "concept_prompt",
    type: "concept_card",
    phase: "try",
    title: "これがプロンプトです",
    poMessage: "いま送ったのが、これ。",
    poEmotion: "neutral",
    primaryLabel: "次へ",
    skippable: true,
    card: {
      title: "プロンプト",
      body: "AIにしてほしいことを伝える指示を「プロンプト」といいます。",
      visual: "three_points",
      points: ["何をしてほしい？", "誰向け？", "どんな言い方？"],
      reviewExample: {
        body: "この3つを足していくと、返ってくるものが変わります。",
        points: ["分かりやすくして", "新入社員向けに", "やさしく丁寧に"],
      },
    },
    meta: { silentSkill: "プロンプト" },
  },

  /* ══════════════ SECTION 2 ══════════════ 誰に伝えるか決める */
  {
    id: "section_2",
    type: "section_transition",
    phase: "compare",
    title: "誰に伝えるか決める",
    poMessage: "誰が読むかを、足してみよう！",
    poEmotion: "celebrate",
    meta: {
      sectionNumber: 2,
      sectionLabel: "読む人",
      image: {
        src: "/assets/teaching/day1_section_02.webp",
        alt: "ポーが、AI初心者とくわしい人の2枚のカードを指し示している絵。",
        width: 941,
        height: 1672,
      },
    },
  },
  {
    id: "pick_audience",
    type: "single_choice",
    phase: "compare",
    title: "誰に伝えますか？",
    poMessage: "読む人で、説明のしかたが変わります。",
    poEmotion: "question",
    primaryLabel: "この相手で書き直す",
    key: "audience",
    required: true,
    placeholder: "例）取引先の担当者",
    /*
      分けたいのは役職ではなく**どれだけ知っているか**。そこが変わると
      説明の深さが変わる。
    */
    options: [
      { value: "その分野を知らない人", label: "その分野を知らない人" },
      { value: "新入社員", label: "新入社員" },
      { value: "お客様", label: "お客様" },
      { value: "詳しい人", label: "詳しい人" },
      { value: "", label: "自分で指定する", free: true },
    ],
    /* 選ぶたびに、AIへの指示が1行増えるのを見せる（`StepRenderer`） */
    meta: { showInstruction: true, purpose: PURPOSE },
  },
  {
    id: "generate_audience",
    type: "ai_generate",
    phase: "compare",
    title: "書き直しています",
    poMessage: "読む人に合わせているところ！",
    poEmotion: "thinking",
    aiAction: REWRITE,
    meta: { waiting: "読む人に合わせて、説明のしかたを変えています…" },
  },
  {
    id: "see_audience",
    type: "result_compare",
    phase: "compare",
    title: "読む人で変わった",
    poMessage: "同じ内容でも、言葉が変わりました。",
    poEmotion: "celebrate",
    primaryLabel: "次へ",
    meta: {
      changesOnly: true,
      changedLabel: "読む人",
      changedNote: "初めて読む人でも想像しやすい言葉になった",
    },
  },
  {
    id: "concept_audience",
    type: "concept_card",
    phase: "compare",
    title: "これが読者設定です",
    poMessage: "誰に読んでほしいかを伝えました。",
    poEmotion: "neutral",
    primaryLabel: "次へ",
    skippable: true,
    card: {
      title: "読者設定",
      body: "誰に読んでほしいかを指定すると、使う言葉や説明の細かさを調整できます。",
      visual: "before_after",
      before: "重要な情報へ注意を向ける仕組みです。",
      after: "文章を読むときに、大事な部分へ目印を付けるような仕組みです。",
      reviewExample: {
        body: "相手が変われば、どこまでかみくだくかも変わります。",
        before: "多層化されたMulti-Head Attention",
        after: "同じ読み取りを、何通りもの見方で同時にやる仕組み",
      },
    },
    meta: { silentSkill: "読者設定" },
  },

  /* ══════════════ SECTION 3 ══════════════ 伝え方を決める */
  {
    id: "section_3",
    type: "section_transition",
    phase: "deepen",
    title: "伝え方を決める",
    poMessage: "こんどは、言い方を足してみよう！",
    poEmotion: "celebrate",
    meta: {
      sectionNumber: 3,
      sectionLabel: "伝え方",
      image: {
        src: "/assets/teaching/day1_section_03.webp",
        alt: "ポーが、やさしく・丁寧に・短くの3つが並ぶつまみを指し示している絵。",
        width: 941,
        height: 1672,
      },
    },
  },
  {
    id: "pick_tone",
    type: "single_choice",
    phase: "deepen",
    title: "どんな伝え方にしますか？",
    poMessage: "同じ内容でも、印象が変わります。",
    poEmotion: "question",
    primaryLabel: "この伝え方で書き直す",
    key: "tone",
    required: true,
    placeholder: "例）現場の人にも伝わる言い方で",
    options: [
      {
        value: "やさしく丁寧に",
        label: "やさしく丁寧に",
        note: "むずかしい言葉を避けて、やわらかく説明します。",
      },
      {
        value: "短く端的に",
        label: "短く端的に",
        note: "要点だけを、はっきり伝えます。",
      },
      {
        value: "親しみやすく",
        label: "親しみやすく",
        note: "話しかけるような言い方にします。",
      },
      {
        value: "ビジネス向けに",
        label: "ビジネス向けに",
        note: "仕事の場に合う、落ち着いた言い方にします。",
      },
      { value: "", label: "自分で指定する", free: true },
    ],
    meta: { showInstruction: true, purpose: PURPOSE },
  },
  {
    id: "generate_tone",
    type: "ai_generate",
    phase: "deepen",
    title: "書き直しています",
    poMessage: "言い方を整えているところ！",
    poEmotion: "thinking",
    aiAction: REWRITE,
    meta: { waiting: "伝え方に合わせて、言い回しを整えています…" },
  },
  {
    id: "see_tone",
    type: "result_compare",
    phase: "deepen",
    title: "伝え方で変わった",
    poMessage: "受け取る印象が変わりました。",
    poEmotion: "celebrate",
    primaryLabel: "次へ",
    meta: {
      changesOnly: true,
      changedLabel: "伝え方",
      changedNote: "断定的な表現が、相手に寄り添う説明へ変わった",
    },
  },
  {
    id: "concept_tone",
    type: "concept_card",
    phase: "deepen",
    title: "これがトーン設定です",
    poMessage: "どんな雰囲気で伝えるかを決めました。",
    poEmotion: "neutral",
    primaryLabel: "次へ",
    skippable: true,
    card: {
      title: "トーン設定",
      body: "どんな雰囲気で伝えるかを指定すると、同じ内容でも受け取る印象を変えられます。",
      visual: "three_points",
      points: ["やさしく", "端的に", "親しみやすく"],
      reviewExample: {
        body: "言い方は、口調でも、たとえの有無でも指定できます。",
        points: ["やさしく", "たとえを使って", "結論から"],
      },
    },
    meta: { silentSkill: "トーン設定" },
  },

  /* ══════════════ SECTION 4 ══════════════ 自分の仕事で使う */
  {
    id: "section_4",
    type: "section_transition",
    phase: "own",
    title: "自分の仕事で使う",
    poMessage: "組み上げた3つを、自分の文章に！",
    poEmotion: "celebrate",
    meta: {
      sectionNumber: 4,
      sectionLabel: "自分で",
      image: {
        src: "/assets/teaching/day1_section_04.webp",
        alt: "ポーが鉛筆を持ち、BeforeとAfterの2枚の紙のあいだに立っている絵。",
        width: 941,
        height: 1672,
      },
    },
  },
  {
    /*
      自分の文章。**4つの入り方を並べる。**

      前はここが「自分の文章でも試す？」という分かれ道の画面で、
      1画面まるごと使って「やる／やらない」を聞いていた。任意だった
      ころの名残りで、いまは Day1 の主導線そのもの——**この回でいちばん
      大事な画面**なので、聞くのは中身のほうにする。
    */
    id: "own_text",
    type: "real_task",
    phase: "own",
    title: "自分の文章で仕上げよう",
    instruction: "分かりやすくしたい文章を、ひとつ入れてみましょう。",
    poMessage: "仕事で使っている文章でどうぞ。",
    poEmotion: "question",
    primaryLabel: "この文章でいく",
    key: "real_task_text",
    required: true,
    placeholder: "分かりやすくしたい文章を入れてください",
    hints: [
      "短くても大丈夫。2〜3文あれば、変わったところが分かります。",
      "社内のお知らせやメールの下書きが、いちばん試しやすいです。",
      "思いつかなければ、下の例文から選べます。",
    ],
    meta: {
      /* 例文。仕事で本当にありそうな4つだけ */
      samples: [
        { label: "社内のお知らせ", value: "社内のお知らせ" },
        { label: "お客様へのメール", value: "お客様へのメール" },
        { label: "会議後の共有", value: "会議後の共有" },
        { label: "新人向けの説明", value: "新人向けの説明" },
      ],
      /* さっきまで使っていた専門文も、そのまま使える */
      reuseSource: DAY1_SOURCE,
    },
  },
  {
    /*
      送る前の確認。**ここが、この回のいちばんの山。**

      目的・読む人・伝え方・元の文章がそろって1枚に出る。ここまでの
      3つの段で1行ずつ足してきたものが、**自分で組み立てたプロンプト**
      として初めて全部そろって見える。

      直す道も置く。ここで「やっぱり別の相手に」と思った人が、
      送ってからでないと直せないのでは遅い。
    */
    id: "confirm_prompt",
    type: "prompt_preview",
    phase: "own",
    title: "AIへの指示",
    poMessage: "自分で組み立てた指示です。",
    poEmotion: "neutral",
    primaryLabel: "この条件で書き直す",
    aiAction: REWRITE_OWN,
    meta: { purpose: PURPOSE },
  },
  {
    id: "generate_own",
    type: "ai_generate",
    phase: "own",
    title: "書き直しています",
    poMessage: "3つの条件で書き直しているところ！",
    poEmotion: "thinking",
    aiAction: REWRITE_OWN,
    meta: { waiting: "読む人と伝え方に合わせて、書き直しています…" },
  },
  {
    id: "own_result",
    type: "result_compare",
    phase: "own",
    title: "この条件で変わりました",
    poMessage: "自分の文章でもできました！",
    poEmotion: "celebrate",
    primaryLabel: "次へ",
    meta: {
      changesOnly: true,
      /* 自分の文章の回だけ、指定した条件もそのまま並べる */
      showConditions: true,
    },
  },
  {
    /*
      問いは満足度にしない。**次に自分で使うとき何をするか**を聞く。

      「分かりやすくなりましたか」は答えても次にすることが変わらない。
      ここで一度自分の言葉にしておくと、明日その場面が来たときに
      思い出せる。
    */
    id: "next_use",
    type: "single_choice",
    phase: "own",
    title: "次に自分で使うなら？",
    instruction: "何を指定しますか？",
    poMessage: "明日、同じことをするなら。",
    poEmotion: "question",
    primaryLabel: "決めた",
    key: "next_use",
    required: true,
    options: [
      { value: "読む人", label: "読む人" },
      { value: "伝え方", label: "伝え方" },
      { value: "両方", label: "両方" },
      { value: "まだ分からない", label: "まだ分からない" },
    ],
  },
  {
    /*
      3つまとめて受け取る。**Day1 で演出を出すのはここだけ。**

      途中で1つずつ渡していたころは、受け取る画面が3回あった。
      名前が付くのは使った場所のほうがよいが、**祝うのは1回**でよい
      ——3回あると、そのたびに学習が止まる。
    */
    id: "skills_recap",
    type: "concept_card",
    phase: "own",
    title: "Day1のAI技",
    poMessage: "3つとも、もう使えます！",
    poEmotion: "celebrate",
    primaryLabel: "できるようになったことを見る",
    meta: {
      recap: [
        { name: "プロンプト", body: "AIにしてほしいことを伝える指示" },
        { name: "読者設定", body: "誰に伝えるかを指定する方法" },
        { name: "トーン設定", body: "どんな雰囲気で伝えるかを指定する方法" },
      ],
    },
  },
  {
    id: "completion",
    type: "completion",
    phase: "own",
    title: "文章を相手に合わせて変えられるようになりました",
    poMessage: "おつかれさま！",
    poEmotion: "celebrate",
    meta: {
      /*
        仕事でそのまま使える3行。**コピーできるようにする。**

        Day1 で身に付いたことを、明日の机の上で再現できる形に落とす。
        「〇〇」は自分で埋めるところ——埋めるのは学習者の場面なので、
        こちらでは決められない。
      */
      reusablePrompt:
        "分かりやすくしてください。\n読む人は〇〇です。\n〇〇な伝え方にしてください。",
    },
  },
];
