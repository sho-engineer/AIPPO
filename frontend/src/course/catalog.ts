/**
 * AIスタートコースの中身（通信が届かないときの控え）。
 *
 * ここはデータであって、画面ではない。
 * レッスンを足すときにコンポーネントを触らなくて済むようにしてある。
 *
 * 本文と並べ方を分けてある
 * ------------------------
 * 上半分の `LESSON_*` が**本文**で、下の `START_CURRICULUM` が**並べ方**。
 * 本文は「コードから DB へ移して1文字も変わっていない」ことを確かめる
 * 正解データ（backend/tests/test_catalog_parity.py）を兼ねているので、
 * カリキュラムを変えるたびにここを書き換えると、その役目が消える。
 *
 * 本当の持ち主はサーバー（`apps/catalog/release_seeding.py`）。
 * ここはその控えなので、**同じ姿にしておくこと。**
 *
 * 決めごと:
 * - 1画面1タスク。1つのステップで2つのことを判断させない（要件 §6.1）
 * - 空欄から始めさせない。まず選択肢を出す（要件 §6.2 / §6.3）
 * - プロンプトは持たせない。AI へ送る文面はサーバーが組み立てる
 */

import { AUDIENCE_OPTIONS, buildLessonFlow } from "./shared";
import type { Course, CourseStage, Lesson } from "./types";

// ---------------------------------------------------------------- Lesson 0

/**
 * AI活用診断。
 *
 * AI API を使わない。ルールで決める（要件 §9）。
 * ここで AI を呼ぶと、初回起動が遅くなるうえ費用もかかる。
 * 診断の精度は使ってもらった後でないと検証できないので、先に作り込まない。
 */
const LESSON_0: Lesson = {
  id: "diagnosis",
  number: 0,
  title: "AI活用診断",
  goal: "自分に合いそうなAIの使い道を見つける",
  outcomes: ["自分の仕事でAIに任せられそうなことが分かる"],
  tags: [],
  usesAi: false,
  steps: [
    {
      id: "intro",
      type: "intro",
      title: "まずは3つだけ教えてください",
      instruction: "答えに合わせて、試すレッスンを3つ選びます。",
      poMessage: "ひとつずつ聞きますね。近いものを選んでください。",
      poEmotion: "question",
    },
    {
      id: "work_kind",
      type: "single_choice",
      title: "ふだんの仕事に近いのはどれですか",
      poMessage: "近いものが無ければ「そのほか」で大丈夫です。",
      poEmotion: "question",
      key: "work_kind",
      required: true,
      options: [
        { value: "writing", label: "文章を書く" },
        { value: "reading", label: "長い文章を読む" },
        { value: "researching", label: "調べて理解する" },
        { value: "ideas", label: "アイデアを考える" },
        { value: "comparing", label: "選択肢を比較する" },
        { value: "planning", label: "計画を作る" },
        { value: "organizing", label: "作業を整理する" },
      ],
    },
    {
      id: "ai_experience",
      type: "single_choice",
      title: "AIを使ったことはありますか",
      poMessage: "はじめてでも大丈夫です。手順どおりに進めば動きます。",
      poEmotion: "neutral",
      key: "ai_experience",
      required: true,
      options: [
        { value: "none", label: "使ったことがない" },
        { value: "tried", label: "数回だけ使った" },
        { value: "occasional", label: "ときどき使う" },
        { value: "regular", label: "日常的に使う" },
      ],
    },
    {
      id: "pain_point",
      type: "single_choice",
      title: "いま、いちばん面倒に感じているのはどれですか",
      poMessage: "いちばん時間を取られているものを選んでください。",
      poEmotion: "question",
      key: "pain_point",
      required: true,
      options: [
        { value: "writing", label: "文章を書く・直す" },
        { value: "summarizing", label: "長い資料をまとめる" },
        { value: "explaining", label: "調べる・説明する" },
        { value: "comparing", label: "選択肢を比べる" },
        { value: "planning", label: "段取りを決める" },
      ],
    },
    {
      id: "result",
      type: "completion",
      title: "おすすめの3つが決まりました",
      poMessage: "まずは一つだけ、実際に試してみましょう。",
      poEmotion: "hint",
      skill: "自分に合った使い道を選べる",
    },
  ],
};

// ---------------------------------------------------------------- Lesson 1

/**
 * どのレッスンも、最初の1回は「相手だけ選ぶ」で通す。
 *
 * 選ばせなかった条件は既定値で埋める。
 * 最初から全部聞くと、最初の結果に届く前に手が止まる。
 */
