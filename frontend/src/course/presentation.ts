/**
 * レッスンの「見た目の担当」を決める表。
 *
 * どのレッスンにどの絵と色を当てるかは、教材の中身ではなく見せ方の話。
 * catalog.ts（教材データ）にも React にも書かず、ここ1か所に集める。
 * 教材が増えたとき、直す場所を探し回らずに済む。
 *
 * 色は tailwind.config.js の accent から選ぶ。生の色コードは書かない。
 */

import {
  IconBook,
  IconBuilding,
  IconBulb,
  IconCalendar,
  IconChat,
  IconDocument,
  IconFolder,
  IconHeart,
  IconList,
  IconListBullet,
  IconListOrdered,
  IconMail,
  IconPeople,
  IconPerson,
  IconPlus,
  IconQuestion,
  IconScale,
  IconScissors,
  IconSmile,
  IconImage,
  IconSparkle,
  type Icon,
} from "../components/Icons";
import type { OptionIconName } from "./types";

/** IconBadge が受け取る色の名前。 */
export type Tone = "brand" | "sky" | "teal" | "amber" | "rose" | "violet" | "plain";

export interface LessonLook {
  icon: Icon;
  tone: Tone;
  /** カードの上に敷く、うすい地の色。 */
  wash: string;
}

const LOOKS: Record<string, LessonLook> = {
  rewrite_text: { icon: IconChat, tone: "plain", wash: "bg-brand-soft" },
  summarize_text: { icon: IconList, tone: "teal", wash: "bg-accent-teal-soft" },
  explain_topic: { icon: IconBook, tone: "sky", wash: "bg-accent-sky-soft" },
  compare_options: { icon: IconScale, tone: "violet", wash: "bg-accent-violet-soft" },
  make_plan: { icon: IconCalendar, tone: "rose", wash: "bg-accent-rose-soft" },
  improve_answer: { icon: IconBulb, tone: "amber", wash: "bg-accent-amber-soft" },
};

const FALLBACK: LessonLook = {
  icon: IconSparkle,
  tone: "plain",
  wash: "bg-brand-soft",
};

export function lookOf(lessonId: string): LessonLook {
  return LOOKS[lessonId] ?? FALLBACK;
}

/**
 * 選択肢に添える絵。
 *
 * 教材データは名前だけを持ち、実物はここで引く。
 * 相手を選ぶような問いは、文字だけより絵があるほうが速く選べる。
 */
const OPTION_ICONS: Record<OptionIconName, Icon> = {
  person: IconPerson,
  people: IconPeople,
  building: IconBuilding,
  mail: IconMail,
  book: IconBook,
  folder: IconFolder,
  bulb: IconBulb,
  calendar: IconCalendar,
  scale: IconScale,
  question: IconQuestion,
  document: IconDocument,
  chat: IconChat,
  scissors: IconScissors,
  heart: IconHeart,
  smile: IconSmile,
  "list-ordered": IconListOrdered,
  "list-bullet": IconListBullet,
  plus: IconPlus,
};

/**
 * 条件の選択肢に添える色。
 *
 * 6つを同じ青で並べると、どれも同じに見えて選ぶ手が止まる。
 * 色を散らすのは飾りではなく、見分けるため。
 * 名前を持たない選択肢は既定の青にする。
 */
const OPTION_TONES: Partial<Record<OptionIconName, Tone>> = {
  scissors: "sky",
  heart: "violet",
  smile: "amber",
  "list-ordered": "teal",
  "list-bullet": "plain",
  plus: "rose",
  person: "plain",
  people: "sky",
  building: "violet",
};

export function optionTone(name?: OptionIconName): Tone {
  return (name && OPTION_TONES[name]) || "plain";
}

export function optionIcon(name?: OptionIconName): Icon | null {
  return name ? (OPTION_ICONS[name] ?? null) : null;
}

/**
 * 診断の選択肢に添える絵。
 *
 * 教材データ側には持たせない。データは**何を聞くか**だけを持ち、
 * 絵は見せ方の都合なので、こちら側で引く（教材を書く人に、
 * 絵の名前まで覚えてもらう理由が無い）。
 *
 * 引けなかった値には何も出さない。それらしい絵を当てるより、
 * 文字だけのほうが読み違えない。
 *
 * ここに載せるのは「やりたいこと」（Q5）だけ。**Q1・Q2 には付けない。**
 *
 * 前はここが3問だったころの表のままで、いまは存在しない値
 * （`reading` `none` `occasional` `regular` …）が並んでいた。中でも
 * `tried` だけが Q1 の値と偶然ぶつかり、**5つのうち1つにだけ絵が付く**
 * 状態になっていた。しかも絵が1つでもあると札の組み方が2列に切り替わり、
 * 「まだ使ったことがない」（10字）が 375px の画面で2行に折り返していた
 * （`e2e/choiceLayoutShift.spec.ts` が捕まえた）。
 *
 * Q1・Q2 は言葉そのものが長く、絵と並べる余地が無い。付けないほうが
 * 1列で1行に収まる。
 */
const DIAGNOSIS_ICONS: Record<string, Icon> = {
  writing: IconMail,
  summarizing: IconList,
  researching: IconQuestion,
  ideas: IconBulb,
  comparing: IconScale,
  organizing: IconFolder,
  images: IconImage,
};

export function diagnosisIcon(value: string): Icon | null {
  return DIAGNOSIS_ICONS[value] ?? null;
}

/**
 * 「カテゴリから探す」の並び。
 *
 * 診断を受けていない人が、自分の困りごとから入れるようにする。
 * 押すと、その用途のレッスンへまっすぐ行く。行き先の無い分類は置かない。
 */
export const CATEGORIES: { label: string; lessonId: string }[] = [
  { label: "文章", lessonId: "rewrite_text" },
  { label: "要約", lessonId: "summarize_text" },
  { label: "情報整理", lessonId: "explain_topic" },
  { label: "アイデア", lessonId: "improve_answer" },
  { label: "計画", lessonId: "make_plan" },
  { label: "比較", lessonId: "compare_options" },
];
