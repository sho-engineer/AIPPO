/**
 * Day2「長い文章を短くまとめる」の、画面の並び。
 *
 * なぜ骨格を使わないか
 * --------------------
 * Day3〜Day5 は骨格（`shared.ts` の `buildLessonFlow`）から組み立てて
 * いて、教材データ側には材料だけが並ぶ。Day2 は骨格をやめて手書きに
 * した。骨格の並びは
 *
 *     完成イメージ → 1回送る → 観察 → 解説 → 条件を1つ足す → 比べる
 *     → 自分の課題
 *
 * で、**条件を足すのが1回しかない**。Day2 で渡したい技は3つ（要約・
 * 出力形式の指定・コンテキスト）で、そのうち2つは「条件を足したら
 * 何が変わったか」を見て初めて意味が分かる。1回では2つぶんの変化を
 * 見せられない。
 *
 * Day1 と同じく、4つの段に分けて**段ごとに1つ足す**。
 *
 * 並びの決まり（Day1 と同じ）
 * ---------------------------
 * **操作が先、説明はあと。** どの段も、足す → 結果 → 名前を付ける、の順。
 * 読ませてから足させると、足すのは読んだことの確認になる。
 *
 * AIを呼ぶのは4回
 * ---------------
 *     ① 条件なし        … まず1回。ここが比べる基準になる
 *     ② ＋出力形式      … 3つの箇条書きで
 *     ③ ＋読む人と目的  … 判断する上司向けに
 *     ④ 自分の文章に3つ … 組み上げたものを、自分の題材へ
 *
 * ②③は**前の結果と比べる**（`compareWithPrevious`）。Day1 は毎回
 * 元の文章と比べていたが、要約では元が 300字・結果が 3行なので、
 * 対応する文が取れない。ここで見せたいのは「まとめ方が変わったこと」
 * なので、前のまとめと今のまとめを突き合わせる。
 *
 * 待ち時間は増やさない
 * --------------------
 * 偽の待機は入れない。送っているあいだに出すのは、**そのとき何を
 * 足したか**だけ（`meta.waiting`）。
 */

import type { LessonStep } from "./types";

/**
 * Day2 の題材。**Lesson用に作った架空の調査資料。**
 *
 * 実在の調査と読み違えられないよう、画面では必ず
 * 「Lesson用サンプル」の名札を付けて出す（`meta.sourceLabel`）。
 *
 * 要約の題材として選んだ理由は、**残す情報の取捨が起きること**。
 * 数字（68％・54％・62％・20名・1か月）と、懸念と、次の行動が
 * 混ざっているので、「誰が何のために読むか」で残るものが変わる。
 */
export const DAY2_SOURCE =
  "社内の情報共有方法を見直すため、営業・企画・管理部門の社員120名を対象にアンケートを実施しました。回答者の68％が「必要な情報を探すのに時間がかかる」と答え、特に過去の会議内容や決定事項を見つけにくいという意見が多く見られました。また、54％が同じ内容を複数のツールへ入力した経験があると回答しています。一方、新しい情報共有ツールの導入については、62％が前向きでしたが、操作を覚える負担やデータ移行への不安も挙げられました。試験導入を希望した営業部では、問い合わせ対応に必要な情報を探す時間を短縮できる可能性があります。まず営業部の20名を対象に1か月間試験導入し、検索時間と利用率を確認したうえで、全社展開を判断する案が出ています。";

/**
 * 自分の文章が無い人のための、もう1本。**こちらも架空。**
 *
 * 最後の段を「自分の文章がある人だけの回」にしない。手元に長い文章が
 * 無い日でも、同じ型を1回通せるようにしておく。
 */
export const DAY2_FALLBACK =
  "新しい社内研修について48名へアンケートを実施しました。31名が短時間のオンライン研修を希望し、集合研修を希望した人は9名でした。自由記述では、業務時間内に受講できること、実際の仕事で使う例が含まれること、後から復習できることへの要望が多く見られました。来月、営業部と管理部から各10名を募り、30分のオンライン研修を試験実施する案が出ています。参加率と研修後アンケートを確認してから、全社導入を判断する予定です。";