const LESSON_1: Lesson = {
  id: "rewrite_text",
  number: 1,
  title: "文章を分かりやすくする",
  goal: "「誰向けか」「どんな表現か」をAIに伝えられるようになる",

  outcomeTitle: "読みにくい文章を、伝わるメールに変える",
  outcomeDescription: "相手と、どうしたいかを伝えて、文章を調整します。",
  estimatedMinutes: 8,
  beforeExample:
    "明日の打ち合わせの件ですが、資料について確認していただきたいところがあるため、本日中に可能であれば見ていただけますでしょうか。",
  afterExample:
    "明日の打ち合わせ資料について、修正箇所をご確認ください。\n恐れ入りますが、本日中にご確認いただけると助かります。",
  learnedSkills: ["誰向けかを伝える", "希望する表現を伝える"],

  outcomes: [
    "読む相手を伝えられる",
    "表現と長さを指定できる",
    "AIの結果が元の意味と変わっていないか確かめられる",
  ],
  tags: ["writing"],
  usesAi: true,
  mode: "standard",
  steps: buildLessonFlow({
    aiAction: {
      action: "rewrite",
      inputs: {
        source_text: "original_text",
        audience: "audience",
        tone: "tone",
        length: "length",
      },
    },
    sampleText:
      "明日の打ち合わせの件ですが、資料について確認していただきたいところがあるため、本日中に可能であれば見ていただけますでしょうか。",
    quickTitle: "この文章は誰に送りますか？",
    quickInstruction: "ひとつ選ぶと、すぐにAIが書き直します。",
    quickKey: "audience",
    quickOptions: AUDIENCE_OPTIONS,
    quickDefaults: { tone: "ていねいに", length: "3行くらい" },
    working: "文章を書き直してもらっています。",
    /*
      骨格が続けて出す解説は**1枚だけ**にしてある。

      3枚続けると、手を動かす前に解説を3画面読むことになる。
      残り2枚（トーン指定・反復）は、それを実際に使う場面の直前へ
      移した（下の realTaskSteps）。**技は、使う直前に出す。**
    */
    conceptCards: [
      {
        title: "誰向けかを伝える",
        body: "同じ内容でも、上司・同僚・顧客で、ちょうどよい言い方は変わります。",
        visual: "before_after",
        before: "確認していただけますでしょうか。",
        after: "ご確認ください。",
        // 見返すときは別の例で。同じ文をもう一度出しても、飛ばした人には同じ
        reviewExample: {
          body: "相手が変われば、ちょうどよい丁寧さも変わります。",
          before: "ご多忙のところ大変恐縮ではございますが。",
          after: "お忙しいところすみませんが。",
        },
      },
    ],
    reviewPoints: [
      "元の意味が変わっていないか",
      "指定した長さになっているか",
      "読む相手に合った言葉づかいか",
    ],
    realTaskLabel: "いま実際に直したい文章を、ひとつ入れてみましょう。",
    realTaskPlaceholder: "例）お客様へ送るお知らせの文章",
    /*
      自分の文章を入れたあとの並び。

          誰が読むか → 【トーン指定】 → どう変えたいか
          → 【反復】 → 送る

      解説を2枚続けて出さない。**あいだに必ず手を動かす画面が入る。**
      技を出す位置も、覚えてもらう場面のすぐ手前にしてある
      ——トーン指定はトーンを選ぶ直前、反復は送る直前。
      「一度で完璧を目指さなくていい」は、送る前がいちばん効く。
    */
    realTaskSteps: [
      {
        id: "real_audience",
        type: "single_choice",
        title: "誰が読みますか",
        poMessage: "読む相手を伝えると、言葉づかいが変わります。",
        poEmotion: "question",
        key: "audience",
        required: true,
        options: [
          ...AUDIENCE_OPTIONS,
          { value: "はじめて読む人", label: "はじめて読む人" },
          { value: "", label: "そのほか", free: true },
        ],
      },
      {
        id: "concept_tone",
        type: "concept_card",
        phase: "own",
        title: "トーン指定",
        poMessage: "同じ内容でも、言い方は変えられます。",
        poEmotion: "neutral",
        // 解説は必ず飛ばせる。読みたくない人を足止めしない
        skippable: true,
        card: {
          title: "トーン指定",
          body: "同じ内容でも、丁寧・やわらかい・カジュアルで伝わり方が変わります。",
          visual: "three_points",
          points: ["丁寧", "やわらかい", "カジュアル"],
          reviewExample: {
            body: "望む形は、長さ・言い方・並べ方のどれでも指定できます。",
            points: ["3行で", "やわらかく", "箇条書きで"],
          },
        },
      },
      {
        id: "real_tone",
        type: "single_choice",
        title: "どう変えたいですか",
        poMessage: "これで最後の質問です。",
        poEmotion: "question",
        key: "tone",
        required: true,
        options: [
          { value: "ていねいに", label: "ていねいに" },
          { value: "やわらかく", label: "やわらかく" },
          { value: "きっぱりと", label: "きっぱりと" },
          { value: "やさしい言葉で", label: "やさしい言葉で" },
          { value: "", label: "そのほか", free: true },
        ],
      },
      {
        id: "concept_iteration",
        type: "concept_card",
        phase: "own",
        title: "反復（Iteration）",
        poMessage: "一度で完璧を目指さなくて大丈夫です。",
        poEmotion: "hint",
        skippable: true,
        card: {
          title: "反復（Iteration）",
          body: "結果を見てから足すほうが、はじめから細かく書くより近づきます。",
          visual: "simple_flow",
          points: ["まず送る", "結果を見る", "条件を足す"],
          reviewExample: {
            body: "一度で完璧を狙わず、足りないところだけ言い足します。",
            points: ["長すぎた", "「半分に」と足す", "また見る"],
          },
        },
      },
    ],
    takeaway: "相手と、どうしたいかを伝えると、結果が変わることを確かめられましたね。",
    nextSuggestion: "次は「長い文章を短くまとめる」も試してみましょう。",
  }),
};

// ---------------------------------------------------------------- Lesson 2

