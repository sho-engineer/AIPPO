/**
 * 「こんな使い方もできます」（応用例／組み合わせ）。
 *
 * レッスンは1つの技術だけを教える。「誰向けかを伝えて書き直す」
 * 「長い文章を短くまとめる」——1本ずつはそれで正しいが、
 * それだけで終えると「練習した」で止まり、「これで何ができるか」が
 * 見えないまま次のレッスンへ進むことになる。
 *
 * ここでは、レッスンを実際の仕事に結びつける短い例を出す。
 *
 *     応用例   … 1つの技術を、実際の場面で使う（requiredLessonIds が1件）
 *     組み合わせ … 2つの技術をつなげる（requiredLessonIds が2件以上）
 *
 * 2つを型としては分けない。1件なら応用例、2件以上なら組み合わせに
 * **自然になる**ので、別の型を足すと同じ情報を2か所で管理することになる。
 *
 * 存在するレッスンだけを指す
 * --------------------------
 * ここで挙げる例は、すべて既存のレッスンの組み合わせで作れるものだけに
 * 絞ってある。「音声を文字にする」のような、まだ無い技術は出さない。
 * 出せば、押しても無いレッスンへの案内という行き止まりになる
 * （憲章 原則 I）。教材が増えたら、ここへ足す。
 *
 * 「くわしく見る」の行き先
 * ------------------------
 * 以前はここに押せる導線が無かった。「この組み合わせを試す →」を
 * 置きたくても、受け止める画面が無く、押しても何も起きない
 * ボタンになってしまうためだった（憲章 原則 I）。
 *
 * いまは受け止める画面がある（`pages/RecipePage.tsx`）。
 * ただし出すのは**やり方の案内**であって、複数レッスンを1つの流れとして
 * 自動で走らせる機能ではない。手順・使う技・before/after を並べて、
 * 自分でAIに頼めるようにするところまで。できないことを
 * できるように見せない、という線はそのまま守る。
 *
 * 将来サーバー側へ移すとき
 * ------------------------
 * ここは教材の文言と同じ性質の**編集コンテンツ**なので、いまは
 * レッスンデータと同じ場所（frontend）に置く。admin から編集したく
 * なったら、Lesson と同じ移設（TS → seed json → DB）をたどればよい。
 * そのときのために、フィールド名は動かしやすい形にしてある。
 */

export type AppliedTipAccessLevel = "free" | "premium";

/**
 * どんな場面向けかの分類。絞り込み・並び替えに使う（表示は任意）。
 * 増やすときは既存の項目の意味とぶつからない名前にすること。
 */
export const APPLIED_TIP_CATEGORIES = [
  "会議",
  "文章作成",
  "比較検討",
  "計画",
] as const;

export type AppliedTipCategory = (typeof APPLIED_TIP_CATEGORIES)[number];

export interface AppliedTip {
  id: string;
  title: string;
  /** 何のためにこの組み合わせを使うか。1文で。 */
  description: string;
  /** どんな場面向けか。将来、場面別の絞り込みに使う。 */
  category: AppliedTipCategory;
  /**
   * 使う技（レッスンの id）。
   *
   * 1件なら「応用例」、2件以上なら「組み合わせ」。表示は、この配列に
   * 含まれるレッスンの完了画面すべてに出す——「文章を分かりやすくする」
   * を終えた人にも「回答を改善する」を終えた人にも、同じ組み合わせが
   * 見えたほうが、あとから思い出しやすい。
   */
  requiredLessonIds: string[];
  /**
   * 手順の言葉。レッスンの題を、使う順に並べる。
   * 画面側は「＋」でつないで出す（1件なら単独で出す）。
   */
  flow: string[];
  /**
   * いまは "free" だけを使う。無料コースの応用例はすべて無料にする
   * （憲章）。有料化する日が来ても、基本のレッスンそのものではなく、
   * 高度な組み合わせ・実務テンプレートのほうを対象にする。
   */
  accessLevel: AppliedTipAccessLevel;
  /** 同じレッスンに複数出るときの並び順。小さいほど先。 */
  order: number;

  /**
   * くわしく見る画面（RecipePage）で出す、before と after。
   *
   * **AIは呼ばない。**その場で作らせると、開くたびに費用がかかるうえ、
   * 出来がその時々で変わって、教材として確かめられなくなる
   * （解説カードの reviewExample と同じ考え方）。
   *
   * 省略してよい。無ければ例の欄そのものを出さない——中身の無い
   * 見出しだけが残るほうが、無いことより分かりにくい。
   */
  exampleInput?: string;
  exampleOutput?: string;
  /**
   * 手を動かす順番。1行ずつ、実際にやることを書く。
   * flow は技の名前の並び、こちらは**やり方**。
   */
  steps?: string[];
}