/** 名札。架空の資料であることを、題材を出すどの画面でも言う。 */
const SAMPLE_BADGE = "調査資料（Lesson用サンプル）";

/** 指示の1行目。4回とも同じ。 */
const PURPOSE = "長い文章を短くまとめる";

/**
 * AIへの頼み方。4回とも同じ `summarize` で、**渡す条件だけが増えていく**。
 *
 * 1回目は `format` も `purpose` も空。`_compose`（backend）が空の行を
 * 落とすので、「指定なし」という言葉が依頼文に混ざることはない。
 */
const SUMMARIZE = {
  action: "summarize",
  inputs: {
    source_text: "original_text",
    format: "format",
    purpose: "purpose",
  },
} as const;

/** 自分の文章を送る回。本文の置き場も、条件の置き場も別にする。 */
const SUMMARIZE_OWN = {
  action: "summarize",
  inputs: {
    real_task_text: "original_text",
    own_audience: "audience",
    own_purpose: "purpose",
    own_format: "format",
  },
} as const;

/** 段ごとに積み上がる指示の行（`meta.showInstruction`）。 */
const INSTRUCTION_LINES = [
  {
    key: "format",
    label: "形式",
    hint: "欲しい形を決める",
    suffix: "まとめてください",
  },
  {
    key: "purpose",
    label: "読む人と目的",
    hint: "誰が何のために読むかを決める",
    suffix: "まとめてください",
  },
];