const LESSON_2: Lesson = {
  id: "summarize_text",
  number: 2,
  title: "長い文章を短くまとめる",
  goal: "まとめる目的と出力の形を指定できるようになる",

  outcomeTitle: "長い会議メモを、3行の共有文にする",
  outcomeDescription: "何のためのまとめかを伝えて、必要なところだけ取り出します。",
  estimatedMinutes: 8,
  beforeExample:
    "本日の定例会議では、まず先月の売上について報告がありました。前年同月比で110%となり、特に新規顧客からの受注が伸びています。一方で既存顧客の解約が3件あり、原因は納期の遅れとの分析でした。",
  afterExample:
    "・先月の売上は前年比110%。新規顧客が伸びた\n・既存顧客の解約が3件。原因は納期の遅れ\n・次は納期の改善を検討する",
  learnedSkills: ["何のためのまとめかを伝える", "出力の形を指定する"],

  outcomes: ["何のためのまとめかを伝えられる", "箇条書き・行数など形を指定できる"],
  tags: ["reading", "summarizing"],
  usesAi: true,
  mode: "standard",
  steps: buildLessonFlow({
    aiAction: {
      action: "summarize",
      inputs: {
        source_text: "original_text",
        purpose: "purpose",
        format: "format",
        length: "length",
      },
    },
    sampleText:
      "本日の定例会議では、まず先月の売上について報告がありました。前年同月比で110%となり、特に新規顧客からの受注が伸びています。一方で既存顧客の解約が3件あり、原因は納期の遅れとの分析でした。次に、来月の展示会について、出展ブースの設営を来週金曜までに確定させること、パンフレットの校正を水曜までに終えることが決まりました。",
    quickTitle: "何のためにまとめますか？",
    quickInstruction: "ひとつ選ぶと、すぐにAIがまとめます。",
    quickKey: "purpose",
    quickOptions: [
      { value: "人に共有するため", label: "人に共有する" },
      { value: "自分がやることを知るため", label: "自分の作業を知る" },
      { value: "内容をつかむため", label: "内容をざっとつかむ" },
    ],
    quickDefaults: { format: "重要な点を3つ", length: "3行で" },
    working: "必要なところを取り出しています。",
    observationOptions: [
      { value: "短くなった", label: "短くなった" },
      { value: "要点だけ残った", label: "要点だけ残った" },
      { value: "箇条書きになった", label: "箇条書きになった" },
      { value: "やることが分かった", label: "やることが分かった" },
      { value: "よく分からない", label: "よく分からない" },
    ],
    conceptCards: [
      {
        title: "目的で残る情報が変わる",
        body: "「共有用」と「自分の作業用」では、残すべきところが違います。",
        visual: "three_points",
        points: ["共有する", "作業を知る", "内容をつかむ"],
      },
      {
        title: "形を指定する",
        body: "「3行で」「重要な点を3つ」と言うと、そのまま貼って使えます。",
        visual: "highlight",
        highlight: "重要な点を3つ",
      },
      {
        title: "足された話に気をつける",
        body: "元の文章に無いことが混ざることがあります。数字は必ず確かめます。",
        visual: "text",
      },
    ],
    reviewPoints: [
      "元に無い話が混ざっていないか",
      "指定した形になっているか",
      "自分が必要な情報が残っているか",
    ],
    realTaskLabel: "手元にある長い文章を、ひとつ入れてみましょう。",
    realTaskPlaceholder: "例）今日届いた長いメールの本文",
    realTaskSteps: [
      {
        id: "real_purpose",
        type: "single_choice",
        title: "何のためにまとめますか",
        poMessage: "目的が変わると、残す情報が変わります。",
        poEmotion: "question",
        key: "purpose",
        required: true,
        options: [
          { value: "内容をつかむため", label: "内容をつかむため" },
          { value: "人に共有するため", label: "人に共有するため" },
          { value: "自分がやることを知るため", label: "自分の作業のため" },
          { value: "", label: "そのほか", free: true },
        ],
      },
      {
        id: "real_format",
        type: "single_choice",
        title: "どんな形で欲しいですか",
        poMessage: "これで最後の質問です。",
        poEmotion: "question",
        key: "format",
        required: true,
        options: [
          { value: "3行で", label: "3行で" },
          { value: "重要な点を3つ", label: "重要な点を3つ" },
          { value: "次にやることを抽出", label: "次にやることを抽出" },
          { value: "初心者向けに説明", label: "初心者向けに説明" },
          { value: "", label: "そのほか", free: true },
        ],
      },
    ],
    takeaway: "目的と形を先に伝えると、まとめ方が変わることを確かめられましたね。",
    nextSuggestion: "次は「分からないことを説明してもらう」も試してみましょう。",
  }),
};

// ---------------------------------------------------------------- Lesson 3

const LESSON_3: Lesson = {
  id: "explain_topic",
  number: 3,
  title: "分からないことを説明してもらう",
  goal: "説明する相手とやり方を指定できるようになる",

  outcomeTitle: "難しい言葉を、自分に分かる説明に変える",
  outcomeDescription: "誰に向けた説明かを伝えて、言葉の難しさを調整します。",
  estimatedMinutes: 7,
  beforeExample: "サブスクリプション",
  afterExample:
    "毎月お金を払って、そのあいだサービスを使い続ける仕組みです。雑誌の定期購読と同じ考え方です。",
  learnedSkills: ["説明する相手を伝える", "例えや具体例を求める"],

  outcomes: ["相手のレベルを伝えられる", "例えや具体例を求められる"],
  tags: ["researching", "explaining"],
  usesAi: true,
  mode: "standard",
  steps: buildLessonFlow({
    aiAction: {
      action: "explain",
      inputs: {
        source_text: "topic",
        audience: "audience",
        style: "style",
        example: "example",
        length: "length",
      },
    },
    sampleText: "サブスクリプション",
    quickTitle: "誰に向けた説明にしますか？",
    quickInstruction: "ひとつ選ぶと、すぐにAIが説明します。",
    quickKey: "audience",
    quickOptions: [
      { value: "初心者向け", label: "はじめて聞く人" },
      { value: "小学生向け", label: "小学生にも分かる" },
      { value: "その分野の人向け", label: "その分野の人" },
    ],
    quickDefaults: {
      style: "例えを使う",
      example: "具体例を入れる",
      length: "3行くらい",
    },
    working: "分かる言い方に置きかえています。",
    observationOptions: [
      { value: "やさしい言葉になった", label: "やさしくなった" },
      { value: "例えが入った", label: "例えが入った" },
      { value: "具体例が入った", label: "具体例が入った" },
      { value: "短くなった", label: "短くなった" },
      { value: "よく分からない", label: "よく分からない" },
    ],
    conceptCards: [
      {
        title: "相手を決める",
        body: "「小学生でも分かるように」と言うだけで、使う言葉が変わります。",
        visual: "highlight",
        highlight: "小学生でも分かるように",
      },
      {
        title: "例えを頼む",
        body: "身近なものに置きかえてもらうと、初めての言葉でも掴めます。",
        visual: "before_after",
        before: "定額制の役務提供契約です。",
        after: "雑誌の定期購読と同じ仕組みです。",
      },
      {
        title: "確かめる場所",
        body: "AIは知らないことも書きます。数字・日付・固有名詞は自分で確認します。",
        visual: "text",
      },
    ],
    reviewPoints: [
      "分からない言葉が残っていないか",
      "例が具体的か",
      "自分の言葉で説明し直せそうか",
    ],
    realTaskLabel: "いま分からない言葉を、ひとつ入れてみましょう。",
    realTaskPlaceholder: "例）社内で最近よく聞くけれど意味が分からない言葉",
    realTaskSteps: [
      {
        id: "real_audience",
        type: "single_choice",
        title: "誰に向けた説明にしますか",
        poMessage: "自分が分かればよいので、いちばん易しいものでも大丈夫です。",
        poEmotion: "question",
        key: "audience",
        required: true,
        options: [
          { value: "初心者向け", label: "初心者向け" },
          { value: "小学生向け", label: "小学生向け" },
          { value: "その分野の人向け", label: "その分野の人向け" },
          { value: "", label: "そのほか", free: true },
        ],
      },
      {
        id: "real_style",
        type: "single_choice",
        title: "どう説明してもらいますか",
        poMessage: "これで最後の質問です。",
        poEmotion: "question",
        key: "style",
        required: true,
        options: [
          { value: "例えを使う", label: "例えを使う" },
          { value: "順番に説明する", label: "順番に説明する" },
          { value: "ひとことで言う", label: "ひとことで言う" },
          { value: "", label: "そのほか", free: true },
        ],
      },
    ],
    takeaway: "相手を指定すると、説明の難しさが変わることを確かめられましたね。",
    nextSuggestion: "次は「選択肢を比較する」も試してみましょう。",
    factCheck: true,
  }),
};

