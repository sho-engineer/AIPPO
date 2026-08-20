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
 * 「試す」ボタンは、まだ置かない
 * -------------------------------
 * 必要な技をすべて終えている場合、案として書きたくなるのは
 * 「この組み合わせを試す →」だが、それを受け止める画面
 * （複数レッスンを1つの流れとして実行する機能）がまだ無い。
 * 無い機能への導線を置くと、押しても何も起きないボタンになる。
 * いまは「使えます」の印だけにして、押せる形にするのは
 * 実行できる画面ができてから。
 *
 * 将来サーバー側へ移すとき
 * ------------------------
 * ここは教材の文言と同じ性質の**編集コンテンツ**なので、いまは
 * レッスンデータと同じ場所（frontend）に置く。admin から編集したく
 * なったら、Lesson と同じ移設（TS → seed json → DB）をたどればよい。
 * そのときのために、フィールド名は動かしやすい形にしてある。
 */

export type AppliedTipAccessLevel = "free" | "premium";

export interface AppliedTip {
  id: string;
  title: string;
  /** 何のためにこの組み合わせを使うか。1文で。 */
  description: string;
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
}

export const APPLIED_TIPS: AppliedTip[] = [
  {
    id: "meeting_notes_share",
    title: "長い会議メモを、上司へそのまま送れる文章にする",
    description: "決まったことだけを取り出してから、読む相手に合わせて整える。",
    requiredLessonIds: ["summarize_text", "rewrite_text"],
    flow: ["長い文章を短くまとめる", "誰向けかを整えて書き直す"],
    accessLevel: "free",
    order: 1,
  },
  {
    id: "meeting_summary_only",
    title: "長い会議メモから、要点だけを取り出す",
    description: "決まったことと次にやることだけを、短く残す。",
    requiredLessonIds: ["summarize_text"],
    flow: ["長い文章を短くまとめる"],
    accessLevel: "free",
    order: 2,
  },
  {
    id: "compare_new_tool",
    title: "新しい道具を、導入するか決める",
    description: "分からない仕組みを説明してもらってから、候補どうしを比べる。",
    requiredLessonIds: ["explain_topic", "compare_options"],
    flow: ["分からないことを説明してもらう", "選択肢を比較する"],
    accessLevel: "free",
    order: 1,
  },
  {
    id: "plan_and_share",
    title: "進め方を決めて、そのまま共有する",
    description: "手順を作ってから、送れる長さにまとめる。",
    requiredLessonIds: ["make_plan", "summarize_text"],
    flow: ["計画を作る", "長い文章を短くまとめる"],
    accessLevel: "free",
    order: 3,
  },
  {
    id: "improve_then_address",
    title: "AIの下書きを、相手向けに仕上げる",
    description: "一度で終わらせずに条件を足してから、伝え方まで整える。",
    requiredLessonIds: ["improve_answer", "rewrite_text"],
    flow: ["回答を改善する", "誰向けかを整えて書き直す"],
    accessLevel: "free",
    order: 2,
  },
  {
    id: "clear_writing_for_email",
    title: "そのまま送れるメールにする",
    description: "誰に、どんな言い方で送るかを決めてから書き直す。",
    requiredLessonIds: ["rewrite_text"],
    flow: ["誰向けかを整えて書き直す"],
    accessLevel: "free",
    order: 1,
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
