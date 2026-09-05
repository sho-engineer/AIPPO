/**
 * AI活用診断の採点。
 *
 * なぜルールで決めるか
 * --------------------
 * AI を呼ばない。呼ぶと初回起動が遅くなり費用もかかるうえ、**判定の
 * 理由を後から説明できない**。結果画面では「どの回答からそう判断
 * したか」を返すので、決め方は読める形で持っている必要がある。
 *
 * 4つの軸
 * -------
 * 5問しかないが、**1つの回答を複数の観点から読む**ので軸ごとに質問を
 * 足す必要はない。増やすと1〜2分で終わらなくなる。
 *
 *     ask      AIに頼む          … そもそも頼めるか
 *     condition 条件を加える     … 誰向け・どんな言い方を足せるか
 *     purpose  目的に合わせる    … 場面に合う使い方を選べるか
 *     workflow 仕事で組み立てる  … 流れの中で使えるか
 *
 * 重みは 自己申告3 : ミニ問題7
 * ---------------------------
 * 自分でどう思っているかより、**実際にどう答えたか**を重く見る。
 * 自己申告だけだと、できると答えた人が本当にできるのかが分からない
 * （それが3問だったころの弱点そのもの）。
 *
 * 模範解答を当てる遊びにしない
 * ----------------------------
 * ミニ問題は1つだけの正解にしない。Q3 の「誰向け？」は
 * 「初めて読む社員向け」も「新入社員向け」も高く採る。言い方も、
 * 文脈に合うものが複数ある。**満点でなくても加点される**形にして
 * おかないと、測っているのは「出題者の意図を読む力」になる。
 *
 * 出す値は1〜5
 * ------------
 * 68点・82点のような細かい点は見せない。刻みが細かいほど正確に
 * 見えるが、5問から出した数字にその精度は無い。段階だけを返す。
 */

/** 内部で使う軸の名前。 */
export const AXES = ["ask", "condition", "purpose", "workflow"] as const;

export type Axis = (typeof AXES)[number];

/** 画面に出す軸の名前。専門語にしない。 */
export const AXIS_LABELS: Record<Axis, string> = {
  ask: "AIに頼む",
  condition: "条件を加える",
  purpose: "目的に合わせる",
  workflow: "仕事で組み立てる",
};

/**
 * 現在地。**できることで言う。**
 *
 * 「レベル3」だと、上と下があることしか伝わらない。何ができる段階
 * なのかを名前にすれば、それだけで次の一歩が見当が付く。
 * 番号は並べ替えのために持つが、画面の主役にはしない。
 */
export interface Stage {
  /** 1〜5。並べ替えと履歴の保存に使う。画面には大きく出さない。 */
  number: number;
  /** 画面に出す名前。 */
  name: string;
  /** ひとことの説明。 */
  summary: string;
}

export const STAGES: readonly Stage[] = [
  {
    number: 1,
    name: "まず触ってみる段階",
    summary: "これから使いはじめるところ。まず1回、送ってみるところから。",
  },
  {
    number: 2,
    name: "AIにお願いできる段階",
    summary: "してほしいことを言葉にして、AIに渡せています。",
  },
  {
    number: 3,
    name: "条件を加えられる段階",
    summary: "誰向けか・どんな言い方かを足して、返ってくるものを変えられます。",
  },
  {
    number: 4,
    name: "目的に合わせて使える段階",
    summary: "場面に応じて、AIの使い方そのものを選べています。",
  },
  {
    number: 5,
    name: "仕事の目的に応じてAIの使い方を組み立てられる段階",
    summary: "仕事の流れの中で、どこにAIを置くかを設計できています。",
  },
] as const;

/* ------------------------------------------------------------------ 配点 */

/**
 * 自己申告の配点。0〜1 で持ち、あとで重みを掛ける。
 *
 * Q1 は回数ではなく**どれくらい入り込んでいるか**。仕事に入っている
 * ほど、流れの中で使えている見込みが高い。
 */
const Q1: Record<string, Partial<Record<Axis, number>>> = {
  never: { ask: 0 },
  tried: { ask: 0.35 },
  sometimes: { ask: 0.6, purpose: 0.2 },
  work: { ask: 0.85, purpose: 0.4, workflow: 0.4 },
  daily: { ask: 1, purpose: 0.6, workflow: 0.7 },
};