// ---------------------------------------------------------------- Lesson 4

const LESSON_4: Lesson = {
  id: "compare_options",
  number: 4,
  title: "選択肢を比較する",
  goal: "比べる基準を自分で決められるようになる",

  outcomeTitle: "迷っている2案を、自分の基準で並べる",
  outcomeDescription: "決めるのは自分です。AIには材料を並べてもらいます。",
  estimatedMinutes: 9,
  beforeExample: "紙の書類で回す / 全部データにする",
  afterExample:
    "費用：紙は印刷代がかかる／データは初期の手間\n時間：紙は回覧待ち／データは即時\n※ 具体的な金額は確認が必要です",
  learnedSkills: ["比べる基準を自分で決める", "AIの結論をそのまま信じない"],

  outcomes: ["比べる基準を指定できる", "AIの結論をそのまま信じずに確かめられる"],
  tags: ["comparing"],
  usesAi: true,
  mode: "standard",
  steps: buildLessonFlow({
    aiAction: {
      action: "compare",
      inputs: {
        source_text: "options_text",
        criteria: "criteria",
        priority: "priority",
        as_table: "as_table",
      },
    },
    sampleText: "紙の書類で回す / 全部データにする",
    quickTitle: "いちばん大事にしたいことは？",
    quickInstruction: "ひとつ選ぶと、すぐにAIが並べます。",
    quickKey: "priority",
    quickOptions: [
      { value: "費用", label: "費用" },
      { value: "時間", label: "時間" },
      { value: "使いやすさ", label: "使いやすさ" },
    ],
    quickDefaults: { criteria: "費用と時間と使いやすさ", as_table: "文章でよい" },
    working: "基準ごとに並べています。",
    observationOptions: [
      { value: "基準ごとに整理された", label: "基準ごとに整理" },
      { value: "違いが分かった", label: "違いが分かった" },
      { value: "確認が必要な点が出た", label: "要確認の点が出た" },
      { value: "決め手が見えた", label: "決め手が見えた" },
      { value: "よく分からない", label: "よく分からない" },
    ],
    conceptCards: [
      {
        title: "基準は自分で決める",
        body: "「何を大事にするか」を先に決めないと、比べた結果を使えません。",
        visual: "three_points",
        points: ["費用", "時間", "使いやすさ"],
      },
      {
        title: "AIは決めてくれない",
        body: "おすすめは答えではありません。材料を出す係だと思ってください。",
        visual: "simple_flow",
        points: ["AIが並べる", "自分が選ぶ", "自分が決める"],
      },
      {
        title: "数字は必ず確認",
        body: "価格・仕様・最新情報は、それらしく書かれても確かめてください。",
        visual: "highlight",
        highlight: "価格・仕様・最新情報",
      },
    ],
    reviewPoints: [
      "価格・仕様・最新情報は確認が必要",
      "自分の基準が反映されているか",
      "決め手が自分の優先順位と合っているか",
    ],
    realTaskLabel: "いま迷っていることを、ひとつ入れてみましょう。",
    realTaskPlaceholder: "例）今の方法を続ける / 新しい方法に変える",
    realTaskSteps: [
      {
        id: "real_criteria",
        type: "multi_choice",
        title: "どの基準で比べますか",
        instruction: "いくつでも選べます。",
        poMessage: "基準を決めるのがいちばん大事なところです。",
        poEmotion: "question",
        key: "criteria",
        required: true,
        options: [
          { value: "かかる費用", label: "かかる費用" },
          { value: "かかる時間", label: "かかる時間" },
          { value: "使いやすさ", label: "使いやすさ" },
          { value: "続けやすさ", label: "続けやすさ" },
          { value: "失敗したときの影響", label: "失敗したときの影響" },
        ],
      },
      {
        id: "real_as_table",
        type: "single_choice",
        title: "表にしますか",
        poMessage: "これで最後の質問です。",
        poEmotion: "question",
        key: "as_table",
        required: true,
        options: [
          { value: "表にする", label: "表にする" },
          { value: "文章でよい", label: "文章でよい" },
        ],
      },
    ],
    takeaway: "基準を自分で決めると、比べた結果が使えるものになりますね。",
    nextSuggestion: "次は「計画を作る」も試してみましょう。",
    factCheck: true,
  }),
};

// ---------------------------------------------------------------- Lesson 5

