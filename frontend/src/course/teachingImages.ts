/**
 * 教材の絵を、どのレッスンのどのステップに出すか。
 *
 * 表を1か所に置く理由
 * -------------------
 * 絵は**教材そのもの**（1枚で説明が完結している）だが、
 * 教材データ（`apps/catalog`）には持たせていない。持たせると、
 * 絵を1枚足すたびに移行と初期データの書き換えが要る。
 * `lessonThumbnail.ts` と同じ作りにしておけば、絵を足す作業が
 * 「ファイルを置いて、ここに1行足す」で終わる。
 *
 * ここに無い組み合わせには絵を出さない。**`public/` に置いただけの
 * ファイルを画面が指す作りにしない**——消したときに気づけないまま
 * 壊れた絵が出る。
 *
 * 置き場所
 * --------
 *     public/assets/teaching/<名前>.webp
 *
 * 出すのは `components/lessons/TeachingImage.tsx` で、切り取らずに
 * 1枚まるごと入れる。
 *
 * 比は1枚ずつ違ってよい。AI技と比べる図は 3:2（1536×1024）、
 * Day1〜8 の全体図はおよそ 1:1。既定（3:2）と違う絵には、下の
 * `width`/`height` に実寸を書くこと——書かないと読み込む前だけ
 * 3:2 で場所を取り、読み終わりに下の文とボタンが飛ぶ。
 *
 * 絵の中に説明がある
 * ------------------
 * だから本文で同じことを長く繰り返さない。読み上げのための1文
 * （`alt`）だけをここに持つ。
 */

/**
 * 絵の種類。**何の絵かで出し方が変わる**ので、画面側が見分けられるようにする。
 *
 * 種類を持たないと、置き場所（lessonId + stepId）からしか判断できない。
 * それだと「コース全体の絵」のようにステップに属さないものを置けないし、
 * 「これは比べる図だから見出しを添える」といった出し分けもできない。
 *
 *   course_overview    … コース全体。何をする8日間かを1枚で
 *   diagnosis_overview … 現在地チェック。何を聞かれて何が分かるか
 *   lesson_overview    … その日の全体図。今日つくるもの
 *   skill_concept      … AI技1つの説明。**使った直後**に出す
 *   compare            … 条件を変えると結果がどう変わるか
 */
export type VisualType =
  | "course_overview"
  | "diagnosis_overview"
  | "lesson_overview"
  | "skill_concept"
  | "compare"
  /*
    章扉。**画面いっぱいに出す1枚**で、ほかの絵とは扱いが違う。

    ほかの絵は本文のあいだに挟まる図なので、幅に合わせて縮めて
    上下に文が付く。こちらは絵そのものが画面で、上に教材カードを
    重ねない。題も副題も絵の中に焼き込まれている。
  */
  | "section";

export interface TeachingImageEntry {
  src: string;
  /** 何の図か。1文で。絵の中の文字を書き写さない。 */
  alt: string;
  visualType: VisualType;
  /**
   * その絵の実寸。
   *
   * 既定（3:2 = 1536×1024）と比が違う絵にだけ書く。書かないと
   * 読み込む前だけ 3:2 で場所を取り、読み終わりに箱の高さが変わって
   * 下の文とボタンが飛ぶ（`components/lessons/TeachingImage.tsx`）。
   *
   * 絵を差し替えたら、ここも測り直すこと。
   */
  width?: number;
  height?: number;
  /**
   * その絵が「学習時間の目安」を持っているか。
   *
   * なぜ要るか
   * ----------
   * Day1〜8 の全体図には、**時間が絵の中に焼き込まれている**
   * （「約3分」「約5分」）。アプリはその絵のすぐ下に `所要時間` を
   * 出しているので、そのままだと同じ画面に別々の数字が上下に並ぶ。
   * Day1 は絵が「約3分」、アプリが「8分」だった。
   *
   * どちらが正しいかは絵を見ても分からない。**数字を2つ出すのを
   * やめる**のが先で、絵が言っているなら、アプリは黙る。
   *
   * 絵を差し替えて時間が消えたら、ここも false（または省略）に
   * 戻すこと。戻さないと、時間がどこにも出なくなる。
   */
  showsMinutes?: boolean;
}

