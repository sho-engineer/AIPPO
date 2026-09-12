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

import { DAY1_STEPS } from "./day1Steps";
import { buildLessonFlow } from "./shared";
import type { Course, CourseStage, Lesson } from "./types";

// ---------------------------------------------------------------- Lesson 0

/**
 * AI活用診断。
 *
 * AI API を使わない。ルールで決める（要件 §9）。ここで AI を呼ぶと
 * 初回起動が遅くなるうえ費用もかかり、しかも**判定の理由を後から
 * 説明できない**——結果画面では「どの回答からそう判断したか」を
 * 返すので、決め方は読める形で持っている必要がある。
 *
 * 3問から5問へ
 * ------------
 * 前は3問とも自己申告だった（仕事の種類・使ったことがあるか・面倒な
 * こと）。**自分でどう思っているか**しか集まらないので、
 *
 *   ・できると答えた人が本当にできるのか
 *   ・できないと答えた人が何でつまずくのか
 *
 * のどちらも分からない。おすすめも「面倒なこと」の言葉合わせで
 * 決まっていて、実際の力とは関係が無かった。
 *
 * いまは5問。**うしろの2問は手を動かす**。
 *
 *     Q1 自己申告   AIがどれくらい日常に入っているか
 *     Q2 自己申告   お願いのしかた
 *     Q3 ミニ問題   1つのお願いを3つの枠で組み立てる
 *     Q4 ミニ問題   3つの状況に、合う使い方を当てる
 *     Q5 希望       やりたいこと（複数選べる）
 *
 * 問題を増やさない
 * ----------------
 * 5問のままで4つの軸（AIに頼む / 条件を加える / 目的に合わせる /
 * 仕事で組み立てる）を出す。**1つの回答を複数の観点から読む**ので、
 * 軸ごとに質問を足す必要はない。増やすと1〜2分で終わらなくなる。
 *
 * テストにしない
 * --------------
 * ミニ問題でも、その場で正解・不正解を出さない。出した瞬間に診断は
 * テストになり、「間違えた」で終わる人が出る。合っているかどうかは
 * 最後の結果でまとめて返す。
 *
 * 1つだけの正解にしない
 * ---------------------
 * Q3 の「誰向け？」は、初めて読む社員向けも新入社員向けも高く採る。
 * 言い方も文脈しだいで複数が成り立つ。模範解答を当てる遊びにすると、
 * 測っているのは「出題者の意図を読む力」になる。
 * 配点は `course/diagnosisScore.ts` が持つ。
 */