const LESSON_5: Lesson = {
  id: "make_plan",
  number: 5,
  title: "計画を作る",
  goal: "実行できる小さな手順に分けてもらえるようになる",

  outcomeTitle: "やりたいことを、明日からの手順に変える",
  outcomeDescription: "期限と使える時間を伝えて、始められる大きさに分けます。",
  estimatedMinutes: 9,
  beforeExample: "毎月の報告書づくりを半分の時間で終わらせたい",
  afterExample:
    "1. 今の作業を書き出す（15分）\n2. 毎回同じ部分をひな形にする（30分）\n3. 来月の報告書でひな形を試す",
  learnedSkills: ["期限と使える時間を伝える", "始められる大きさに分けてもらう"],

  outcomes: ["期限と使える時間を伝えられる", "明日から始められる大きさに分けてもらえる"],
  tags: ["planning", "organizing", "ideas"],
  usesAi: true,
  mode: "standard",
  steps: buildLessonFlow({
    aiAction: {
      action: "plan",
      inputs: {
        source_text: "goal",
        deadline: "deadline",
        available_time: "available_time",
        avoid: "avoid",
      },
    },
    sampleText: "毎月の報告書づくりを半分の時間で終わらせたい",
    quickTitle: "いつまでにやりますか？",
    quickInstruction: "ひとつ選ぶと、すぐにAIが手順に分けます。",
    quickKey: "deadline",
    quickOptions: [
      { value: "今週中", label: "今週中" },
      { value: "1か月", label: "1か月" },
      { value: "3か月", label: "3か月" },
    ],
    quickDefaults: { available_time: "1日30分", avoid: "" },
    working: "実行できる大きさに分けています。",
    observationOptions: [
      { value: "手順に分かれた", label: "手順に分かれた" },
      { value: "始められる大きさになった", label: "始められる大きさ" },
      { value: "順番が決まった", label: "順番が決まった" },
      { value: "時間の目安がついた", label: "時間の目安がついた" },
      { value: "よく分からない", label: "よく分からない" },
    ],
    conceptCards: [
      {
        title: "期限を伝える",
        body: "「今週中」と「3か月」では、1つの手順の大きさが変わります。",
        visual: "before_after",
        before: "資料作りを効率化する",
        after: "今週中に、今の作業を15分で書き出す",
      },
      {
        title: "使える時間を言う",
        body: "1日15分と言えば、15分で終わる手順に分けてもらえます。",
        visual: "highlight",
        highlight: "1日15分",
      },
      {
        title: "避けたいことも伝える",
        body: "「お金をかけたくない」と言えば、その案は出てこなくなります。",
        visual: "text",
      },
    ],
    reviewPoints: [
      "明日から始められる大きさか",
      "使える時間に収まっているか",
      "避けたいことが入っていないか",
    ],
    realTaskLabel: "いま止まっていることを、ひとつ入れてみましょう。",
    realTaskPlaceholder: "例）やらないといけないのに手をつけられていないこと",
    realTaskSteps: [
      {
        id: "real_deadline",
        type: "single_choice",
        title: "いつまでに",
        poMessage: "期限があると、手順の大きさが決まります。",
        poEmotion: "question",
        key: "deadline",
        required: true,
        options: [
          { value: "今週中", label: "今週中" },
          { value: "1か月", label: "1か月" },
          { value: "3か月", label: "3か月" },
          { value: "", label: "そのほか", free: true },
        ],
      },
      {
        id: "real_time",
        type: "single_choice",
        title: "どれくらい時間を使えますか",
        poMessage: "これで最後の質問です。",
        poEmotion: "question",
        key: "available_time",
        required: true,
        options: [
          { value: "1日15分", label: "1日15分" },
          { value: "1日30分", label: "1日30分" },
          { value: "週に2時間", label: "週に2時間" },
          { value: "", label: "そのほか", free: true },
        ],
      },
    ],
    takeaway: "期限と使える時間を伝えると、計画の粒が変わることを確かめられましたね。",
    nextSuggestion: "次は「回答を改善する」も試してみましょう。",
  }),
};

// ---------------------------------------------------------------- Lesson 6