export const APPLIED_TIPS: AppliedTip[] = [
  {
    id: "meeting_notes_share",
    title: "長い会議メモを、上司へそのまま送れる文章にする",
    description: "決まったことだけを取り出してから、読む相手に合わせて整える。",
    category: "会議",
    requiredLessonIds: ["summarize_text", "rewrite_text"],
    flow: ["長い文章を短くまとめる", "誰向けかを整えて書き直す"],
    accessLevel: "free",
    order: 1,
    steps: [
      "会議メモを、そのまま貼る",
      "「決まったこと」と「次にやること」だけを取り出してもらう",
      "取り出した内容を、上司へ送る前提で書き直してもらう",
      "日付と担当者が合っているか、自分の目で確かめる",
    ],
    exampleInput:
      "・A案とB案で議論。コストはA案が有利だが納期がB案より2週間遅い\n" +
      "・部長は納期を優先したいとのこと\n" +
      "・とりあえずB案で進める方向。田中さんが来週火曜までに見積り取り直し",
    exampleOutput:
      "【決定事項】\n" +
      "納期を優先し、B案で進めます。\n\n" +
      "【次のアクション】\n" +
      "・田中：見積りの取り直し（〜火曜）",
  },
  {
    id: "meeting_summary_only",
    title: "長い会議メモから、要点だけを取り出す",
    description: "決まったことと次にやることだけを、短く残す。",
    category: "会議",
    requiredLessonIds: ["summarize_text"],
    flow: ["長い文章を短くまとめる"],
    accessLevel: "free",
    order: 2,
  },
  {
    id: "compare_new_tool",
    title: "新しい道具を、導入するか決める",
    description: "分からない仕組みを説明してもらってから、候補どうしを比べる。",
    category: "比較検討",
    requiredLessonIds: ["explain_topic", "compare_options"],
    flow: ["分からないことを説明してもらう", "選択肢を比較する"],
    accessLevel: "free",
    order: 1,
  },
  {
    id: "plan_and_share",
    title: "進め方を決めて、そのまま共有する",
    description: "手順を作ってから、送れる長さにまとめる。",
    category: "計画",
    requiredLessonIds: ["make_plan", "summarize_text"],
    flow: ["計画を作る", "長い文章を短くまとめる"],
    accessLevel: "free",
    order: 3,
  },
  {
    id: "improve_then_address",
    title: "AIの下書きを、相手向けに仕上げる",
    description: "一度で終わらせずに条件を足してから、伝え方まで整える。",
    category: "文章作成",
    requiredLessonIds: ["improve_answer", "rewrite_text"],
    flow: ["回答を改善する", "誰向けかを整えて書き直す"],
    accessLevel: "free",
    order: 2,
  },
  {
    id: "clear_writing_for_email",
    title: "そのまま送れるメールにする",
    description: "誰に、どんな言い方で送るかを決めてから書き直す。",
    category: "文章作成",
    requiredLessonIds: ["rewrite_text"],
    flow: ["誰向けかを整えて書き直す"],
    accessLevel: "free",
    order: 1,
    steps: [
      "送りたい内容を、思いついたまま書く",
      "誰に送るか（社外のお客様・上司など）を伝える",
      "どんな言い方にしたいか（ていねいに・短くなど）を足す",
      "出てきた文を読んで、事実が変わっていないか確かめる",
    ],
    exampleInput:
      "例の件、こっちの都合で遅れてます。すいません。来週には出せると思います。",
    exampleOutput:
      "お世話になっております。\n" +
      "ご依頼の件につきまして、弊社都合により対応が遅れており、申し訳ございません。\n" +
      "来週中にはご提出できる見込みです。",
  },
];

/**
 * このレッスンの完了画面に出す例を、並び順で返す。
 *
 * `accessLevel` は無料のものしか出さない。いまは全件が無料なので
 * 実質は素通りだが、将来の項目が紛れ込んでも、押せない案内を
 * 出さずに済むようにここで止める。
 */
export function appliedTipsFor(lessonId: string): AppliedTip[] {
  return APPLIED_TIPS.filter((tip) => tip.accessLevel === "free")
    .filter((tip) => tip.requiredLessonIds.includes(lessonId))
    .sort((a, b) => a.order - b.order);
}

/**
 * id から1件引く。くわしく見る画面（RecipePage）が使う。
 *
 * 無料のものしか返さない。`appliedTipsFor` と同じ関門を通すことで、
 * 一覧に出ないものが、URL や古い状態から直接ひらかれるのを防ぐ。
 */
export function appliedTipById(tipId: string): AppliedTip | null {
  return (
    APPLIED_TIPS.find(
      (tip) => tip.id === tipId && tip.accessLevel === "free",
    ) ?? null
  );
}