const LESSON_0: Lesson = {
  id: "diagnosis",
  number: 0,
  title: "AI活用診断",
  goal: "いまの現在地と、次に覚えるAI技を知る",
  outcomes: ["いま何ができていて、次に何を覚えればよいかが分かる"],
  tags: [],
  usesAi: false,
  steps: [
    {
      id: "intro",
      type: "intro",
      /*
        絵をやめた。**UIだけで組む。**

        前はここに全体図を1枚置いていた（`diagnosis_overview.webp`）。
        1枚で伝わるなら読む前に見せたほうが早い、という置き方だったが、
        実物は違った。

          ・絵の中に「AI活用診断」が大きく焼き込まれていて、上の帯と
            **同じ言葉が1画面に2回**出ていた
          ・「診断でわかること」「こんなときに」「診断後にわかること」まで
            詰まった1枚で、**広告のバナー**に見えた

        いまは見出し・説明・3つのメタ・5段階のプレビューだけ
        （`diagnosis/DiagnosisIntro.tsx`）。絵と違って中の1つずつが
        本物の文字なので、読み上げにも届く。

        見出しから「5つの質問で」を外した。数はメタが言っているので、
        ここは**何が分かるのか**に使う。
      */
      title: "今のAIの使い方をチェック",
      instruction: "5つの質問から、今の得意なことと、次に伸ばす力が分かります。",
      /*
        ポーは所要時間を言わない。「1〜2分で終わるよ！」はメタ
        （約1分）と同じことを言っていて、しかもメタのほうが正確。
        ここは**答え方の不安**に答える——正解を探さなくてよいこと。
      */
      poMessage: "いつもの使い方に近いものを選んでね",
      poEmotion: "question",
      primaryLabel: "診断をはじめる",
    },

    /* ── Q1 ── どれくらい日常に入っているか。回数ではなく入り込み方 ── */
    {
      id: "ai_usage",
      type: "single_choice",
      primaryLabel: "次へ",
      title: "AIをどれくらい使っていますか？",
      /*
        5問とも同じ補足にする。**問いごとに言い方を変えない。**

        前はここが「いまの正直なところで大丈夫です。」、次が
        「いちばん近いものをひとつ。」だった。言っていることは同じ
        （1つ選ぶ・正解は無い）なのに文が違うので、**毎問読み直す**
        ことになる。同じ文が並べば、2問目からは目が滑って質問だけが
        残る——それがここで欲しい読まれ方。

        枠を埋める2問（Q3・Q4）だけは別の文にしてある。あちらは
        「1つ選ぶ」では説明にならない（3つの枠を埋める）。
      */
      instruction: "普段の自分に一番近いものを1つ選んでください。",
      /*
        「週に何回か」は聞かない。回数が同じでも、**仕事の流れに
        入っているかどうか**で next の一歩が変わる。
      */
      poMessage: "いまの正直なところで大丈夫です。",
      poEmotion: "question",
      key: "ai_usage",
      required: true,
      options: [
        { value: "never", label: "まだ使ったことがない" },
        { value: "tried", label: "試したことはある" },
        { value: "sometimes", label: "困ったときに使う" },
        { value: "work", label: "仕事でよく使う" },
        { value: "daily", label: "ほぼ毎日、いろいろな用途で使う" },
      ],
    },

    /* ── Q2 ── 頼み方。「自信がありますか」とは聞かない ── */
    {
      id: "ask_style",
      type: "single_choice",
      primaryLabel: "次へ",
      title: "AIにお願いするとき、どれに近い？",
      /* Q1 と同じ文。理由は Q1 の側に書いた */
      instruction: "普段の自分に一番近いものを1つ選んでください。",
      /*
        主観を聞かない。「自信がありますか」だと、同じ力の人でも
        性格で答えが割れる。**どうやって頼んでいるか**という行動を聞く。
      */
      poMessage: "いちばん近いものをひとつ。",
      poEmotion: "question",
      key: "ask_style",
      required: true,
      options: [
        { value: "lost", label: "何を書けばいいか迷う" },
        { value: "short", label: "とりあえず短くお願いする" },
        { value: "condition", label: "条件を足して頼むことがある" },
        { value: "adapt", label: "相手や目的に合わせて頼み方を変える" },
        { value: "design", label: "仕事の流れに合わせて、頼み方を組み立てる" },
      ],
    },

    /* ── Q3 ── ミニ問題1。Day1 の3つ（プロンプト / ターゲット / トーン） ── */
    {
      id: "build_prompt",
      type: "assemble",
      primaryLabel: "次へ",
      title: "この場面なら、どう頼む？",
      instruction:
        "新しく始まる社内制度について、初めて読む社員にも伝わるように説明したい。",
      poMessage: "3つ選んで、お願いを組み立ててみましょう。",
      poEmotion: "question",
      key: "build_prompt",
      required: true,
      parts: [
        {
          key: "what",
          label: "何をしてほしい？",
          options: [
            { value: "explain", label: "分かりやすく説明して" },
            { value: "summarize", label: "要約して" },
            { value: "ideas", label: "アイデアを増やして" },
          ],
        },
        {
          key: "who",
          label: "誰向け？",
          options: [
            { value: "first_time", label: "初めて読む社員向け" },
            { value: "newcomer", label: "新入社員向け" },
            { value: "expert", label: "専門家向け" },
          ],
        },
        {
          key: "how",
          label: "どんな言い方？",
          options: [
            { value: "kind", label: "やさしく" },
            { value: "polite", label: "丁寧に" },
            { value: "kind_polite", label: "やさしく丁寧に" },
            { value: "technical", label: "専門的に" },
            { value: "casual", label: "かなりカジュアルに" },
          ],
        },
      ],
    },

    /* ── Q4 ── ミニ問題2。目的に応じて使い方を選べるか ── */
    {
      id: "match_purpose",
      type: "assemble",
      primaryLabel: "次へ",
      title: "こんなとき、AIに何を頼む？",
      instruction: "3つの場面に、合いそうな使い方をひとつずつ。",
      poMessage: "迷ったら、近いと思うほうで大丈夫です。",
      poEmotion: "question",
      key: "match_purpose",
      required: true,
      /*
        枠は3つまで。4つ並べると、スマホでは送らないと最後が見えない。
        選択肢は3つの枠で共通にしてある——場面ごとに別の一覧を出すと、
        「その場面用の答え」が1つしか無いように見える。
      */
      parts: [
        {
          key: "messy",
          label: "会議メモがバラバラで読み返しにくい",
          options: [
            { value: "organize", label: "情報を整理する" },
            { value: "compare", label: "選択肢を比較する" },
            { value: "ideas", label: "アイデアを広げる" },
          ],
        },
        {
          key: "choosing",
          label: "2つの案で迷っている",
          options: [
            { value: "organize", label: "情報を整理する" },
            { value: "compare", label: "選択肢を比較する" },
            { value: "ideas", label: "アイデアを広げる" },
          ],
        },
        {
          key: "stuck",
          label: "新しい企画案が思いつかない",
          options: [
            { value: "organize", label: "情報を整理する" },
            { value: "compare", label: "選択肢を比較する" },
            { value: "ideas", label: "アイデアを広げる" },
          ],
        },
      ],
    },

    /* ── Q5 ── やりたいこと。職種も業界も使っているAIも聞かない ── */
    {
      id: "want_to_do",
      type: "multi_choice",
      /*
        最後の1問だけ、押した先を書く。

        「この内容で進む」は**どこへ進むのか**を言っていない。5問目を
        答え終えた人がいちばん知りたいのはそこなので、行き先を書く。
        1〜4問目が「次へ」でそろっているぶん、ここだけ違う言葉だと
        「終わりが来た」ことが文字を読まなくても分かる。
      */
      primaryLabel: "診断結果を見る",
      title: "AIで何をできるようになりたい？",
      instruction: "いくつでも選べます。",
      poMessage: "ここは希望なので、気になるものを。",
      poEmotion: "question",
      key: "want_to_do",
      required: true,
      /*
        職種・業界・使っているAIサービスは**初回では聞かない**。
        答えても次の一歩は変わらないのに、答える手間だけが増える。

        ひとことの補足を添える（`note`）。「調べもの」「整理」だけでは、
        何をしてくれるのかが分からないまま選ぶことになる。札7つが
        画面の上のほうに小さく固まって、下が丸ごと空いてもいた。
      */
      options: [
        { value: "writing", label: "文章", note: "メールや企画書" },
        { value: "summarizing", label: "要約", note: "長い文章を短く" },
        { value: "researching", label: "調べもの", note: "集めて整理する" },
        { value: "ideas", label: "アイデア", note: "発想のヒント" },
        { value: "comparing", label: "比較", note: "見くらべる" },
        { value: "organizing", label: "整理", note: "情報や予定" },
        { value: "images", label: "画像", note: "つくる・直す" },
      ],
    },

    {
      id: "result",
      type: "completion",
      title: "いまの場所が見えました",
      poMessage: "いまはここ！",
      poEmotion: "hint",
      skill: "自分の現在地が分かる",
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
 *//**
 * Day1「文章を分かりやすくする」。
 *
 * ここだけ骨格（`buildLessonFlow`）を使わない
 * -------------------------------------------
 * Day2〜Day5 は同じ骨格から組み立てている。Day1 も前はそうだった
 * ——完成イメージ → お試し → 比べる → 深める → 自分で試す。
 *
 * それをやめたのは、**この回で身に付けてほしいことが、骨格の順番と
 * 合わなくなった**から。骨格は「できあがりを見せて、まねして、深める」
 * 形をしていて、Day1 のねらい（自分で条件を組み立てると結果が変わる）は
 * その中では脇に置かれる。実際に出ていた画面は、
 *
 *     完成例を見る → 選ぶ → 待つ → 長文を読む → 感想を選ぶ
 *     → 長文を読む → 待つ → 長文を読む → …
 *
 * で、押している回数は多いのに**自分が何かを決めた場面が無い**。
 * 「完成済みのデモを見ている」と言われたのがここ。
 *
 * 骨格を直すと Day2〜5 まで動くので、この1本だけ手書きにした
 * （Lesson 0 の診断と同じ扱い）。骨格側は触っていない。
 *
 * 4つの段
 * -------
 *     ① まずはAIに頼んでみる  … 条件なしで1回。プロンプトに名前が付く
 *     ② 誰に伝えるか決める    … 読む人を足す。指示が2行になる
 *     ③ 伝え方を決める        … 言い方を足す。指示が3行になる
 *     ④ 自分の仕事で使う      … 自分の文章に、組み上げた3行を当てる
 *
 * どの段も**操作が先、説明はあと**。読ませてから選ばせると、選ぶのは
 * 読んだことの確認になる。選んでから結果を見せると、結果は自分が
 * 起こしたことになる。
 *
 * 完成例を先に見せない
 * --------------------
 * 前は最初の画面が「今日つくるもの」で、Before / After がそろって
 * 出ていた。**答えを見てから始める形**なので、1回目の結果に驚きが無い。
 * いま最初に出るのは、元の文章の頭 3行だけ。
 *
 * 全文より、何がどう変わったか
 * ----------------------------
 * どの結果画面でも、まず出すのは**代表的な変化**（言いかえの
 * 対応）。全文は「全文を見る」の一枚へ回す。202字の専門文と、
 * その書き直しを毎回読み比べさせると、変化はその中に埋もれる。
 *
 * 技は最後にまとめて
 * ------------------
 * 途中で3回出していた「AI技GET」をやめた。使った直後に名前が付くのは
 * よいが、**受け取る演出が3回**あると、そのたびに学習が止まる。
 * 名前は使った場所で短く言い、受け取るのは自分の文章を仕上げたあと
 * に1度だけ（3/3）。
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
  */
  estimatedMinutes: 3,
  beforeExample:
    "Transformer型言語モデルにおける自己注意機構では、各トークンから生成されたQueryとKeyの内積をスケーリングし、Softmax関数によって正規化したAttention WeightをValueに適用することで、系列内のトークン間依存関係を動的に表現する。さらに、多層化されたMulti-Head Attentionにより異なる表現部分空間における依存関係を並列的に学習することが可能となる。",
  /*
    後の例は**短くしていない**。分かりやすさのために言葉を足している
    ところを、そのまま見せる。

    いまの2文は、Before の3つの山にそのまま対応させてある。

        自己注意機構           → 言葉どうしがどう関係しているかを見て
        Attention Weight       → どの言葉を重視するかを決めます
        Multi-Head Attention   → 複数の見方を使って、同時に捉えます

    やさしくするために**意味を落とさない**——Day1 のねらいは
    「意味を変えずに分かりやすくする」で、短くする回ではない。

    **この2文は、もう最初の画面には出さない。** 完成例を先に見せると
    1回目の結果に驚きが無くなるので、開始前には出さない。ここに残して
    あるのは、コース一覧の「できあがり」や `lessonPlan.ts` の図など、
    レッスンの外で使うところがあるため。
  */
  afterExample:
    "AIは、文章の中で言葉どうしがどう関係しているかを見て、どの言葉を重視するかを決めます。\nさらに、複数の見方を使って、言葉どうしの関係を同時に捉えます。",
  /*
    本編で受け取る技の名前と、同じ言葉にする。

    始める前に見た名前と、取ったときの名前が違うと、同じものだと
    気づけない。
  */
  learnedSkills: ["プロンプト", "読者設定", "トーン設定"],

  outcomes: [
    "AIにしてほしいことを伝えられる",
    "読む人に合わせて言葉を変えられる",
    "伝え方の雰囲気を指定できる",
  ],
  tags: ["writing"],
  usesAi: true,
  mode: "standard",
  steps: DAY1_STEPS,
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
          { value: "", label: "自分で指定する", free: true },
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
          { value: "", label: "自分で指定する", free: true },
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
          { value: "", label: "自分で指定する", free: true },
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
          { value: "", label: "自分で指定する", free: true },
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
          { value: "", label: "自分で指定する", free: true },
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
          { value: "", label: "自分で指定する", free: true },
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
          { value: "", label: "自分で指定する", free: true },
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