const LESSON_6: Lesson = {
  id: "improve_answer",
  number: 6,
  title: "回答を改善する",
  goal: "一度で完成させず、条件を足して近づけられるようになる",

  outcomeTitle: "回りくどい回答を、使える形に直す",
  outcomeDescription: "直したい方向を一つずつ伝えて、近づけていきます。",
  estimatedMinutes: 7,
  beforeExample:
    "本件につきましては、関係各部署との調整を経た上で、当該事項の詳細を精査し、最終的な方針を取りまとめる予定でございます。",
  afterExample: "関係部署と調整のうえ、方針をまとめます。決まり次第ご連絡します。",
  learnedSkills: ["直したい方向を一つずつ伝える", "足りない情報をAIに質問させる"],

  outcomes: ["直したい方向を一つずつ伝えられる", "足りない情報をAIに質問させられる"],
  tags: ["writing", "ideas"],
  usesAi: true,
  mode: "standard",
  steps: buildLessonFlow({
    aiAction: {
      action: "improve",
      inputs: {
        source_text: "original_text",
        improvement_direction: "improvement",
      },
    },
    sampleText:
      "本件につきましては、関係各部署との調整を経た上で、当該事項の詳細を精査し、必要に応じて追加の情報収集を行いつつ、最終的な方針を取りまとめる予定でございますので、いましばらくお時間を頂戴できますと幸いに存じます。",
    quickTitle: "どう直しますか？",
    quickInstruction: "ひとつ選ぶと、すぐにAIが直します。",
    quickKey: "improvement_direction",
    quickOptions: [
      { value: "短くする", label: "短くする" },
      { value: "具体例を追加する", label: "具体例を追加" },
      { value: "足りない情報を質問する", label: "追加質問する" },
    ],
    quickDefaults: {},
    working: "指定された方向だけを直しています。",
    observationOptions: [
      { value: "短くなった", label: "短くなった" },
      { value: "分かりやすくなった", label: "分かりやすくなった" },
      { value: "頼んだところだけ変わった", label: "頼んだ所だけ変化" },
      { value: "質問が返ってきた", label: "質問が返ってきた" },
      { value: "よく分からない", label: "よく分からない" },
    ],
    conceptCards: [
      {
        title: "一度に一つだけ",
        body: "まとめて頼むと、どれが効いたのか分からなくなります。",
        visual: "simple_flow",
        points: ["一つ足す", "結果を見る", "また一つ足す"],
      },
      {
        title: "質問させてもよい",
        body: "「足りない情報を聞いて」と頼むと、必要なことを尋ねてくれます。",
        visual: "highlight",
        highlight: "足りない情報を聞いて",
      },
      {
        title: "厳しく見てもらう",
        body: "「厳しい視点で」と頼むと、弱いところを指摘してもらえます。",
        visual: "text",
      },
    ],
    reviewPoints: [
      "頼んだところだけが変わっているか",
      "元に無い事実が足されていないか",
      "次に何を足せばもっと近づくか",
    ],
    realTaskLabel: "自分が書いた文章を、ひとつ入れてみましょう。",
    realTaskPlaceholder: "例）これから送ろうとしているメールの下書き",
    realTaskSteps: [
      {
        id: "real_direction",
        type: "single_choice",
        title: "どう直しますか",
        poMessage: "これで最後の質問です。",
        poEmotion: "question",
        key: "improvement_direction",
        required: true,
        options: [
          { value: "短くする", label: "短くする" },
          { value: "詳しくする", label: "詳しくする" },
          { value: "具体例を追加する", label: "具体例を追加" },
          { value: "表にする", label: "表にする" },
          { value: "別案を出す", label: "別案を出す" },
          { value: "足りない情報を質問する", label: "追加質問する" },
          { value: "厳しい視点でレビューする", label: "厳しく評価する" },
          { value: "", label: "そのほか", free: true },
        ],
      },
    ],
    takeaway: "一度で完成させる必要はありません。条件を足すたびに近づきます。",
    nextSuggestion: "次は「AIの回答を安全に使う」で仕上げましょう。",
  }),
};

// ---------------------------------------------------------------- Lesson 7

/**
 * AI を使わないレッスン（要件 §9）。
 *
 * ここで AI を呼ぶと、AI の答えを確かめる練習を AI に採点させることになる。
 * 固定問題にして、自分で判断させる。
 */
const LESSON_7: Lesson = {
  id: "use_ai_safely",
  number: 7,
  title: "AIの回答を安全に使う",
  goal: "確認が必要な情報と、入力してはいけない情報を見分けられるようになる",
  outcomes: [
    "AIの回答のうち確認が必要な箇所を見つけられる",
    "入力してはいけない情報が分かる",
    "AIと自分の判断の範囲を分けられる",
  ],
  tags: [],
  usesAi: false,
  mode: "standard",
  steps: [
    {
      id: "intro",
      type: "intro",
      title: "AIの回答を安全に使う",
      instruction: "ここではAIを動かしません。見分ける練習をします。",
      poMessage: "AIは自信たっぷりに間違えます。見分け方をおぼえましょう。",
      poEmotion: "warning",
    },
    {
      id: "check_targets",
      type: "multi_choice",
      title: "確認が必要なのはどれですか",
      instruction: "当てはまるものをすべて選んでください。",
      poMessage: "AIが「それらしく」作ってしまうものを選びましょう。",
      poEmotion: "question",
      key: "check_targets",
      required: true,
      options: [
        { value: "日付", label: "日付" },
        { value: "数値", label: "数値" },
        { value: "価格", label: "価格" },
        { value: "法律", label: "法律" },
        { value: "営業時間", label: "営業時間" },
        { value: "商品仕様", label: "商品仕様" },
        { value: "人物名", label: "人物名" },
        { value: "医療情報", label: "医療情報" },
      ],
      meta: {
        answer: [
          "日付",
          "数値",
          "価格",
          "法律",
          "営業時間",
          "商品仕様",
          "人物名",
          "医療情報",
        ],
        explanation:
          "ぜんぶです。AIは知らないことも、それらしい形で書いてしまいます。数字・日付・固有名詞は必ず元の資料で確かめましょう。",
      },
    },
    {
      id: "never_input",
      type: "multi_choice",
      title: "入力してはいけない可能性があるのはどれですか",
      instruction: "当てはまるものをすべて選んでください。",
      poMessage: "外に出したくないものを選びましょう。",
      poEmotion: "warning",
      key: "never_input",
      required: true,
      options: [
        { value: "パスワード", label: "パスワード" },
        { value: "APIキー", label: "APIキー" },
        { value: "顧客情報", label: "顧客情報" },
        { value: "未公開資料", label: "未公開資料" },
        { value: "クレジットカード番号", label: "カード番号" },
        { value: "個人住所", label: "個人住所" },
      ],
      meta: {
        answer: [
          "パスワード",
          "APIキー",
          "顧客情報",
          "未公開資料",
          "クレジットカード番号",
          "個人住所",
        ],
        explanation:
          "こちらもぜんぶです。入れてしまうと取り消せません。迷ったら入れない、が安全です。",
      },
    },
    {
      id: "split_judgement",
      type: "single_choice",
      title: "最後に決めるのは誰ですか",
      poMessage: "ここがいちばん大事なところです。",
      poEmotion: "question",
      key: "split_judgement",
      required: true,
      options: [
        { value: "自分", label: "自分" },
        { value: "AI", label: "AI" },
        { value: "AIが自信を持って言えばAI", label: "自信ありげならAI" },
      ],
      meta: {
        answer: ["自分"],
        explanation:
          "AIは材料を出す係で、決めるのは自分です。責任を持てるのは自分だけだからです。",
      },
    },
    {
      id: "reflection",
      type: "reflection",
      title: "ふりかえり",
      instruction: "おぼえたことを確認しましょう。",
      poMessage: "確かめるところと、入れないものが分かれば、安心して使えます。",
      poEmotion: "neutral",
    },
    {
      id: "completion",
      type: "completion",
      title: "できるようになりました",
      poMessage: "最後は、自分の困りごとで試してみましょう。",
      poEmotion: "celebrate",
      skill: "確認が必要な箇所と、入力してはいけない情報が分かる",
    },
  ],
};