export const DAY2_STEPS: LessonStep[] = [
  {
    /*
      今日つくるもの。**Day1 には無い画面。**

      Day1 は章扉から始まる——あちらの題材は自分の書いた文章で、
      何を持ち帰るかは1回送れば分かる。Day2 は長い調査資料が題材で、
      「これが3行になる」を先に1枚で見せないと、押す前に何が起きるか
      が読めない（`teachingImages.ts` の `day2_overview`）。
    */
    id: "outcome_preview",
    type: "outcome_preview",
    phase: "try",
    title: "長い文章を短くまとめる",
    instruction: "長い調査資料から、必要な情報だけを取り出してみよう。",
    poMessage: "短くするだけじゃなく、使える形にしていくよ",
    poEmotion: "celebrate",
    primaryLabel: "はじめる",
  },

  /* ══════════════ SECTION 1 ══════════════ まず短くしてみよう */
  {
    id: "section_1",
    type: "section_transition",
    phase: "try",
    title: "まず短くしてみよう",
    poMessage: "長い文章を、まず一度短くしてみよう！",
    poEmotion: "celebrate",
    meta: {
      sectionNumber: 1,
      sectionLabel: "短くする",
    },
  },
  {
    /*
      調査資料を見る画面。**ここでは何も選ばせない。**

      押すことは1つ——短くまとめてもらう。1回目から条件を足すと、
      そのあと「3つの箇条書きで」を加えても、変わったのがどちらの
      せいなのか分からない。

      長い資料は**カードの中で送らせない**。頭3行だけを出して、
      全文は「全文を見る」の全画面の一枚へ（`MoreSheet` の `FullText`）。
    */
    id: "read_source",
    type: "quick_try",
    phase: "try",
    title: "社内の情報共有に関する調査",
    instruction:
      "この調査資料を、そのままAIに渡してみます。長いので、頭の数行だけ出しています。",
    poMessage: "まずは、そのまま短くしてもらおう！",
    poEmotion: "neutral",
    primaryLabel: "短くまとめる",
    aiAction: SUMMARIZE,
    meta: {
      sampleText: DAY2_SOURCE,
      sourcePreview: true,
      sourceLabel: SAMPLE_BADGE,
    },
  },
  {
    id: "generate_basic",
    type: "ai_generate",
    phase: "try",
    title: "短くまとめています",
    poMessage: "いま読んでいるところ！",
    poEmotion: "thinking",
    aiAction: SUMMARIZE,
    meta: { waiting: "長い文章から、残すところを選んでいます…" },
  },
  {
    /*
      1回目の結果。**比べない。ここが比べる基準になる。**

      出すのは返ってきたまとめだけ（`resultOnly`）。まだ何も足して
      いないので、「何を変えた？」に書けることが無い——空の枠を
      置くくらいなら、結果そのものを読ませる。
    */
    id: "see_basic",
    type: "result_compare",
    phase: "try",
    title: "大事な内容が短くなった",
    instruction:
      "長い文章から、重要な内容を残して短くするのが「要約」です。",
    poMessage: "どこが残ったか、見てみよう！",
    poEmotion: "celebrate",
    primaryLabel: "要約を覚える",
    meta: { resultOnly: true },
  },
  {
    /*
      たったいま起きたことに、名前を付ける。

      **受け取る演出は出さない。** 3つの技をそれぞれの場所で祝うと、
      そのたびに学習が止まる。ここは名前を言うだけで、受け取るのは
      自分の文章を仕上げたあとに1度（`skills_recap`）。
    */
    id: "concept_summary",
    type: "concept_card",
    phase: "try",
    title: "要約",
    poMessage: "いまやったのが、これ。",
    poEmotion: "neutral",
    /* 押す前に、次にやることを名乗る（Day1 と同じ決まり） */
    primaryLabel: "読みやすい形に変える",
    skippable: true,
    card: {
      title: "要約",
      body: "長い文章から、重要な内容を残して短くする方法です。",
      visual: "three_points",
      points: ["課題", "懸念", "次の行動"],
      reviewExample: {
        body: "全部を削るのではなく、あとで使うものを残します。",
        points: ["数字", "決まったこと", "次にやること"],
      },
    },
    meta: { silentSkill: "要約" },
  },

  /* ══════════════ SECTION 2 ══════════════ 読みやすい形に変えよう */
  {
    id: "section_2",
    type: "section_transition",
    phase: "compare",
    title: "読みやすい形に変えよう",
    poMessage: "こんどは、欲しい形まで伝えよう！",
    poEmotion: "celebrate",
    meta: {
      sectionNumber: 2,
      sectionLabel: "形を決める",
    },
  },
  {
    /*
      足す条件は1つだけ置く。**選ばせるためではなく、自分で足すため。**

      ここで形を何通りも並べると、返ってくるものが人ごとに変わり、
      次の画面の「3つの要点になった」が当たらなくなる。段の狙いは
      「形まで言うと、そのまま使える」を1回で体験することなので、
      足すもの自体は決め打ちにして、**足す動作は本人にさせる**。

      形を自分で選ぶのは、最後の段（`own_format`）。
    */
    id: "add_format",
    type: "single_choice",
    phase: "compare",
    title: "どんな形で欲しい？",
    instruction: "いまの指示に、1つ足してみましょう。",
    poMessage: "形まで言うと、そのまま使えます。",
    poEmotion: "question",
    primaryLabel: "この条件でまとめる",
    key: "format",
    required: true,
    options: [
      {
        value: "3つの箇条書きで",
        label: "3つの箇条書きで",
        note: "要点が3つに分かれて、ひと目で確かめられます。",
      },
    ],
    meta: {
      showInstruction: true,
      purpose: PURPOSE,
      instructionLines: INSTRUCTION_LINES,
    },
  },
  {
    id: "generate_format",
    type: "ai_generate",
    phase: "compare",
    title: "まとめ直しています",
    poMessage: "3つに分けているところ！",
    poEmotion: "thinking",
    aiAction: SUMMARIZE,
    meta: { waiting: "指定された形に合わせて、まとめ直しています…" },
  },
  {
    id: "see_format",
    type: "result_compare",
    phase: "compare",
    title: "3つの要点になった",
    poMessage: "同じ内容でも、確かめやすさが変わりました。",
    poEmotion: "celebrate",
    primaryLabel: "この変化を覚える",
    meta: {
      changesOnly: true,
      /* 前のまとめと突き合わせる。元の資料と比べても対が取れない */
      compareWithPrevious: true,
      changedLabel: "形式",
      changedKey: "format",
      changedNote: "要点を素早く確認できる形になった",
    },
  },
  {
    id: "concept_format",
    type: "concept_card",
    phase: "compare",
    title: "出力形式の指定",
    poMessage: "欲しい形を、先に伝えました。",
    poEmotion: "neutral",
    primaryLabel: "読む目的を伝える",
    skippable: true,
    card: {
      title: "出力形式の指定",
      body: "箇条書きなど、AIから返してほしい形を指定する方法です。",
      visual: "three_points",
      points: ["3行で", "箇条書きで", "表で"],
      reviewExample: {
        body: "そのまま貼って使える形を言うと、直す手間が減ります。",
        points: ["重要な点を3つ", "次にやることだけ", "見出しを付けて"],
      },
    },
    meta: { silentSkill: "出力形式の指定" },
  },

  /* ══════════════ SECTION 3 ══════════════ 読む目的を伝えよう */
  {
    id: "section_3",
    type: "section_transition",
    phase: "deepen",
    title: "読む目的を伝えよう",
    poMessage: "誰が何のために読むかを、足してみよう！",
    poEmotion: "celebrate",
    meta: {
      sectionNumber: 3,
      sectionLabel: "目的を伝える",
    },
  },
  {
    id: "add_context",
    type: "single_choice",
    phase: "deepen",
    title: "誰が、何のために読む？",
    instruction: "形はそのまま。もう1つ足してみましょう。",
    poMessage: "読む人が変わると、残す情報も変わります。",
    poEmotion: "question",
    primaryLabel: "この条件でまとめる",
    key: "purpose",
    required: true,
    options: [
      {
        value: "新しいツールを試すか判断する上司向けに",
        label: "新しいツールを試すか判断する上司向けに",
        note: "判断に使う数字や、次の行動が残ります。",
      },
    ],
    meta: {
      showInstruction: true,
      purpose: PURPOSE,
      instructionLines: INSTRUCTION_LINES,
    },
  },
  {
    id: "generate_context",
    type: "ai_generate",
    phase: "deepen",
    title: "まとめ直しています",
    poMessage: "判断に要るものを選んでいるところ！",
    poEmotion: "thinking",
    aiAction: SUMMARIZE,
    meta: { waiting: "読む人と目的に合わせて、残すものを選び直しています…" },
  },
  {
    id: "see_context",
    type: "result_compare",
    phase: "deepen",
    title: "判断材料が残った",
    poMessage: "上司が決めるのに要るものが残りました。",
    poEmotion: "celebrate",
    primaryLabel: "この変化を覚える",
    meta: {
      changesOnly: true,
      compareWithPrevious: true,
      changedLabel: "読む人と目的",
      changedKey: "purpose",
      changedNote: "上司の判断に必要な情報が優先された",
    },
  },
  {
    id: "concept_context",
    type: "concept_card",
    phase: "deepen",
    title: "コンテキスト",
    poMessage: "背景を渡すと、残るものが変わります。",
    poEmotion: "neutral",
    primaryLabel: "自分の文章で試す",
    skippable: true,
    card: {
      title: "コンテキスト",
      body: "読む人や目的を伝え、AIが残す情報を調整する方法です。",
      visual: "three_points",
      points: ["目的", "相手", "場面"],
      reviewExample: {
        body: "同じ資料でも、共有用と判断用では残すところが違います。",
        points: ["誰が読む", "何を決める", "いつ使う"],
      },
    },
    meta: { silentSkill: "コンテキスト" },
  },

  /* ══════════════ SECTION 4 ══════════════ 自分の文章で試そう */
  {
    id: "section_4",
    type: "section_transition",
    phase: "own",
    title: "自分の文章で試そう",
    poMessage: "組み上げた3つを、自分の文章に！",
    poEmotion: "celebrate",
    meta: {
      sectionNumber: 4,
      sectionLabel: "自分で",
    },
  },
  {
    /*
      まとめたい文章。**自分のものが無くても、ここで止めない。**

      入れ方は3つ並ぶ（`steps/Inputs.tsx` の `TextStep`）。
      自分で入力する・貼り付ける・**例文を使う**——最後の1つが
      `meta.fallbackSample` で、押すと架空の研修アンケートが入る。

      画面を2つに分けていない
      -----------------------
      台本では「何をまとめる？」で自分の文章かサンプルかを選ばせ、
      その先を2画面に分けていた。engine には条件分岐が無く
      （`course/engine.ts` の `nextStepId` は静的な `next` だけ）、
      分岐を足すと進み具合の分母・戻る先・既存の検査へ一斉に効く。
      入れ方の帯が**同じ選択をこの1画面で持っている**ので、
      道は2つとも残したまま1画面にした。
    */
    id: "own_text",
    type: "real_task",
    phase: "own",
    title: "まとめたい文章を用意しよう",
    instruction: "長めの文章を1つ。手元に無ければ、例文を使えます。",
    poMessage: "仕事で読むのが大変だった文章でどうぞ。",
    poEmotion: "question",
    primaryLabel: "この文章でいく",
    key: "real_task_text",
    required: true,
    placeholder: "まとめたい文章を入れてください",
    hints: [
      "長い会議メモや、返信が積み重なったメールが試しやすいです。",
      "5行くらいあると、まとまり方の違いが分かります。",
      "思いつかなければ、上の「例文を使う」で進められます。",
    ],
    meta: {
      fallbackSample: DAY2_FALLBACK,
      /*
        「今回はスキップする」の行き先。**この先は文章を使う画面ばかり**
        なので、1歩進めると空の本文を AI へ送ることになる
        （`course/useCourseLesson.ts` の `skipRealTask`）。
        飛ばした人は、3つの技を受け取るところへ出る。
      */
      skipTo: "skills_recap",
    },
  },
  {
    id: "own_reader",
    type: "single_choice",
    phase: "own",
    title: "誰が読みますか？",
    poMessage: "読む人で、残す情報が変わります。",
    poEmotion: "question",
    primaryLabel: "この相手でいく",
    key: "own_audience",
    required: true,
    placeholder: "例）取引先の担当者",
    options: [
      { value: "上司", label: "上司" },
      { value: "同じチームの人", label: "同じチームの人" },
      { value: "自分", label: "自分" },
      { value: "", label: "自分で指定する", free: true },
    ],
  },
  {
    id: "own_purpose",
    type: "single_choice",
    phase: "own",
    title: "何のために読みますか？",
    poMessage: "目的が変わると、残すものが変わります。",
    poEmotion: "question",
    primaryLabel: "この目的でいく",
    key: "own_purpose",
    required: true,
    placeholder: "例）来週の打ち合わせで説明するため",
    options: [
      { value: "やるかどうか判断するため", label: "やるかどうか判断するため" },
      { value: "人に共有するため", label: "人に共有するため" },
      { value: "自分のやることを知るため", label: "自分のやることを知るため" },
      { value: "", label: "自分で指定する", free: true },
    ],
  },
  {
    id: "own_format",
    type: "single_choice",
    phase: "own",
    title: "どんな形で欲しいですか？",
    poMessage: "そのまま貼って使える形を選んでください。",
    poEmotion: "question",
    primaryLabel: "この形でいく",
    key: "own_format",
    required: true,
    placeholder: "例）見出しを付けて",
    options: [
      { value: "3つの箇条書きで", label: "3つの箇条書きで" },
      { value: "5つの箇条書きで", label: "5つの箇条書きで" },
      { value: "3行の文章で", label: "3行の文章で" },
      { value: "次にやることだけ", label: "次にやることだけ" },
      { value: "", label: "自分で指定する", free: true },
    ],
  },
  {
    /*
      送る前の確認。**ここが、この回のいちばんの山。**

      やること・読む相手・まとめる目的・出力の形・元の文章が
      そろって1枚に出る。3つの段で1行ずつ足してきたものが、
      **自分で組み立てたプロンプト**として初めて全部そろって見える。
    */
    id: "confirm_prompt",
    type: "prompt_preview",
    phase: "own",
    title: "AIへの指示",
    poMessage: "自分で組み立てた指示です。",
    poEmotion: "neutral",
    primaryLabel: "この条件でまとめる",
    aiAction: SUMMARIZE_OWN,
    meta: { purpose: PURPOSE },
  },
  {
    id: "generate_own",
    type: "ai_generate",
    phase: "own",
    title: "まとめています",
    poMessage: "3つの条件でまとめているところ！",
    poEmotion: "thinking",
    aiAction: SUMMARIZE_OWN,
    meta: { waiting: "読む人・目的・形に合わせて、まとめています…" },
  },
  {
    /*
      できあがり。**直す道を、同じ画面に置く。**

      条件を変えたくなるのはここ——出てきたものを読んだあとで
      「もっと短く」「上司ではなく自分用に」と気づく。押す先が
      「完了」しか無いと、直すには戻るボタンを4回押すことになる。
    */
    id: "own_result",
    type: "result_compare",
    phase: "own",
    title: "使える要約ができた",
    poMessage: "自分の文章でもできました！",
    poEmotion: "celebrate",
    primaryLabel: "これで完了",
    meta: {
      resultOnly: true,
      /* 指定した3つを、結果の上に並べる */
      showConditions: true,
      /* 副の行の行き先。押すと、入れた内容を残したまま条件へ戻る */
      editStep: "own_reader",
      editLabel: "条件を直す",
    },
  },
  {
    /*
      3つまとめて受け取る。**Day2 で演出を出すのはここだけ。**
    */
    id: "skills_recap",
    type: "concept_card",
    phase: "own",
    title: "3つのAI技をGET！",
    /*
      3つを渡すときの一言は、**見出しの下の1行**で言う。

      ポーはここに立たない（`course/poPresence.ts`）——祝っているのは
      画面そのもの（`day1/SkillRecap.tsx` の「3 / 3 GET」）で、その横に
      ポーを足すと祝いが二重になる。

      完了画面のポーに言わせる手もあったが、**吹き出しに入り切らない**。
      320px 幅で7行になり、見出しに重なった（実測）。長い一言は
      吹き出しではなく本文で。
    */
    instruction: "誰が何のために読むかを伝えると、使いやすい要約になります。",
    poMessage: "3つとも、もう使えます！",
    poEmotion: "celebrate",
    primaryLabel: "ひとつ確認する",
    meta: {
      recap: [
        { name: "要約", body: "重要な内容を残して短くする方法" },
        { name: "出力形式の指定", body: "返してほしい形を指定する方法" },
        { name: "コンテキスト", body: "読む人と目的を伝える方法" },
      ],
    },
  },
  {
    /*
      軽い確認。**1問だけ。**

      Day1 と同じ置き方（`day1Steps.ts` の `check`）。点数も不合格も
      出さない。聞くのは、この回で実際に足した条件そのもの。
    */
    id: "check",
    type: "single_choice",
    phase: "own",
    title: "ひとつだけ確認",
    instruction: "「3つの箇条書きで」と伝えるのは、どのAI技？",
    poMessage: "さっき足したのは、どれだったかな？",
    poEmotion: "question",
    primaryLabel: "今日の成果を見る",
    key: "check",
    required: true,
    options: [
      { value: "format", label: "出力形式の指定" },
      { value: "context", label: "コンテキスト" },
      { value: "summarize", label: "要約" },
    ],
    meta: {
      answer: ["format"],
      explanation:
        "「3つの箇条書きで」は“返ってくる形”を決めているので、出力形式の指定です。" +
        "読む人や目的を伝えるのがコンテキスト、短くまとめること自体が要約です。",
    },
  },
  {
    id: "completion",
    type: "completion",
    phase: "own",
    title: "長い文章から、必要な情報を取り出せた！",
    /* 短くする。長い一言は吹き出しからあふれて見出しに重なる（↑の回） */
    poMessage: "おつかれさま！",
    poEmotion: "celebrate",
    meta: {
      reusablePrompt:
        "以下の文章を、〇〇が〇〇のために確認できるよう、\n重要な内容を〇〇でまとめてください。",
    },
  },
];