/** Q2 は頼み方そのもの。条件を足せるか、流れを組めるかが直接出る。 */
const Q2: Record<string, Partial<Record<Axis, number>>> = {
  lost: { ask: 0.1 },
  short: { ask: 0.5, condition: 0.1 },
  condition: { ask: 0.8, condition: 0.55 },
  adapt: { ask: 0.9, condition: 0.85, purpose: 0.6 },
  design: { ask: 1, condition: 0.9, purpose: 0.8, workflow: 1 },
};

/**
 * Q3（お願いを組み立てる）の配点。
 *
 * 場面は「新しく始まる社内制度を、初めて読む社員にも伝わるように
 * 説明したい」。**複数の答えが成り立つ**ので、段階的に採る。
 */
const Q3: Record<string, Record<string, Partial<Record<Axis, number>>>> = {
  what: {
    // 場面が「説明したい」なので、説明を頼むのがいちばん合う
    explain: { ask: 1, purpose: 0.8 },
    // 要約も無駄ではないが、初めて読む人には足りない
    summarize: { ask: 0.6, purpose: 0.3 },
    ideas: { ask: 0.4, purpose: 0 },
  },
  who: {
    // どちらも「まだ知らない人」を指している。どちらも高く採る
    first_time: { condition: 1, purpose: 0.6 },
    newcomer: { condition: 0.9, purpose: 0.5 },
    // 場面と逆向き。ただし「誰向けかを足した」こと自体は評価する
    expert: { condition: 0.4, purpose: 0 },
  },
  how: {
    // 初めて読む人に向けるなら、やさしさも丁寧さもどちらも効く
    kind: { condition: 0.85 },
    polite: { condition: 0.8 },
    kind_polite: { condition: 1 },
    // 場面に合わないが、言い方を指定したこと自体は評価する
    technical: { condition: 0.3 },
    casual: { condition: 0.35 },
  },
};

/** Q4（場面と使い方の対応）。合っていれば purpose が上がる。 */
const Q4_ANSWER: Record<string, string> = {
  messy: "organize",
  choosing: "compare",
  stuck: "ideas",
};

/* ------------------------------------------------------- 集計 */

export interface DiagnosisResult {
  /** 軸ごとの段階（1〜5）。 */
  axes: Record<Axis, number>;
  stage: Stage;
  /** いまできていること。2つだけ出す。 */
  strengths: string[];
  /**
   * 次に伸ばすところ。
   *
   * **数字がいちばん低い軸ではない。** 4つは積み上げの順に並んで
   * いるので、下から見て最初に届いていないところを返す。
   */
  weakest: Axis;
}

/** 軸ごとに、そこができていると言える文。 */
const STRENGTH_LINES: Record<Axis, string> = {
  ask: "AIに頼める",
  condition: "条件を足せる",
  purpose: "目的に合わせられる",
  workflow: "仕事の流れで使える",
};

/** 0〜1 を 1〜5 の段階へ。四捨五入ではなく、上へ届いた分だけ上げる。 */
function toStep(ratio: number): number {
  return Math.min(5, Math.max(1, Math.round(ratio * 4) + 1));
}

function addTo(
  totals: Record<Axis, number>,
  gains: Partial<Record<Axis, number>> | undefined,
  weight: number,
): void {
  if (!gains) return;
  for (const axis of AXES) {
    totals[axis] += (gains[axis] ?? 0) * weight;
  }
}

/**
 * 答えから4軸と現在地を出す。
 *
 * 答えていない問いは0点にする。**空欄を平均で埋めない**——飛ばした人が
 * 答えた人と同じ位置に出ると、診断そのものが当てにならなくなる。
 */