// ------------------------------------------------------- Final Challenge

/**
 * 自分の困りごとで試す。
 *
 * 完全な自由教材生成はしない（要件 §9）。
 * 答えから、これまでのレッスンの型に**割り当てる**。
 */
const FINAL: Lesson = {
  id: "final_challenge",
  number: 8,
  title: "自分の困りごとで試す",
  goal: "自分の課題を、これまでの型に当てはめて解けるようになる",

  outcomeTitle: "自分の困りごとを、AIに頼める形にする",
  outcomeDescription: "面倒に感じていることを、これまでの型に当てはめます。",
  estimatedMinutes: 10,
  learnedSkills: ["困りごとを型に当てはめる", "できあがりの形を先に決める"],

  outcomes: ["自分の困りごとをAIに任せられる形に言い換えられる"],
  tags: [],
  usesAi: true,
  steps: [
    {
      id: "intro",
      type: "intro",
      title: "自分の困りごとで試す",
      instruction: "いま面倒に感じていることを、AIに任せる形にしてみます。",
      poMessage: "ここまでの型のどれかに当てはめれば、たいていのことは頼めます。",
      poEmotion: "neutral",
    },
    {
      id: "trouble",
      type: "text_input",
      title: "いま面倒に感じていること",
      instruction: "ひとつだけ書いてください。うまく書けなくて大丈夫です。",
      poMessage: "思いついたままで大丈夫です。あとで形にします。",
      poEmotion: "question",
      key: "trouble",
      required: true,
      placeholder: "例）毎週の報告書を書くのに時間がかかる",
      validationRules: { suggestLength: 10, maxLength: 500 },
    },
    {
      id: "kind",
      type: "single_choice",
      title: "どれに近いですか",
      instruction: "近いものを選ぶと、その型で進みます。",
      poMessage: "迷ったら「文章を直す」から試すのがおすすめです。",
      poEmotion: "hint",
      key: "kind",
      required: true,
      options: [
        { value: "rewrite", label: "文章を書く・直す" },
        { value: "summarize", label: "長い文章をまとめる" },
        { value: "explain", label: "説明してもらう" },
        { value: "compare", label: "選択肢を比べる" },
        { value: "plan", label: "計画を作る" },
      ],
    },
    {
      id: "goal_output",
      type: "text_input",
      title: "何が完成すればよいですか",
      instruction: "できあがりの形を書いてください。",
      poMessage: "ゴールが決まると、AIへの伝え方が決まります。",
      poEmotion: "question",
      key: "goal_output",
      required: true,
      placeholder: "例）そのまま送れるメールの文面",
      validationRules: { suggestLength: 5, maxLength: 300 },
    },
    {
      id: "condition",
      type: "text_input",
      title: "条件はありますか",
      instruction: "相手・長さ・期限など。無ければ「特になし」で大丈夫です。",
      poMessage: "これで最後です。条件は後からでも足せます。",
      poEmotion: "question",
      key: "condition",
      required: false,
      placeholder: "例）3行くらいで、社外向けにていねいに",
      validationRules: { maxLength: 300 },
    },
    {
      id: "source_text",
      type: "text_input",
      title: "対象になる文章",
      instruction: "扱いたい文章があれば入れてください。無ければ困りごとをそのまま使います。",
      poMessage: "会社の秘密や個人情報は入れないようにしましょう。",
      poEmotion: "warning",
      key: "source_text",
      required: false,
      placeholder: "例）いま書きかけのメール",
      validationRules: { maxLength: 5000 },
    },
    ...buildLessonFlow({
      aiAction: {
        // 実際に使う action は、選んだ「どれに近いか」で差し替える。
        // 差し替えは useCourseLesson が行う（教材データは型だけ持つ）。
        action: "rewrite",
        inputs: {
          source_text: "original_text",
          goal_output: "audience",
          condition: "tone",
        },
        fixed: { length: "ちょうどよい長さ" },
      },
      // Final Challenge は、上のステップで自分の困りごとを入れてもらう。
      // 最初の1回で使うのは、そこに入れた文章そのもの。
      sampleText: "",
      quickTitle: "できあがりは、どんな形がよいですか？",
      quickInstruction: "ひとつ選ぶと、すぐにAIが作ります。",
      quickKey: "goal_output",
      quickOptions: [
        { value: "そのまま送れる文章", label: "そのまま送れる文章" },
        { value: "箇条書きのメモ", label: "箇条書きのメモ" },
        { value: "手順のリスト", label: "手順のリスト" },
      ],
      quickDefaults: { condition: "分かりやすく" },
      working: "あなたの困りごとに合わせて作っています。",
      observationOptions: [
        { value: "そのまま使えそう", label: "そのまま使えそう" },
        { value: "形が合っている", label: "形が合っている" },
        { value: "もう少し直したい", label: "もう少し直したい" },
        { value: "よく分からない", label: "よく分からない" },
      ],
      conceptCards: [
        {
          title: "型に当てはめる",
          body: "困りごとは「直す・まとめる・説明する・比べる・計画する」に入ります。",
          visual: "three_points",
          points: ["直す", "まとめる", "計画する"],
        },
        {
          title: "できあがりを言う",
          body: "「そのまま送れる文章」のように、形を先に決めると近づきます。",
          visual: "highlight",
          highlight: "そのまま送れる文章",
        },
      ],
      reviewPoints: [
        "そのまま使える形になっているか",
        "条件が反映されているか",
        "確かめる必要がある数字や日付はないか",
      ],
      realTaskLabel: "もうひとつ、別の困りごとでも試してみましょう。",
      realTaskPlaceholder: "例）月末にいつも手間取っている作業",
      takeaway: "困りごとを「型」に当てはめれば、たいていのことは頼めますね。",
      nextSuggestion: "気に入った型は、明日の仕事でそのまま使ってみましょう。",
    }),
  ],
};

