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
 * 3:2（1536×1024）。出すのは `components/lessons/TeachingImage.tsx` で、
 * 切り取らずに1枚まるごと入れる。
 *
 * 絵の中に説明がある
 * ------------------
 * だから本文で同じことを長く繰り返さない。読み上げのための1文
 * （`alt`）だけをここに持つ。
 */

export interface TeachingImageEntry {
  src: string;
  /** 何の図か。1文で。絵の中の文字を書き写さない。 */
  alt: string;
}

const BY_LESSON: Record<string, Record<string, TeachingImageEntry>> = {
  /*
    Day1「文章を分かりやすくする」。

    出る順は、レッスンの流れそのまま。
      完成イメージ → お試し → ターゲット指定 → 条件を足して再実行
      → 比べる → 自分の文章 → トーン指定 → トーンを変える
      → 反復 → ふりかえり

    解説の絵（AI技）は続けて出さない。あいだに必ず手を動かす画面が入る。
  */
  rewrite_text: {
    outcome_preview: {
      src: "/assets/teaching/day1_overview.webp",
      alt: "Day1「文章を分かりやすくする」の全体図。分かりにくい文章をAIで読みやすい文章に直す流れと、覚えるAI技・使う場面・終えたらできることをまとめたもの。",
    },
    concept_1: {
      src: "/assets/teaching/skill_01_targeting.webp",
      alt: "AI技「ターゲット指定」の図。同じ文章でも、新入社員向けならやさしい文章に、専門家向けなら専門的な文章になることを示したもの。",
    },
    compare_results: {
      src: "/assets/teaching/compare_01_target.webp",
      alt: "誰に伝えるかで文章が変わることの図。ただ「分かりやすくして」と頼んだ場合と、「新入社員向けに」と足した場合を並べ、言葉の選び方と説明のやさしさが変わることを示したもの。",
    },
    concept_tone: {
      src: "/assets/teaching/skill_02_tone.webp",
      alt: "AI技「トーン指定」の図。同じ内容でも、丁寧・やわらかい・カジュアルで言い方が変わることを示したもの。",
    },
    concept_iteration: {
      src: "/assets/teaching/skill_03_iteration.webp",
      alt: "AI技「反復（Iteration）」の図。AIの答えに「もう少し短く」「もっとやわらかく」と足しながら、少しずつ近づけていく流れを示したもの。",
    },
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
      alt: "Day2「長い文章を短くまとめる」の全体図。長くて要点の見つけにくい文章をAIで短い要約に変える流れと、覚えるAI技・使う場面・終えたらできることをまとめたもの。",
    },
    concept_1: {
      src: "/assets/teaching/skill_04_summarization.webp",
      alt: "AI技「要約」の図。長い文章から、目的・決定事項・次の行動といった要点だけを取り出すことを示したもの。全部を削るのではなく、大事な情報を残す。",
    },
    compare_results: {
      src: "/assets/teaching/compare_03_summary_format.webp",
      alt: "まとめ方を指定すると要約が変わることの図。ただ「要約して」と頼んだ場合と、「重要なポイントを3つの箇条書きで」と足した場合を並べ、長さと出力形式が変わることを示したもの。",
    },
    concept_output_format: {
      src: "/assets/teaching/skill_05_output_format.webp",
      alt: "AI技「出力形式の指定」の図。同じ情報でも、3行・箇条書き・表のどれで欲しいかを指定できることを示したもの。",
    },
    concept_context: {
      src: "/assets/teaching/skill_06_context.webp",
      alt: "AI技「コンテキスト」の図。ただ「まとめて」と頼んだ場合と、目的・相手・場面という背景を渡した場合を並べ、背景を伝えるほど目的に合った回答になることを示したもの。",
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
      alt: "Day3「分からないことを説明してもらう」の全体図。難しい説明を、自分に合ったレベルの分かりやすい説明に変える流れと、覚えるAI技・使う場面・終えたらできることをまとめたもの。",
    },
    concept_1: {
      src: "/assets/teaching/skill_01_targeting.webp",
      alt: "AI技「ターゲット指定」の図。同じ文章でも、新入社員向けならやさしい文章に、専門家向けなら専門的な文章になることを示したもの。",
    },
    compare_results: {
      src: "/assets/teaching/compare_05_explanation_level.webp",
      alt: "自分のレベルを伝えると説明が変わることの図。ただ「APIについて説明して」と頼んだ場合と、「IT初心者向けに、身近な例を使って」と足した場合を並べ、言葉の難しさと例の有無が変わることを示したもの。",
    },
    concept_role: {
      src: "/assets/teaching/skill_07_role.webp",
      alt: "AI技「ロール指定」の図。「あなたは先生です」と伝えると初心者向けの説明に、「あなたはIT担当者です」と伝えると実務的な説明になることを示したもの。",
    },
    concept_followup: {
      src: "/assets/teaching/skill_08_followup_question.webp",
      alt: "AI技「追加質問」の図。AIの答えに「もっと簡単に」「具体例を出して」と聞き返しながら、分かるまで深掘りしていく流れを示したもの。",
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
      alt: "Day4「アイデアを広げる」の全体図。1つのアイデアからAIで複数の案を生み出す流れと、覚えるAI技・使う場面・終えたらできることをまとめたもの。",
    },
    concept_1: {
      src: "/assets/teaching/skill_09_divergence.webp",
      alt: "AI技「発散」の図。1つのアイデアをAIに渡すと複数方向のアイデアに広がることを示したもの。最初から正解を探さず、まず選択肢を増やす。",
    },
    compare_results: {
      src: "/assets/teaching/compare_07_divergence.webp",
      alt: "数と方向性を指定すると案が広がることの図。ただ「アイデアを考えて」と頼んだ場合と、「方向性が違う案を10個」と足した場合を並べ、案の数と方向の幅が変わることを示したもの。",
    },
    concept_role: {
      src: "/assets/teaching/skill_07_role.webp",
      alt: "AI技「ロール指定」の図。「あなたは先生です」と伝えると初心者向けの説明に、「あなたはIT担当者です」と伝えると実務的な説明になることを示したもの。",
    },
    concept_followup: {
      src: "/assets/teaching/skill_08_followup_question.webp",
      alt: "AI技「追加質問」の図。AIの答えに「もっと簡単に」「具体例を出して」と聞き返しながら、分かるまで深掘りしていく流れを示したもの。",
    },
    concept_iteration: {
      src: "/assets/teaching/skill_03_iteration.webp",
      alt: "AI技「反復（Iteration）」の図。AIの答えに「もう少し短く」「もっとやわらかく」と足しながら、少しずつ近づけていく流れを示したもの。",
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
      alt: "Day5「選択肢を比較する」の全体図。複数の選択肢を同じ基準で比べて比較表にする流れと、覚えるAI技・使う場面・終えたらできることをまとめたもの。",
    },
    concept_1: {
      src: "/assets/teaching/skill_10_comparison.webp",
      alt: "AI技「比較」の図。バラバラの候補をAIに渡すと、価格・簡単さ・機能といった同じ観点で並んだ表になることを示したもの。",
    },
    compare_results: {
      src: "/assets/teaching/compare_08_evaluation.webp",
      alt: "評価基準でおすすめが変わることの図。基準を決めずに「どれがおすすめ？」と聞いた場合と、価格・使いやすさ・機能を指定した場合を並べ、勧められる選択肢そのものが入れ替わることを示したもの。",
    },
    concept_criteria: {
      src: "/assets/teaching/skill_11_evaluation_criteria.webp",
      alt: "AI技「評価基準の指定」の図。同じ候補でも、価格重視ならA、機能重視ならCというように、重視するものを変えるとおすすめが変わることを示したもの。",
    },
    concept_output_format: {
      src: "/assets/teaching/skill_05_output_format.webp",
      alt: "AI技「出力形式の指定」の図。同じ情報でも、3行・箇条書き・表のどれで欲しいかを指定できることを示したもの。",
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