export function scoreDiagnosis(values: Record<string, string>): DiagnosisResult {
  const totals: Record<Axis, number> = { ask: 0, condition: 0, purpose: 0, workflow: 0 };
  /** 軸ごとに、満点だったら何点になるか。割って 0〜1 に戻すのに使う。 */
  const max: Record<Axis, number> = { ask: 0, condition: 0, purpose: 0, workflow: 0 };

  const declare = 0.3;
  const quiz = 0.7;

  /* Q1・Q2（自己申告）。合わせて全体の3割 */
  addTo(totals, Q1[values.ai_usage ?? ""], declare / 2);
  addTo(max, { ask: 1, purpose: 0.6, workflow: 0.7 }, declare / 2);
  addTo(totals, Q2[values.ask_style ?? ""], declare / 2);
  addTo(max, { ask: 1, condition: 0.9, purpose: 0.8, workflow: 1 }, declare / 2);

  /* Q3（お願いを組み立てる）。ミニ問題の半分 */
  const built = (values.build_prompt ?? "").split("|");
  const q3Keys = ["what", "who", "how"] as const;
  q3Keys.forEach((key, index) => {
    addTo(totals, Q3[key][built[index] ?? ""], quiz / 2 / 3);
  });
  addTo(max, { ask: 1, purpose: 0.8 }, quiz / 2 / 3);
  addTo(max, { condition: 1, purpose: 0.6 }, quiz / 2 / 3);
  addTo(max, { condition: 1 }, quiz / 2 / 3);

  /*
    Q4（場面と使い方の対応）。ミニ問題の半分。

    3つのうち何個が合っているかで `purpose` を上げる。ここは
    **場面に合う使い方が1つに決まる**問いなので、段階を付けない。
    仕事の流れを見る問いでもあるので、全問正解のときだけ workflow も
    少し上げる。
  */
  const matched = (values.match_purpose ?? "").split("|");
  const situations = ["messy", "choosing", "stuck"];
  const hits = situations.filter(
    (key, index) => matched[index] === Q4_ANSWER[key],
  ).length;
  addTo(totals, { purpose: hits / 3, workflow: hits === 3 ? 0.5 : 0 }, quiz / 2);
  addTo(max, { purpose: 1, workflow: 0.5 }, quiz / 2);

  const axes = AXES.reduce(
    (acc, axis) => {
      acc[axis] = toStep(max[axis] > 0 ? totals[axis] / max[axis] : 0);
      return acc;
    },
    {} as Record<Axis, number>,
  );

  /*
    現在地は**積み上げで決める**。平均にしない。

    平均だと、頼めないのに仕事で組み立てられる、という順番の
    おかしい位置に出ることがある。下から順に「ここは越えた」を
    数えるほうが、次の一歩と食い違わない。
  */
  let stageNumber = 1;
  if (axes.ask >= 3) stageNumber = 2;
  if (axes.ask >= 3 && axes.condition >= 3) stageNumber = 3;
  if (axes.ask >= 4 && axes.condition >= 3 && axes.purpose >= 4) stageNumber = 4;
  if (axes.ask >= 4 && axes.condition >= 4 && axes.purpose >= 4 && axes.workflow >= 4) {
    stageNumber = 5;
  }

  /*
    できていること。**2つだけ。**

    高いほうから採る。並べるほど「できている感」は出るが、
    次にやることが埋もれる。1つも3に届かないときは、いちばん高い
    軸を1つだけ出す——空欄にすると、何も出来ていないと言うことになる。
  */
  const ranked = [...AXES].sort((a, b) => axes[b] - axes[a]);
  const able = ranked.filter((axis) => axes[axis] >= 3).slice(0, 2);
  const strengths = (able.length > 0 ? able : ranked.slice(0, 1)).map(
    (axis) => STRENGTH_LINES[axis],
  );

  /*
    次に伸ばすところ。**数字がいちばん低い軸ではなく、順番で決める。**

    素直に最小値を採ると、順番の飛んだ答えが返る。AIを使ったことが
    ないのにミニ問題ができた人は `workflow` がいちばん低くなり、
    「まず触ってみる段階」の人に「出力形式の指定」を勧めることになった
    （実機で実際にそうなった）。

    4つの軸は積み上げの順に並んでいる（頼む → 条件 → 目的 → 流れ）。
    下から見て**最初に届いていないところ**が、次にやることそのもの。
  */
  const next = AXES.find((axis) => axes[axis] < 4) ?? AXES[AXES.length - 1];

  return {
    axes,
    stage: STAGES[stageNumber - 1],
    strengths,
    weakest: next,
  };
}

/**
 * 次に覚えるAI技。**1つだけ。**
 *
 * いちばん低い軸から引く。2つ3つ出すと、次に何をするかを
 * また選ぶことになる——迷わせないことを優先する。
 */
export const NEXT_SKILL: Record<Axis, { name: string; summary: string }> = {
  ask: { name: "プロンプト", summary: "AIに「何をしてほしいか」を伝える技" },
  condition: { name: "ターゲット指定", summary: "誰向けかをAIに伝える技" },
  purpose: { name: "トーン指定", summary: "どんな言い方にするかをAIに伝える技" },
  workflow: { name: "出力形式の指定", summary: "返ってくる形をAIに伝える技" },
};