/**
 * 同梱データの時点で「近日公開」にしておく教材。
 *
 * 以前はここが逆で、始められるものを列挙していた
 * （第一リリースでは診断と文章改善の2本だけ）。教材9本の中身が
 * 揃った今、閉じておく理由はもう無いので空にしてある。
 *
 * ここは**同梱データの初期値**でしかない。本来の持ち主はサーバーで、
 * 管理画面から `availability_status` を変えれば画面もそれに従う
 * （api/catalog.ts で受け取ったものが、こちらより優先される）。
 *
 * 仕組みそのものは残す。未完成の教材を足すときは、ここに id を並べれば
 * 一覧には出したまま開始だけを止められる。
 * 最後の砦はサーバー（apps/catalog/access.py）で、ここは
 * 「押させない・見せ方を変える」ためのもの。
 */
const RELEASE_COMING_SOON = new Set<string>([]);

/** 同梱データへ、利用可否の初期値を当てる。 */
function withReleaseAvailability(lessons: Lesson[]): Lesson[] {
  return lessons.map((lesson) => ({
    ...lesson,
    availability: RELEASE_COMING_SOON.has(lesson.id)
      ? ("coming_soon" as const)
      : ("available" as const),
  }));
}

/**
 * AIスタートコースの並び。
 *
 * **サーバー側（`apps/catalog/release_seeding.py` の START_CURRICULUM）と
 * 同じ姿にする。** ここは通信が届かないときの控えなので、控えだけが
 * 違うカリキュラムを出すと、圏外で見た人と繋がった人で別の教材が並ぶ。
 *
 * 上の LESSON_* は教材の**本文**で、こちらは**並べ方**。分けてあるのは、
 * 本文が「移設で1文字も変わっていない」ことを確かめる正解データ
 * （backend/tests/test_catalog_parity.py）を兼ねているため。
 * カリキュラムを変えるたびに本文を書き換えると、その役目が消える。
 *
 * ここに無いレッスン（アイデアを広げる・情報を整理して見やすくする・
 * 画像の2本）は、サーバーだけが持っている。控えの役目は
 * 「通信できなくても最後まで学べること」で、そこは満たせている。
 */
const START_CURRICULUM: { lesson: Lesson; number: number; title: string; stage: string }[] = [
  // 診断は Day ではない。始める前に自分の現在地を見るもの
  { lesson: LESSON_0, number: 0, title: "AI活用診断", stage: "orientation" },
  { lesson: LESSON_1, number: 1, title: "文章を分かりやすくする", stage: "ask" },
  { lesson: LESSON_2, number: 2, title: "長い文章を短くまとめる", stage: "ask" },
  { lesson: LESSON_3, number: 3, title: "分からないことを説明してもらう", stage: "ask" },
  { lesson: LESSON_4, number: 5, title: "選択肢を比較する", stage: "think" },
];

const STAGE_TITLES: Record<string, string> = {
  orientation: "現在地チェック",
  ask: "AIに頼んでみる",
  think: "AIと考える",
  create: "AIで作る",
};

const START_LESSONS = withReleaseAvailability(
  START_CURRICULUM.map(({ lesson, number, title, stage }) => ({
    ...lesson,
    number,
    title,
    stageKey: stage,
  })),
);

/** 並びから STEP の束を読む。サーバー側の `_stages()` と同じ読み方。 */
function stagesOf(lessons: Lesson[]): CourseStage[] {
  const stages: CourseStage[] = [];
  for (const lesson of lessons) {
    if (!lesson.stageKey) continue;
    const last = stages[stages.length - 1];
    if (last && last.key === lesson.stageKey) {
      last.lessonIds.push(lesson.id);
      continue;
    }
    stages.push({
      key: lesson.stageKey,
      title: STAGE_TITLES[lesson.stageKey] ?? "",
      lessonIds: [lesson.id],
    });
  }
  return stages;
}

export const COURSE: Course = {
  id: "first_step_7days",
  title: "AIスタートコース",
  description: "AIを仕事や日常で使う基本を、1日ひとつずつ身につけます。",
  outcome:
    "文章・要約・整理・比較・画像まで、AIを仕事や日常で使う基本が身につきます。",
  stages: stagesOf(START_LESSONS),
  lessons: START_LESSONS,
};

/**
 * AIスタートコースから外したもの。
 *
 * **消していない。** 本文も、それで覚えた技も、終えた記録も生きている。
 * サーバーでは AI活用コース（`improve_answer` / `make_plan`）と
 * 非公開の旧教材（`use_ai_safely` / `final_challenge`）へ移してある。
 *
 * ここに残しておくのは、**学習記録から開けるようにする**ため。
 * 一覧から外したのと、行き先ごと消すのは別のこと——終えた人が
 * 自分の記録を押して「ありません」と言われるのがいちばんよくない。
 */
export const MOVED_OUT_LESSONS: Lesson[] = withReleaseAvailability([
  LESSON_6, // improve_answer … AI活用コースへ
  LESSON_5, // make_plan       … AI活用コースへ
  LESSON_7, // use_ai_safely   … 非公開
  FINAL, // final_challenge  … 非公開
]);

export function getLesson(lessonId: string): Lesson | null {
  return (
    COURSE.lessons.find((lesson) => lesson.id === lessonId) ??
    MOVED_OUT_LESSONS.find((lesson) => lesson.id === lessonId) ??
    null
  );
}

/** AI を使うレッスン。Lesson 0 と 7 は含まない。 */
export const AI_LESSON_IDS = COURSE.lessons
  .filter((lesson) => lesson.usesAi)
  .map((lesson) => lesson.id);
