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

import { buildLessonFlow } from "./shared";
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
 * 題材は「専門家向けの文章を、その分野を知らない人に届く文章へ変える」。
 *
 * 最初の1回で選ばせるのは1つだけ
 * ------------------------------
 * 最初から相手も言い方も長さも聞くと、最初の結果に届く前に手が止まる。
 * ここで選ぶのは頼みかた1つで、残りは**足していく**。
 *
 * なぜ普通に読みにくいメールではないか
 * ------------------------------------
 * 前は打ち合わせの依頼メールだった。読みにくくはあるが、**読めば分かる**。
 * 直した結果も「少し整った」で終わり、AIに頼んだ意味が体感しにくい。
 *
 * まったく歯が立たない文章から始めると、1回目の結果でいきなり
 * 「読める」に変わる。そこがこの教材でいちばん見せたい瞬間。
 *
 * 「短くする」を目的にしない
 * --------------------------
 * Day2 が要約なので、ここでも短さを狙わせると役割が重なる。
 * この回で目指すのは、
 *
 *     理解できる ／ 相手に合っている ／ 伝わりやすい
 *
 * の3つ。分かりやすくするために**長くなってよい**。だから長さの指定は
 * 最初から渡さないし、条件の選択肢にも「もっと短く」を置かない。
 *
 * 3段で足していく
 * ---------------
 *     1回目  「専門用語を減らす」など      … まず読める形になる
 *     2回目  ＋「AI初心者向けに」          … 説明のしかたが変わる
 *     3回目  ＋「やさしい口調で」          … 言い方が変わる
 *
 * 足すたびに何が変わったかを見比べるので、1回目でいきなり全部を
 * 指定させない。
 */