/**
 * コース全体の絵。**ステップに属さない**ので、レッスンの表とは別に持つ。
 *
 * 出るのはコースの画面のいちばん上。「この8日で何をするのか」を、
 * 説明文を読む前に1枚で見せる。
 */
const BY_COURSE: Record<string, TeachingImageEntry> = {
  first_step_7days: {
    src: "/assets/teaching/course_overview_start.webp",
    alt: "AIスタートコースの全体図。文章を分かりやすくする・要約する・説明してもらう・アイデアを広げる・比較する・整理する・画像を作る・画像を修正する、の8つの実践と、終えたらできるようになることをまとめたもの。",
    visualType: "course_overview",
  },
};

/** そのコースの絵。無ければ null。 */
export function courseImage(courseId: string): TeachingImageEntry | null {
  return BY_COURSE[courseId] ?? null;
}

/**
 * コースの絵、全部。置き忘れの検査に使う（レッスンの分は下の
 * `ALL_TEACHING_IMAGES`）。**両方を見ないと片方だけ抜ける。**
 */
export const ALL_COURSE_IMAGES: (TeachingImageEntry & { courseId: string })[] =
  Object.entries(BY_COURSE).map(([courseId, entry]) => ({ ...entry, courseId }));

const BY_LESSON: Record<string, Record<string, TeachingImageEntry>> = {
  /*
    現在地チェック（AI活用診断）。

    ここだけ骨格を使っていない教材で、最初のステップの名前が
    `outcome_preview` ではなく `intro`。**ステップの名前で置き場所を
    決めている**ので、名前が違えば置き場所も違う。
  */
  diagnosis: {
    intro: {
      src: "/assets/teaching/diagnosis_overview.webp",
      alt: "AI活用診断の全体図。いくつかの質問に答えると、いまのAI活用の現在地と、次に学ぶおすすめのLessonが分かることを示したもの。",
      visualType: "diagnosis_overview",
    },
  },

  /*
    Day1「文章を分かりやすくする」。

    出る順は、レッスンの流れそのまま。4つの章に分かれている。

      【章扉①】試す      → 完成イメージ → お試し → 結果 → プロンプト
      【章扉②】相手      → 条件を足す → 比べる → ターゲット指定
      【章扉③】言い方    → 誰が読むか → トーン指定 → 口調を選ぶ
      【章扉④】自分で    → 自分の文章 → 送る → 結果 → ふりかえり

    章扉は**画面いっぱいの1枚**で、ほかの絵と扱いが違う（`section`）。
    解説の絵（AI技）は続けて出さない。あいだに必ず手を動かす画面が入る。
  */
  rewrite_text: {
    section_1: {
      src: "/assets/teaching/day1_section_01.webp",
      alt: "Section 1「まずは試してみよう」の章扉。ポーが、読みにくい文章の吹き出しからAIへ向かう矢印を指し示している絵。",
      visualType: "section",
      width: 941,
      height: 1672,
    },
    section_2: {
      src: "/assets/teaching/day1_section_02.webp",
      alt: "Section 2「相手を決めよう」の章扉。ポーが、上司と友だちの2枚のカードを指し示している絵。",
      visualType: "section",
      width: 941,
      height: 1672,
    },
    section_3: {
      src: "/assets/teaching/day1_section_03.webp",
      alt: "Section 3「トーンを変えよう」の章扉。ポーが、やさしく・丁寧に・短くの3つが並ぶつまみを指し示している絵。",
      visualType: "section",
      width: 941,
      height: 1672,
    },
    section_4: {
      src: "/assets/teaching/day1_section_04.webp",
      alt: "Section 4「自分で仕上げよう」の章扉。ポーが鉛筆を持ち、BeforeとAfterの2枚の紙のあいだに立っている絵。",
      visualType: "section",
      width: 941,
      height: 1672,
    },
    outcome_preview: {
      src: "/assets/teaching/day1_overview.webp",
      alt: "Day1「文章を分かりやすくする」の全体図。専門用語・技術用語・略語が多く意味をつかみにくい文章が、専門用語を減らして相手に合わせて説明した文章に変わることを並べて示し、終えたらできるようになること3つと学習時間の目安を添えたもの。",
      visualType: "lesson_overview",
      width: 1254,
      height: 1254,
      showsMinutes: true,
    },
    /*
      `concept_2` であって `concept_1` ではない。

      解説の id は**教材が持つ解説の並び順**で決まる（`concept_${n}`）。
      Day1 は1枚目が「プロンプト」になったので、ターゲット指定は
      2枚目——番号がひとつずれた。ほかの教材は1枚目のままなので、
      ここだけが違う。
    */
    concept_2: {
      src: "/assets/teaching/skill_01_targeting.webp",
      alt: "AI技「ターゲット指定」の図。同じ文章でも、新入社員向けならやさしい文章に、専門家向けなら専門的な文章になることを示したもの。",
      visualType: "skill_concept",
    },
    compare_results: {
      src: "/assets/teaching/compare_01_target.webp",
      alt: "誰に伝えるかで文章が変わることの図。ただ「分かりやすくして」と頼んだ場合と、「新入社員向けに」と足した場合を並べ、言葉の選び方と説明のやさしさが変わることを示したもの。",
      visualType: "compare",
    },
    concept_tone: {
      src: "/assets/teaching/skill_02_tone.webp",
      alt: "AI技「トーン指定」の図。同じ内容でも、丁寧・やわらかい・カジュアルで言い方が変わることを示したもの。",
      visualType: "skill_concept",
    },
    /*
      「プロンプト」には専用の絵を置かない。

      この解説は**たったいま自分が送った文**を見せるもので、
      画面には送った言葉がそのまま出る。図を足すと、自分の言葉より
      図のほうが大きくなり、「これが自分のプロンプトだ」という
      いちばん大事なつながりが薄れる。
    */
  },

  /*
    Day2「長い文章を短くまとめる」。

    出る順は、レッスンの流れそのまま。
      完成イメージ → まず要約してみる → 要約とは
      → 条件を足して再実行 → まとめ方で変わる
      → 自分の文章 → 出力形式の指定 → 形を選ぶ
      → コンテキスト → 目的を足す

    Day1 と同じ決まりで置く。比べる図は一度試して条件を足したあと、
    解説の絵は使う直前、そして解説の絵を続けて2枚出さない。
  */
  summarize_text: {
    outcome_preview: {
      src: "/assets/teaching/day2_overview.webp",
      alt: "Day2「長い文章を短くまとめる」の全体図。情報が詰まっていて読むのが大変な文章が、大事なポイントだけを残した短い箇条書きに変わることを並べて示し、終えたらできるようになること3つと学習時間の目安を添えたもの。",
      visualType: "lesson_overview",
      width: 1223,
      height: 1227,
      showsMinutes: true,
    },
    concept_1: {
      src: "/assets/teaching/skill_04_summarization.webp",
      alt: "AI技「要約」の図。長い文章から、目的・決定事項・次の行動といった要点だけを取り出すことを示したもの。全部を削るのではなく、大事な情報を残す。",
      visualType: "skill_concept",
    },
    compare_results: {
      src: "/assets/teaching/compare_03_summary_format.webp",
      alt: "まとめ方を指定すると要約が変わることの図。ただ「要約して」と頼んだ場合と、「重要なポイントを3つの箇条書きで」と足した場合を並べ、長さと出力形式が変わることを示したもの。",
      visualType: "compare",
    },
    concept_output_format: {
      src: "/assets/teaching/skill_05_output_format.webp",
      alt: "AI技「出力形式の指定」の図。同じ情報でも、3行・箇条書き・表のどれで欲しいかを指定できることを示したもの。",
      visualType: "skill_concept",
    },
    concept_context: {
      src: "/assets/teaching/skill_06_context.webp",
      alt: "AI技「コンテキスト」の図。ただ「まとめて」と頼んだ場合と、目的・相手・場面という背景を渡した場合を並べ、背景を伝えるほど目的に合った回答になることを示したもの。",
      visualType: "skill_concept",
    },
  },

  /*
    Day3「分からないことを説明してもらう」。

    出る順は、レッスンの流れそのまま。
      完成イメージ → まず質問する → ターゲット指定
      → レベルと例を足して再実行 → レベルで説明が変わる
      → 自分の分からないこと → ロール指定 → 立場を選ぶ
      → 追加質問 → 聞き返しを1つ足す

    ターゲット指定の絵は Day1 と同じ1枚を使い回す。同じ技に別の絵を
    用意すると、**同じものだと気づけない**——2つ目の技として数えられる。

    Day1・Day2 と同じ決まりで置く。比べる図は一度試して条件を足した
    あと、解説の絵は使う直前、そして解説の絵を続けて2枚出さない。
  */
  explain_topic: {
    outcome_preview: {
      src: "/assets/teaching/day3_overview.webp",
      alt: "Day3「分からないことを説明してもらう」の全体図。「初心者にも分かるように教えて」と尋ねると、たとえを使ったやさしい説明が返ってくることを示し、用語を知りたいとき・調べ物を進めたいとき・ニュースを理解したいときという使いどころと、終えたらできるようになること3つ、学習時間の目安を添えたもの。",
      visualType: "lesson_overview",
      width: 1228,
      height: 1228,
      showsMinutes: true,
    },
    concept_1: {
      src: "/assets/teaching/skill_01_targeting.webp",
      alt: "AI技「ターゲット指定」の図。同じ文章でも、新入社員向けならやさしい文章に、専門家向けなら専門的な文章になることを示したもの。",
      visualType: "skill_concept",
    },
    compare_results: {
      src: "/assets/teaching/compare_05_explanation_level.webp",
      alt: "自分のレベルを伝えると説明が変わることの図。ただ「APIについて説明して」と頼んだ場合と、「IT初心者向けに、身近な例を使って」と足した場合を並べ、言葉の難しさと例の有無が変わることを示したもの。",
      visualType: "compare",
    },
    concept_role: {
      src: "/assets/teaching/skill_07_role.webp",
      alt: "AI技「ロール指定」の図。「あなたは先生です」と伝えると初心者向けの説明に、「あなたはIT担当者です」と伝えると実務的な説明になることを示したもの。",
      visualType: "skill_concept",
    },
    concept_followup: {
      src: "/assets/teaching/skill_08_followup_question.webp",
      alt: "AI技「追加質問」の図。AIの答えに「もっと簡単に」「具体例を出して」と聞き返しながら、分かるまで深掘りしていく流れを示したもの。",
      visualType: "skill_concept",
    },
  },

  /*
    Day4「アイデアを広げる」。

    出る順は、レッスンの流れそのまま。
      完成イメージ → まず案を出してもらう → 発散
      → 数と方向性を足して再実行 → 案の広がりを見比べる
      → 自分のテーマ → ロール指定 → 立場を選ぶ
      → 追加質問 → 聞き返しを足す → 反復 → 送る

    このレッスンだけ絵が6枚ある。うち3枚は前の日と同じ1枚を使い回す
    ——**同じ技には同じ絵**。別の絵を用意すると、同じものだと
    気づけないまま4つ目・5つ目の技として数えられる。

    Day1〜3 と同じ決まりで置く。比べる図は一度試して条件を足した
    あと、解説の絵は使う直前、そして解説の絵を続けて2枚出さない。

    この教材の本文はサーバーだけが持っている（apps/catalog/
    release_seeding.py）。並びを見張るのは backend/tests/
    test_day4_brainstorm.py のほう——画面側の教材データに
    brainstorm_ideas は無いので、ここの検査からは順を確かめられない。
  */
  brainstorm_ideas: {
    outcome_preview: {
      src: "/assets/teaching/day4_overview.webp",
      alt: "Day4「アイデアを広げる」の全体図。ひとつのテーマから四方へ案が広がっていくようすと、新しいサービス・イベントの企画・商品の改善案といったアイデアの例、終えたらできるようになること3つと学習時間の目安をまとめたもの。",
      visualType: "lesson_overview",
      width: 1228,
      height: 1232,
      showsMinutes: true,
    },
    concept_1: {
      src: "/assets/teaching/skill_09_divergence.webp",
      alt: "AI技「発散」の図。1つのアイデアをAIに渡すと複数方向のアイデアに広がることを示したもの。最初から正解を探さず、まず選択肢を増やす。",
      visualType: "skill_concept",
    },
    compare_results: {
      src: "/assets/teaching/compare_07_divergence.webp",
      alt: "数と方向性を指定すると案が広がることの図。ただ「アイデアを考えて」と頼んだ場合と、「方向性が違う案を10個」と足した場合を並べ、案の数と方向の幅が変わることを示したもの。",
      visualType: "compare",
    },
    concept_role: {
      src: "/assets/teaching/skill_07_role.webp",
      alt: "AI技「ロール指定」の図。「あなたは先生です」と伝えると初心者向けの説明に、「あなたはIT担当者です」と伝えると実務的な説明になることを示したもの。",
      visualType: "skill_concept",
    },
    concept_followup: {
      src: "/assets/teaching/skill_08_followup_question.webp",
      alt: "AI技「追加質問」の図。AIの答えに「もっと簡単に」「具体例を出して」と聞き返しながら、分かるまで深掘りしていく流れを示したもの。",
      visualType: "skill_concept",
    },
    concept_iteration: {
      src: "/assets/teaching/skill_03_iteration.webp",
      alt: "AI技「反復（Iteration）」の図。AIの答えに「もう少し短く」「もっとやわらかく」と足しながら、少しずつ近づけていく流れを示したもの。",
      visualType: "skill_concept",
    },
  },

  /*
    Day5「選択肢を比較する」。

    出る順は、レッスンの流れそのまま。
      完成イメージ → まず「どれがおすすめ？」と聞く → 比較
      → 評価基準を足して再実行 → おすすめの変わり方を見比べる
      → 自分の選択肢 → 評価基準の指定 → 基準を選ぶ
      → 出力形式の指定 → 形を選ぶ

    出力形式の絵は Day2 と同じ1枚を使い回す——**同じ技には同じ絵**。

    Day1〜4 と同じ決まりで置く。比べる図は一度試して条件を足した
    あと、解説の絵は使う直前、そして解説の絵を続けて2枚出さない。
  */
  compare_options: {
    outcome_preview: {
      src: "/assets/teaching/day5_overview.webp",
      alt: "Day5「選択肢を比較する」の全体図。A案・B案・C案をメリットとデメリットで並べた比較表とおすすめ欄を示し、目的に合っているか・メリットは大きいか・デメリットは少ないか・実現しやすいかという比べるときのポイント、終えたらできるようになること3つと学習時間の目安を添えたもの。",
      visualType: "lesson_overview",
      width: 1230,
      height: 1226,
      showsMinutes: true,
    },
    concept_1: {
      src: "/assets/teaching/skill_10_comparison.webp",
      alt: "AI技「比較」の図。バラバラの候補をAIに渡すと、価格・簡単さ・機能といった同じ観点で並んだ表になることを示したもの。",
      visualType: "skill_concept",
    },
    compare_results: {
      src: "/assets/teaching/compare_08_evaluation.webp",
      alt: "評価基準でおすすめが変わることの図。基準を決めずに「どれがおすすめ？」と聞いた場合と、価格・使いやすさ・機能を指定した場合を並べ、勧められる選択肢そのものが入れ替わることを示したもの。",
      visualType: "compare",
    },
    concept_criteria: {
      src: "/assets/teaching/skill_11_evaluation_criteria.webp",
      alt: "AI技「評価基準の指定」の図。同じ候補でも、価格重視ならA、機能重視ならCというように、重視するものを変えるとおすすめが変わることを示したもの。",
      visualType: "skill_concept",
    },
    concept_output_format: {
      src: "/assets/teaching/skill_05_output_format.webp",
      alt: "AI技「出力形式の指定」の図。同じ情報でも、3行・箇条書き・表のどれで欲しいかを指定できることを示したもの。",
      visualType: "skill_concept",
    },
  },

  /*
    Day6「情報を整理して見やすくする」。

    出る順は、レッスンの流れそのまま。
      完成イメージ → まずそのまま整理してもらう → 情報整理
      → 分け方を足して再実行 → 分ける前後を見比べる
      → 自分のメモ → 分類 → 分け方を選ぶ
      → 出力形式の指定 → 形を選ぶ

    出力形式の絵は Day2・Day5 と同じ1枚を使い回す
    ——**同じ技には同じ絵**。

    この教材の本文はサーバーだけが持っている（apps/catalog/
    release_seeding.py）。並びを見張るのは backend/tests/
    test_day6_organize.py のほう。
  */
  organize_information: {
    outcome_preview: {
      src: "/assets/teaching/day6_overview.webp",
      alt: "Day6「情報を整理して見やすくする」の全体図。ばらばらに書かれたメモが、ターゲット・アプローチ方法・発売時期・予算などの項目ごとに並んだ表へ変わることを示し、要点だけをまとめる・表やリストで見やすくする・重要な順に並べる・ムダをそぎ落とすという整理のポイントと、終えたらできるようになること3つ、学習時間の目安を添えたもの。",
      visualType: "lesson_overview",
      width: 1232,
      height: 1229,
      showsMinutes: true,
    },
    concept_1: {
      src: "/assets/teaching/skill_12_information_organization.webp",
      alt: "AI技「情報整理」の図。バラバラの紙をAIに渡すと、いくつかのカテゴリに並べ直されることを示したもの。情報を減らさなくても整理すると理解しやすくなる。",
      visualType: "skill_concept",
    },
    compare_results: {
      src: "/assets/teaching/compare_09_organization.webp",
      alt: "分類すると見やすくなることの図。整理前のバラバラなメモと、仕事・生活のカテゴリーに分けたあとを並べ、情報量は同じまま見つけやすさだけが変わることを示したもの。",
      visualType: "compare",
    },
    concept_classification: {
      src: "/assets/teaching/skill_13_classification.webp",
      alt: "AI技「分類」の図。メール・会議・旅行などが混ざった情報を、仕事と生活のグループに分ける様子を示したもの。",
      visualType: "skill_concept",
    },
    concept_output_format: {
      src: "/assets/teaching/skill_05_output_format.webp",
      alt: "AI技「出力形式の指定」の図。同じ情報でも、3行・箇条書き・表のどれで欲しいかを指定できることを示したもの。",
      visualType: "skill_concept",
    },
  },

  /*
    Day7「AIで画像を作る」。**まだ開けないレッスン。**

    絵と本文は揃えてある。足りないのは画像を作る口だけで、それは
    費用の見通しを立ててから開ける（docs/image-lessons.md）。
    開くまでこの表は使われない——近日公開の教材はステップを配らないので、
    画面がここを引きに来ることがそもそも無い。

    それでも先に書いておく。**絵の置き場所を決めるのは教材を書く作業**で、
    画像の口ができてから慌ててやることではない。

    出る順は、レッスンの流れそのまま。
      完成イメージ → 短い言葉で1枚作る → 画像プロンプト
      → 被写体・場所・雰囲気・スタイルを足して再生成 → 見比べる
      → 自分の作りたい画像 → スタイル指定 → スタイルを選ぶ
      → 構図指定 → 構図を選ぶ → 反復 → 送る

    反復の絵は Day1・Day4 と同じ1枚を使い回す——**同じ技には同じ絵**。
  */
  image_generation: {
    outcome_preview: {
      src: "/assets/teaching/day7_overview.webp",
      alt: "Day7「AIで画像を作る」の全体図。指示を考える・AIにお願いする・画像が完成する、という3つの手順を示し、プレゼン資料のイラストやSNSの投稿画像といった作れるものの例、具体的に伝える・色や雰囲気も指定する・最初はシンプルにするというコツ、終えたらできるようになること3つと学習時間の目安を添えたもの。",
      visualType: "lesson_overview",
      width: 1254,
      height: 1254,
      showsMinutes: true,
    },
    concept_1: {
      src: "/assets/teaching/skill_14_image_prompt.webp",
      alt: "AI技「画像プロンプト」の図。作りたい画像を、被写体・場所・雰囲気・スタイルという具体的な言葉にしてAIへ渡すことを示したもの。",
      visualType: "skill_concept",
    },
    compare_results: {
      src: "/assets/teaching/compare_11_image_prompt.webp",
      alt: "具体的に伝えるほど画像がイメージへ近づくことの図。ただ「カフェの画像」と頼んだ場合と、外観・構図・スタイルまで足した場合を並べたもの。",
      visualType: "compare",
    },
    concept_style: {
      src: "/assets/teaching/skill_15_style.webp",
      alt: "AI技「スタイル指定」の図。同じ被写体でも、写真風・イラスト風・水彩風で見た目と雰囲気が変わることを示したもの。",
      visualType: "skill_concept",
    },
    concept_composition: {
      src: "/assets/teaching/skill_16_composition.webp",
      alt: "AI技「構図指定」の図。同じ被写体でも、正面・俯瞰・クローズアップで何がどう見えるかが変わることを示したもの。",
      visualType: "skill_concept",
    },
    concept_iteration: {
      src: "/assets/teaching/skill_03_iteration.webp",
      alt: "AI技「反復（Iteration）」の図。AIの答えに「もう少し短く」「もっとやわらかく」と足しながら、少しずつ近づけていく流れを示したもの。",
      visualType: "skill_concept",
    },
  },

  /*
    Day8「画像を修正する」。Day7 と同じく**まだ開けないレッスン。**

    出る順は、レッスンの流れそのまま。
      完成イメージ → 元画像を直してみる → 画像編集指示
      → 直したいことを伝えて再実行 → 変わり方を見比べる
      → 自分の直したい画像 → 部分修正 → どこを直す
      → ほかは残せる → どう変える → 反復 → 送る

    このレッスンだけ比べる図が2枚ある
    ------------------------------
    骨格が作る比べる画面は1つだけ。2枚目（compare_15）は部分修正を
    使ったすぐ後に置きたいので、`concept_partial_result` という
    解説の一歩に載せている。**絵の置き場所は、絵の意味で決める**
    ——比べる図だからといって compare_results に押し込むと、
    1枚目と入れ替わってしまう。
  */
  image_edit: {
    outcome_preview: {
      src: "/assets/teaching/day8_overview.webp",
      alt: "Day8「画像を修正する」の全体図。元の画像に「夕暮れを夜にして、星空を追加して」と指示すると、その通りに直った画像が返ってくる流れを示し、構図を変える・色や明るさを調整する・不要なものを消すといった修正の種類、具体的に伝える・1回の指示は1つずつ・何度でも調整できるというコツ、終えたらできるようになること4つと学習時間の目安を添えたもの。",
      visualType: "lesson_overview",
      width: 1244,
      height: 1232,
      showsMinutes: true,
    },
    concept_1: {
      src: "/assets/teaching/skill_17_image_edit_instruction.webp",
      alt: "AI技「画像編集指示」の図。カフェの写真に「空を夕焼けに変えて」と伝えると、その部分だけが変わった修正版になることを示したもの。",
      visualType: "skill_concept",
    },
    compare_results: {
      src: "/assets/teaching/compare_14_image_edit.webp",
      alt: "変えたい部分だけ画像を直せることの図。元画像と、「空だけ夕焼けに変えて」と部分を指定した結果を並べ、空だけが変わって建物はそのままであることを示したもの。",
      visualType: "compare",
    },
    concept_partial: {
      src: "/assets/teaching/skill_18_partial_edit.webp",
      alt: "AI技「部分修正」の図。カフェの画像から人物だけを選んで消し、背景や構図はそのまま残す流れを示したもの。",
      visualType: "skill_concept",
    },
    concept_partial_result: {
      src: "/assets/teaching/compare_15_partial_edit.webp",
      alt: "直す場所を絞ると他を残せることの図。元画像と、人物だけを消した結果を並べ、背景・色・構図が保たれていることを示したもの。",
      visualType: "skill_concept",
    },
    concept_iteration: {
      src: "/assets/teaching/skill_03_iteration.webp",
      alt: "AI技「反復（Iteration）」の図。AIの答えに「もう少し短く」「もっとやわらかく」と足しながら、少しずつ近づけていく流れを示したもの。",
      visualType: "skill_concept",
    },
  },
};

/**
 * 表に載っている絵、全部。
 *
 * 置き忘れ（表に1行足したのにファイルが無い）を検査から見つけるため。
 * 画面には壊れた枠が出るのに、ほかの検査は全部通ってしまう。
 */
export const ALL_TEACHING_IMAGES: (TeachingImageEntry & {
  lessonId: string;
  stepId: string;
})[] = Object.entries(BY_LESSON).flatMap(([lessonId, steps]) =>
  Object.entries(steps).map(([stepId, entry]) => ({ ...entry, lessonId, stepId })),
);

/** このステップに出す絵。無ければ null（呼ぶ側は絵の場所ごと出さない）。 */
export function teachingImage(
  lessonId: string,
  stepId: string,
): TeachingImageEntry | null {
  return BY_LESSON[lessonId]?.[stepId] ?? null;
}
