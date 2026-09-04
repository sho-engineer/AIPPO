/**
 * 診断の答えから、おすすめのレッスンを3つ選ぶ（要件 §9）。
 *
 * **AI を使わない。** ルールで決める。
 * ここで AI を呼ぶと、最初の1画面で待たせることになるうえ、
 * 費用もかかる。診断の精度は使ってもらった後でないと検証できないので、
 * 先に作り込まない。
 *
 * 選び方は単純にしてある。
 *   1. 「いま面倒なこと」に直結するレッスンを先頭に置く
 *   2. 「仕事の種類」で相性のよいものを足す
 *   3. 足りなければ、番号順に埋める
 *
 * 最後は必ず3つ返す。0件や1件だと、選ぶ画面が成り立たない。
 */

import { COURSE } from "./catalog";
import { scoreDiagnosis, type Axis } from "./diagnosisScore";

/**
 * 「やりたいこと」（Q5）→ そこへ向かうレッスン。
 *
 * 診断が3問から5問に変わり、「いま面倒なこと」を聞くのをやめた
 * ——面倒だと感じていることと、次に覚えるべきことは別だったため。
 * いまは**本人が向かいたい方向**を複数で受け取る。
 *
 * ここは Q5 だけを見る素朴な引き当てで、**弱点は見ていない**。
 * 弱点を優先して1本に絞るのは、採点（4軸）が入ってから
 * （`course/diagnosisScore.ts`）。それまでの間、おすすめが空に
 * ならないようにする役目を持つ。
 */
const BY_WANT: Record<string, string[]> = {
  writing: ["rewrite_text", "improve_answer"],
  summarizing: ["summarize_text", "rewrite_text"],
  researching: ["explain_topic", "compare_options"],
  ideas: ["improve_answer", "make_plan"],
  comparing: ["compare_options", "explain_topic"],
  organizing: ["make_plan", "summarize_text"],
  images: ["rewrite_text", "summarize_text"],
};

/**
 * 「お願いのしかた」（Q2）→ 相性のよいレッスン。
 *
 * まだ迷っている人には、いちばん短く結果まで届く1本を先に置く。
 */
const BY_ASK_STYLE: Record<string, string[]> = {
  lost: ["rewrite_text"],
  short: ["rewrite_text"],
  condition: ["summarize_text", "rewrite_text"],
  adapt: ["explain_topic", "compare_options"],
  design: ["make_plan", "compare_options"],
};

/** 診断を飛ばした人にも出す既定。最初の一歩として無難な順。 */
const DEFAULTS = ["rewrite_text", "summarize_text", "explain_topic"];

export const RECOMMENDATION_COUNT = 3;

export function recommendLessons(answers: Record<string, string>): string[] {
  const chosen: string[] = [];

  const push = (ids: string[]) => {
    for (const id of ids) {
      if (chosen.length >= RECOMMENDATION_COUNT) return;
      if (!chosen.includes(id)) chosen.push(id);
    }
  };

  /*
    Q5 は複数選べる。選んだ順に見る——先に押したものほど、その人が
    先に思いついたこと。カンマでつないだ1つの文字列で来る
    （`components/course/steps/Inputs.tsx`）。
  */
  for (const want of (answers.want_to_do ?? "").split(",").filter(Boolean)) {
    push(BY_WANT[want] ?? []);
  }
  push(BY_ASK_STYLE[answers.ask_style ?? ""] ?? []);
  push(DEFAULTS);
  // ここまでで埋まらない設定ミスに備えて、番号順で埋める
  push(COURSE.lessons.filter((lesson) => lesson.usesAi).map((lesson) => lesson.id));

  return chosen.slice(0, RECOMMENDATION_COUNT);
}

const STORAGE_KEY = "aippo:recommended";

export function saveRecommendations(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // 保存できなくても、その場の表示は動く
  }
}

export function loadRecommendations(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * 診断がまだでも、必ず3つ返す。
 *
 * ホームの「おすすめ」は空にできない。初めて来た人にこそ出す必要が
 * あるのに、そこだけ節が丸ごと消えると、何から始めればよいか
 * 分からない画面になる。
 *
 * 一覧の「おすすめ」印にはこれを使わない。あちらは本人が診断で選んだ
 * 結果にだけ付ける。既定値にまで印を付けると、自分で選んだのか
 * 最初からそうだったのかが区別できなくなる。
 */
export function recommendationsForHome(): string[] {
  const saved = loadRecommendations();
  return saved.length > 0 ? saved : recommendLessons({});
}


/**
 * おすすめのレッスンを**1本だけ**返す。
 *
 * 決め方は「弱いところを先に、行きたい方向を加味して」。
 *
 * 弱点を先に見るのは、**近道が近道にならない**ため。画像をやりたい人に
 * いきなり Day7 を出しても、AIへの基本的な頼み方ができていなければ
 * そこで詰まる。まず土台の1本を渡す。
 *
 * ただし土台ができている人には、行きたい方向のほうを渡す。できている
 * ことをもう一度やらせるのは、いちばん早く飽きさせる方法なので。
 *
 * 3本返していたころとの違い
 * -------------------------
 * 前は3本並べていた。選べるように見えて、**次に何をするかをもう一度
 * 選ばせている**だけだった。結果画面の役目は「次の1つを決める」ことで、
 * ほかを見たい人にはコースの一覧がある。
 */
export function recommendLesson(answers: Record<string, string>): string {
  const { axes, weakest } = scoreDiagnosis(answers);

  /** 軸ごとの、そこを埋める1本。 */
  const FOR_AXIS: Record<Axis, string> = {
    ask: "rewrite_text",
    condition: "rewrite_text",
    purpose: "explain_topic",
    workflow: "make_plan",
  };

  /*
    土台ができているか。

    「AIに頼む」と「条件を加える」の2つが3以上なら、Day1 で渡すものは
    ひととおり持っている。そこから先は行きたい方向で選んでよい。
  */
  const hasBasics = axes.ask >= 3 && axes.condition >= 3;
  if (hasBasics) {
    const wants = (answers.want_to_do ?? "").split(",").filter(Boolean);
    for (const want of wants) {
      const id = (BY_WANT[want] ?? [])[0];
      if (id && lessonExists(id)) return id;
    }
  }

  const fromAxis = FOR_AXIS[weakest];
  return lessonExists(fromAxis) ? fromAxis : DEFAULTS[0];
}

function lessonExists(id: string): boolean {
  return COURSE.lessons.some((lesson) => lesson.id === id && lesson.usesAi);
}

/**
 * なぜこの1本なのかを、1行で。
 *
 * 結果画面に出すのはこれだけ。詳しい話は「理由を見る」の中へ回す
 * ——通常の画面に長文を置くと、読む画面になって次の一歩が遠くなる。
 *
 * **24文字まで。** 402px の画面で `text-sm`（15px）なら1行に入る
 * 上限がそこ。超えると2行になり、そのぶん下の「理由を見る」が
 * 入れ物からあふれる（いちばん低い持ち方で実際にあふれた）。
 */
export function recommendReason(answers: Record<string, string>): string {
  const { axes } = scoreDiagnosis(answers);

  if (axes.ask < 3) {
    return "まずは、AIへの頼み方から始めましょう。";
  }
  if (axes.condition < 3) {
    return "お願いはできています。次は「誰向けか」を。";
  }
  if (axes.purpose < 4) {
    return "頼み方は身についています。次は場面に合う使い方を。";
  }
  return "土台はそろっています。次は仕事の流れの中へ。";
}