const LESSON_1: Lesson = {
  id: "rewrite_text",
  number: 1,
  title: "文章を分かりやすくする",
  goal: "「誰向けか」「どんな言い方か」をAIに伝えられるようになる",

  outcomeTitle: "専門的で難しい文章を、誰にでも伝わる文章に変える",
  outcomeDescription: "読む相手と言い方を伝えて、意味を変えずに分かりやすくします。",
  /*
    3分。**8分は古い数字**で、レッスンはできるだけ短く終われる形にする
    という方針に変わっている。

    ここを直すと、コース一覧・レッスン行・再開カード・ホームのカードが
    まとめて変わる（どれもこの値を読んでいる）。**全体図の絵は別**で、
    数字が焼き込まれている——`scripts/teaching-images/overviews.json` に
    「絵が何と言っているか」を控えてあり、ここと食い違うと
    `tests/teachingImageFacts.test.ts` が落ちる。

    Day2〜8 はまだ触らない。各日の中身を決めてから1本ずつ入れる。
  */
  estimatedMinutes: 3,
  beforeExample:
    "Transformer型言語モデルにおける自己注意機構では、各トークンから生成されたQueryとKeyの内積をスケーリングし、Softmax関数によって正規化したAttention WeightをValueに適用することで、系列内のトークン間依存関係を動的に表現する。さらに、多層化されたMulti-Head Attentionにより異なる表現部分空間における依存関係を並列的に学習することが可能となる。",
  /*
    後の例は**短くしていない**。分かりやすさのために言葉を足している
    ところを、そのまま見せる。

    専門用語を訳しただけの文にしない
    --------------------------------
    前の例文は「文章の中にある言葉同士の関係を調べながら、どの言葉に
    注目するべきかを判断します」で、元の用語を1つずつ日本語に置き換えた
    形をしていた。対応はたどれるが、**読んでも分かった気がしない**
    ——専門用語が消えただけで、言っていることの難しさは変わっていない。

    いまの例文は、読む人の側から書いてある（「すべての言葉を同じように
    見るわけではありません」）。Query・Key・Softmax・Value といった
    内部の計算はここでは出さない。Day1 は Transformer を教える回では
    なく、**難しい文章を読めるようにする**回なので。

    用語の対応は `course/lessonPlan.ts` が表として持っている。元の用語が
    ここに残っていないことは `tests/lessonPlan.test.ts` が見張る。
  */
  afterExample:
    "AIは文章を読むとき、すべての言葉を同じように見るわけではありません。\n「この言葉と、この言葉は関係がありそう」と考えながら、文章の中で大事な言葉に注目します。\nさらに、いくつかの見方を同時に使うことで、言葉同士のつながりを捉え、文章の意味を理解しやすくしています。",
  learnedSkills: ["誰向けかを伝える", "言い方を伝える"],

  outcomes: [
    "むずかしい文章を、意味を変えずに分かりやすくできる",
    "読む相手を伝えて、説明のしかたを変えられる",
    "言い方を指定して、伝わり方を整えられる",
  ],
  tags: ["writing"],
  usesAi: true,
  mode: "standard",
  steps: buildLessonFlow({
    aiAction: {
      action: "rewrite",
      inputs: {
        source_text: "original_text",
        // 1回目はこれだけが入る。相手も言い方も、まだ選んでいない
        instruction: "instruction",
        audience: "audience",
        tone: "tone",
        length: "length",
      },
    },
    sampleText:
      "Transformer型言語モデルにおける自己注意機構では、各トークンから生成されたQueryとKeyの内積をスケーリングし、Softmax関数によって正規化したAttention WeightをValueに適用することで、系列内のトークン間依存関係を動的に表現する。さらに、多層化されたMulti-Head Attentionにより異なる表現部分空間における依存関係を並列的に学習することが可能となる。",
    /*
      最初に聞くのは「誰向けか」ではなく「何て頼むか」。

      誰向けかをここで選ばせると、**1回目からターゲット指定が入る**。
      そのあと「AI初心者向けに」を足しても、変わったのがそのせいだと
      分からない。1回目は条件なしで送って、2回目との差で見せる。

      どれを選んでも向きは同じ「分かりやすく」。**どこを直したいか**を
      自分で決めることで、頼んだのは自分だという手応えを持ってもらう。

      言い方は命令文にしない
      ----------------------
      前は「分かりやすくして」「かんたんな言葉にして」だった。AIへの
      命令をそのまま並べた形で、幼く見えるうえに、仕事の文章を扱う人が
      口にする言葉ではない。**直したい方向**の言い方に寄せてある
      （「専門用語を減らす」）。選ぶ側の言葉になり、あとの
      「AI初心者向けに」「やさしい口調で」とも並びがそろう。
    */
    quickTitle: "どこから分かりやすくする？",
    // 何が起きるかは下のボタンが言っている（「AIに書き直してもらう」）
    quickInstruction: "",
    quickKey: "instruction",
    quickOptions: [
      { value: "専門用語を減らす", label: "専門用語を減らす" },
      { value: "かみくだいて説明する", label: "かみくだいて説明する" },
      { value: "要点から先に伝える", label: "要点から先に伝える" },
    ],
    /*
      既定値を置かない。

      前は `{ tone: "ていねいに", length: "3行くらい" }` を黙って足していた。
      新しい題材では、それが**この回のねらいを壊す**——言い方は Section 3 で
      自分で選ぶもので、長さに至っては Day2（要約）の役目。
      黙って「3行くらい」と頼むと、専門文が3行に切り詰められて、
      分かりやすくなったのか削られただけなのか見分けが付かない。
    */
    quickDefaults: {},
    working: "",
    /*
      結果を見た直後に聞くのは1つだけ。**この教材のねらいそのもの**を聞く。

      前は「どこが変わったと思いますか」で、5つの選択肢と観点3つが
      並んでいた。気づきの中身は取れるが、いちばん手応えのある瞬間に
      いちばん読ませる画面になっていた。

      気づきの中身は、**うまくいかなかった人にだけ**その場で聞く。
      答えなくても進める。
    */
    observeTitle: "分かりやすくなった？",
    /*
      「うん」を使わない。**何に対する「うん」なのか**が、選ぶ側から
      見て決まらない——分かりやすくなったのか、読み終わったのか、
      次へ進んでよいのか。答えそのものを言葉にする。
    */
    observationOptions: [
      { value: "分かりやすくなった", label: "分かりやすくなった" },
      { value: "まだ難しい", label: "まだ難しい" },
    ],
    /*
      「まだ長い」は置かない。この回で長さは論点ではないので、
      選択肢に出した時点で「短いほうがよい」と教えてしまう。
    */
    observeReasons: [
      { value: "まだ専門用語がある", label: "まだ専門用語がある" },
      { value: "意味が変わった", label: "意味が変わった" },
      { value: "説明が足りない", label: "説明が足りない" },
      { value: "かたい", label: "かたい" },
    ],
    /*
      骨格が続けて出す解説は**1枚だけ**にしてある。

      3枚続けると、手を動かす前に解説を3画面読むことになる。
      残り2枚（トーン指定・反復）は、それを実際に使う場面の直前へ
      移した（下の realTaskSteps）。**技は、使う直前に出す。**
    */
    /*
      技の名前は、AI分野で普通に使われている言葉にする
      （AIPPO だけの造語にしない）。やさしい言い方はカードの見出しが
      持っていて、名前のほうを `conceptSkills` が持つ。
    */
    /*
      2回目に足すのは**誰向けか**。共通の選択肢（もっと短く・もっと丁寧に…）
      は使わない。あれは文章を整える言い回しで、この回のねらい
      （相手を決めると説明のしかたが変わる）に当たらないうえ、
      先頭の「もっと短く」が Day2 の役目とぶつかる。
    */
    conditionOptions: [
      { value: "AI初心者向けに", label: "AI初心者向けに", icon: "person" },
      { value: "新入社員向けに", label: "新入社員向けに", icon: "people" },
      { value: "お客様向けに", label: "お客様向けに", icon: "building" },
      { value: "", label: "自分で条件を追加", free: true, icon: "plus" },
    ],
    conceptSkills: ["ターゲット指定"],
    conceptCards: [
      {
        title: "誰向けかを伝える",
        body: "「誰向けか」を伝えると、説明のしかたが変わる。",
        visual: "before_after",
        before: "Attention WeightをValueに適用する。",
        after: "どの言葉が関係しているかを決めて、それを使って読み取る。",
        // 見返すときは別の例で。同じ文をもう一度出しても、飛ばした人には同じ
        reviewExample: {
          body: "相手が変われば、どこまでかみくだくかも変わります。",
          before: "多層化されたMulti-Head Attention",
          after: "同じ読み取りを、何通りもの見方で同時にやる仕組み",
        },
      },
    ],
    /*
      「指定した長さになっているか」は外した。長さを指定しないので、
      見に行く先が無い。代わりに、この回で本当に見てほしい
      「むずかしい言葉が残っていないか」を置く。
    */
    reviewPoints: [
      "元の意味が変わっていないか",
      "読む相手に合った説明になっているか",
      "むずかしい言葉が残っていないか",
    ],
    realTaskLabel: "いま実際に分かりやすくしたい文章を、ひとつ入れてみましょう。",
    realTaskPlaceholder: "例）社内で回ってきた、専門用語の多い資料の一文",
    /*
      詰まった人へのヒント。

      **答えを全部は言わない。** 次に試す条件を1つだけ示す。
      「こう書けば正解」と渡すと、自分で条件を選ぶ練習にならない
      ——それがこの教材で身に付けたいことそのもの。

      順に出す。1つ目で動けた人には2つ目を見せない。
    */
    realTaskHints: [
      "誰に読んでもらう文章か、AIに伝えてみると変わるかも！",
      "「たとえを使って」のように、説明のしかたをひとつだけ足してみましょう。",
      "うまくいかないときは、元の文章を少し長めに入れてみてください。",
    ],
    /*
      技を深める並び。**自分の文章を書く前**に置く。

          誰が読むか → 【トーン指定】 → どう変えたいか → 【反復】
          → 自分の文章 → 送る内容を見る → 送る

      前は自分の文章を書いた**あと**に置いていた。書き終えた人を
      4画面ぶん足止めしてから送る形で、しかも「自分で試す」の区切りが
      11歩に膨らみ、帯がそのあいだ止まっていた。相手も言い方も、
      自分の文章とは関係なく決められるので、先に済ませる。

      解説を2枚続けて出さない。**あいだに必ず手を動かす画面が入る。**
      技を出す位置も、使う場面のすぐ手前——トーン指定はトーンを選ぶ
      直前、反復は自分の文章を書く直前。「一度で完璧を目指さなくていい」は、
      これから書く人にいちばん効く。
    */
    deepenSteps: [
      {
        id: "real_audience",
        type: "single_choice",
        phase: "deepen",
        primaryLabel: "誰向けか決めた",
        title: "誰が読みますか",
        poMessage: "読む相手を伝えると、説明のしかたが変わります。",
        poEmotion: "question",
        key: "audience",
        required: true,
        /*
          共通の AUDIENCE_OPTIONS（上司・同僚・顧客）は使わない。
          この回で分けたいのは役職ではなく**どれだけ知っているか**で、
          そこが変わると説明の深さが変わる。
        */
        options: [
          { value: "その分野を知らない人", label: "その分野を知らない人" },
          { value: "新入社員", label: "新入社員" },
          { value: "お客様", label: "お客様" },
          { value: "くわしい人", label: "くわしい人" },
          { value: "", label: "そのほか", free: true },
        ],
      },
      {
        id: "concept_tone",
        type: "concept_card",
        phase: "deepen",
        primaryLabel: "トーンを選ぶ",
        skill: "トーン指定",
        title: "トーン指定",
        poMessage: "同じ内容でも、言い方は変えられます。",
        poEmotion: "neutral",
        // 解説は必ず飛ばせる。読みたくない人を足止めしない
        skippable: true,
        card: {
          title: "トーン指定",
          body: "内容はそのままでも、口調を変えると受け取る感じが変わります。",
          visual: "three_points",
          /*
            3つの言葉は、この回で出す絵（skill_02_tone.webp）に
            焼き込まれているものと揃える。絵が読めなかったときの
            代わりに出る図なので、違う言葉を並べると別の話に見える。
          */
          points: ["丁寧", "やわらかい", "カジュアル"],
          /*
            見返すときの例から「3行で」を外した。長さは Day2 の役目で、
            ここで混ぜると、口調の話に長さの話が紛れ込む。
          */
          reviewExample: {
            body: "言い方は、口調でも、たとえの有無でも指定できます。",
            points: ["やさしく", "たとえを使って", "結論から"],
          },
        },
      },
      {
        id: "real_tone",
        type: "single_choice",
        phase: "deepen",
        primaryLabel: "この言い方で書く",
        title: "どんな口調にしますか",
        poMessage: "これで最後の質問です。",
        poEmotion: "question",
        key: "tone",
        required: true,
        // 先頭は「やさしい口調で」。この回でいちばん効きめが見える口調
        options: [
          { value: "やさしい口調で", label: "やさしい口調で" },
          { value: "ていねいに", label: "ていねいに" },
          { value: "きっぱりと", label: "きっぱりと" },
          { value: "たとえを使って", label: "たとえを使って" },
          { value: "", label: "そのほか", free: true },
        ],
      },
      {
        id: "concept_iteration",
        type: "concept_card",
        phase: "deepen",
        primaryLabel: "自分の文章で試す",
        skill: "反復（Iteration）",
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
            points: ["まだ難しかった", "「たとえを足して」と言う", "また見る"],
          },
        },
      },
    ],
    takeaway:
      "誰向けかと言い方を伝えると、同じ内容でも伝わり方が変わることを確かめられましたね。",
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
    /*
      骨格が続けて出す解説は**1枚だけ**にしてある。

      覚える技は3つ（要約・出力形式の指定・コンテキスト）で、残り2つは
      それを実際に使う場面の直前へ移した（下の realTaskSteps）。
      **技は、使う直前に出す。**

      「足された話に気をつける」は解説から外した。技ではなく確かめ方の
      話で、**同じことを下の reviewPoints が言っている**（結果を見る
      画面で毎回出る）。解説でも言うと、1レッスンに4枚並ぶことになる。
    */
    conceptCards: [
      {
        title: "要約",
        body: "全部を削るのではなく、目的・決定事項・次の行動といった大事な情報を残します。",
        visual: "three_points",
        points: ["目的", "決定事項", "次の行動"],
        reviewExample: {
          body: "何を残すかは、そのあと何に使うかで決まります。",
          points: ["共有する", "作業を知る", "内容をつかむ"],
        },
      },
    ],
    reviewPoints: [
      "元に無い話が混ざっていないか",
      "指定した形になっているか",
      "自分が必要な情報が残っているか",
    ],
    realTaskLabel: "手元にある長い文章を、ひとつ入れてみましょう。",
    realTaskPlaceholder: "例）今日届いた長いメールの本文",
    /*
      自分の文章を入れたあとの並び。

          【出力形式の指定】 → どんな形で欲しいか
          → 【コンテキスト】 → 何のためにまとめるか → 送る

      形を先に聞く。直前の比較で見たのが「3つの箇条書きで」の効果
      なので、そこから続けて自分の文章の形を決めるのが素直な順になる。

      解説を2枚続けて出さない。**あいだに必ず手を動かす画面が入る。**
      技を出す位置も、覚えてもらう場面のすぐ手前にしてある。
    */
    realTaskSteps: [
      {
        id: "concept_output_format",
        type: "concept_card",
        phase: "own",
        title: "出力形式の指定",
        poMessage: "何を答えるかだけでなく、どう答えるかも指定できます。",
        poEmotion: "neutral",
        // 解説は必ず飛ばせる。読みたくない人を足止めしない
        skippable: true,
        card: {
          title: "出力形式の指定",
          body: "同じ情報でも、3行・箇条書き・表のどれで欲しいかを指定できます。",
          visual: "three_points",
          points: ["3行で", "箇条書きで", "表で"],
          reviewExample: {
            body: "そのまま貼って使える形を言うと、直す手間が減ります。",
            points: ["重要な点を3つ", "次にやることだけ", "見出しを付けて"],
          },
        },
      },
      {
        id: "real_format",
        type: "single_choice",
        title: "どんな形で欲しいですか",
        poMessage: "そのまま使える形を選んでください。",
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
      {
        id: "concept_context",
        type: "concept_card",
        phase: "own",
        title: "コンテキスト",
        poMessage: "背景を伝えるほど、目的に合った答えになります。",
        poEmotion: "hint",
        skippable: true,
        card: {
          title: "コンテキスト",
          body: "目的・相手・場面という背景を渡すと、要点の絞り方が変わります。",
          visual: "three_points",
          points: ["目的", "相手", "場面"],
          reviewExample: {
            body: "「共有用」と「自分の作業用」では、残すべきところが違います。",
            points: ["共有する", "作業を知る", "内容をつかむ"],
          },
        },
      },
      {
        id: "real_purpose",
        type: "single_choice",
        title: "何のためにまとめますか",
        poMessage: "これで最後の質問です。目的が変わると、残す情報が変わります。",
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
        /*
          どんな立場で答えるか（ロール指定）。**`style` を流用しない。**

          `style` は最初のお試しで `quickDefaults` が「例えを使う」で
          埋めてしまう欄で、そこへ立場を重ねると、**選ばなくても値が
          入っている状態**になる。`checkStep` は「空かどうか」しか見ない
          ので、必須にしても素通りできてしまい、「これがロール指定」と
          教えた直後に立場の無い依頼がAIへ行く。別の欄にして塞ぐ。
        */
        role: "role",
        style: "style",
        example: "example",
        length: "length",
        /*
          聞き返しの一言。空なら依頼文に出ない（apps/ai/actions.py の
          `_line` が空の項目を落とす）ので、答えなくても通る。
        */
        followup: "instruction",
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
    /*
      骨格が続けて出す解説は**1枚だけ**にしてある。

      覚える技は3つ（ターゲット指定・ロール指定・追加質問）で、残り2つは
      それを実際に使う場面の直前へ移した（下の realTaskSteps）。
      **技は、使う直前に出す。**

      外した2枚
      ----------
      「例えを頼む」… 直後の比較で、身近な例を足した結果をそのまま見る。
      並べて見たあとに同じことを言うと、二度読ませることになる。
      「確かめる場所」… `factCheck` を立ててあるので、結果を見る画面が
      毎回そのことを出す。解説でも言うと1レッスンに4枚並ぶ。
    */
    conceptCards: [
      {
        title: "ターゲット指定",
        body: "「小学生でも分かるように」と言うだけで、使う言葉が変わります。",
        visual: "highlight",
        highlight: "小学生でも分かるように",
        reviewExample: {
          body: "身近なものに置きかえてもらうと、初めての言葉でも掴めます。",
        },
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
        id: "concept_role",
        type: "concept_card",
        phase: "own",
        title: "ロール指定",
        poMessage: "どんな立場で答えてほしいかを伝えられます。",
        poEmotion: "neutral",
        // 解説は必ず飛ばせる。読みたくない人を足止めしない
        skippable: true,
        card: {
          title: "ロール指定",
          body: "「先生として」「IT担当者として」と立場を伝えると、説明の寄せ方が変わります。",
          visual: "three_points",
          points: ["先生", "IT担当者", "詳しい友だち"],
          reviewExample: {
            body: "同じことでも、誰の口から聞くかで届き方が変わります。",
            points: ["先生なら順を追って", "実務なら手順から", "友だちなら要点だけ"],
          },
        },
      },
      {
        /*
          直前で「これがロール指定」と言っておきながら、それを使う場面が
          どこにも無い、という形にしないための1問。選んだ言葉が
          「答える立場」としてそのまま依頼文に乗る。

          専用の `role` に置いている（`style` の流用ではない）。理由は
          上の `inputs` に書いた——`style` は最初のお試しで既定値が
          入るので、必須にしても素通りできる。
        */
        id: "real_role",
        type: "single_choice",
        title: "どんな立場で説明してもらいますか",
        poMessage: "立場を伝えると、説明の寄せ方が変わります。",
        poEmotion: "question",
        key: "role",
        required: true,
        options: [
          { value: "先生として、順を追って教えるように", label: "先生として" },
          { value: "IT担当者として、実務に寄せて", label: "IT担当者として" },
          { value: "詳しい友だちとして、くだけた言葉で", label: "詳しい友だちとして" },
          { value: "", label: "そのほか", free: true },
        ],
      },
      {
        id: "concept_followup",
        type: "concept_card",
        phase: "own",
        title: "追加質問",
        poMessage: "分からないまま終わらず、聞き返して大丈夫です。",
        poEmotion: "hint",
        skippable: true,
        card: {
          title: "追加質問",
          body: "一度で分からなくても、聞き返しながら近づけていけます。",
          visual: "simple_flow",
          points: ["答えを読む", "分からない所を言う", "もう一度もらう"],
          reviewExample: {
            body: "「もっと簡単に」「具体例を出して」の一言で十分です。",
            points: ["もっと簡単に", "具体例を出して", "一言でまとめて"],
          },
        },
      },
      {
        /*
          聞き返しの一言。**答えなくても進める**（required にしない）。

          いまのレッスンは1往復で終わるので、聞き返しは送る前に
          添える形にしてある。空なら依頼文に出ない。
        */
        id: "real_followup",
        type: "single_choice",
        title: "追加でお願いしたいことはありますか",
        poMessage: "これで最後です。無ければ「追加はしない」で進めます。",
        poEmotion: "question",
        key: "followup",
        options: [
          { value: "もっと簡単な言葉で", label: "もっと簡単に" },
          { value: "具体例をもう一つ足して", label: "具体例をもう1つ" },
          { value: "最後に一言でまとめて", label: "一言でまとめて" },
          { value: "", label: "追加はしない" },
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
  learnedSkills: ["比較", "評価基準の指定", "出力形式の指定"],

  outcomes: ["違いを整理できる", "自分の基準で判断材料を作れる"],
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
    /*
      **最初の1回は、基準を決めずに聞く。**

      基準まで先に埋めてしまうと、次の「基準を足して再実行」で
      何も変わらない。基準を決めると答えが変わることを、その差で
      見せる回なので、ここは空のまま通す（compare アクションの
      `criteria` を任意にしてある）。

      以前はここに「費用と時間と使いやすさ」と文で入れていた。
      それだと、あとの必須の質問に**選択肢に無い値**が先に入り、
      札はどれも選ばれていないのに空ではないので次へ進めてしまう。
      基準を自分で決めないまま比較へ行けた——このレッスンで
      いちばん大事なところが飛ばせる状態だった。
    */
    quickDefaults: { as_table: "文章でよい" },
    working: "基準ごとに並べています。",
    /*
      共通の選択肢（もっと短く・もっと丁寧に…）は**文章を直す**
      言い回しで、選択肢の比較には当たらない。この回で足すのは
      「何を基準に比べるか」なので、そちらに差し替える。
    */
    conditionOptions: [
      { value: "価格・使いやすさ・機能で比較して", label: "価格・使いやすさ・機能で" },
      { value: "費用と手間で比較して", label: "費用と手間で" },
      { value: "続けやすさで比較して", label: "続けやすさで" },
      { value: "表にまとめて", label: "表にまとめる" },
      { value: "", label: "自分で基準を追加", free: true },
    ],
    observationOptions: [
      { value: "基準ごとに整理された", label: "基準ごとに整理" },
      { value: "違いが分かった", label: "違いが分かった" },
      { value: "確認が必要な点が出た", label: "要確認の点が出た" },
      { value: "決め手が見えた", label: "決め手が見えた" },
      { value: "よく分からない", label: "よく分からない" },
    ],
    /*
      骨格が続けて出す解説は**1枚だけ**にしてある。

      覚える技は3つ（比較・評価基準の指定・出力形式の指定）で、
      残り2つはそれを実際に使う場面の直前へ移した（下の realTaskSteps）。
      **技は、使う直前に出す。**

      外した2枚
      ----------
      「AIは決めてくれない」… `factCheck` を立ててあるので、結果を見る
      画面が毎回そのことを出す。解説でも言うと1レッスンに5枚並ぶ。
      「数字は必ず確認」… reviewPoints の1行目がそのまま同じことを言う。
    */
    conceptCards: [
      {
        title: "比較",
        body: "頭の中で比べず、同じ観点で並べると違いが見えます。",
        visual: "three_points",
        points: ["候補を並べる", "同じ観点で見る", "違いが見える"],
        reviewExample: {
          body: "並べ方が同じだと、どこが違うのかを目で追えます。",
          points: ["A・B・C", "価格／機能／簡単さ", "表で見る"],
        },
      },
    ],
    reviewPoints: [
      "価格・仕様・最新情報は確認が必要",
      "自分の基準が反映されているか",
      "決め手が自分の優先順位と合っているか",
    ],
    realTaskLabel: "いま迷っていることを、ひとつ入れてみましょう。",
    realTaskPlaceholder: "例）今の方法を続ける / 新しい方法に変える",
    /*
      自分の選択肢を入れたあとの並び。

          【評価基準の指定】→ 基準を選ぶ
          → 【出力形式の指定】→ 形を選ぶ → 送る

      解説を2枚続けて出さない。**あいだに必ず手を動かす画面が入る。**
      技を出す位置も、使う場面のすぐ手前にしてある。
    */
    realTaskSteps: [
      {
        id: "concept_criteria",
        type: "concept_card",
        phase: "own",
        title: "評価基準の指定",
        poMessage: "何を重視するかで、おすすめは変わります。",
        poEmotion: "neutral",
        // 解説は必ず飛ばせる。読みたくない人を足止めしない
        skippable: true,
        card: {
          title: "評価基準の指定",
          body: "「価格で」「機能で」と伝えると、おすすめそのものが入れ替わります。",
          visual: "three_points",
          points: ["価格重視ならA", "機能重視ならC", "基準が変われば答えも変わる"],
          reviewExample: {
            body: "決めるのは自分です。AIは基準どおりに並べる係です。",
            points: ["基準を決める", "AIが並べる", "自分が選ぶ"],
          },
        },
      },
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
        id: "concept_output_format",
        type: "concept_card",
        phase: "own",
        title: "出力形式の指定",
        poMessage: "答え方も指定できます。",
        poEmotion: "hint",
        skippable: true,
        card: {
          title: "出力形式の指定",
          body: "何を答えるかだけでなく、どう答えるかも指定できます。",
          visual: "three_points",
          points: ["3行で", "箇条書きで", "表で"],
          reviewExample: {
            body: "比べた結果は、表にすると違いを目で追えます。",
            points: ["表で並べる", "行が基準", "列が選択肢"],
          },
        },
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
