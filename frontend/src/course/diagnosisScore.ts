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

/*
  現在地の名前は、**次に伸ばす力から作る。**

  ここで実際に何が起きていたか
  ----------------------------
  境目が2つあった。段が上がる境目は 3、「その力が身に付いた」と数える
  境目は 4（下の `stageNumber` と `next`）。ずれているので、その
  あいだに居る人——ときどき条件を足せるが、まだ手には入っていない人
  ——に、同じ画面がこう出ていた：

      あなたの現在地   条件を加えられる段階
      次に伸ばす力     条件を加える力
      回答から見えた特徴  ✓ 条件を加えるのはこれから

  「加えられる」と「これから」が並ぶ。

  **1件だけの話ではなかった。** 答えの組み合わせを総当たりで出すと、
  同じ形の食い違いが5通りあった：

      現在地                          同時に出ていた行
      AIに頼める段階                  AIへの頼み方はこれから
      条件を加え始めている段階        AIへの頼み方はこれから
      条件を加えられる段階            条件を加えるのはこれから
      目的に合わせて使い分けられる段階  条件を加えるのはこれから
      仕事の流れに組み込めている段階    仕事の流れへの組み込みはこれから

  名前を1つ直しても、残りは残る。**境目を1つにしないと消えない。**

  どう直したか
  ------------
  名前の元を、段の番号から `weakest`（＝次に伸ばす力）へ移した。
  `weakest` は「下から見て最初に 4 に届いていない軸」なので、そこを
  名前に使えば、現在地と次の一歩は**同じ1つの判断から出る**——
  食い違いようが無い。

      次に伸ばす力      現在地
      AIに頼む         AIを試し始めている段階
      条件を加える      AIに頼める／条件を加え始めている段階（※）
      目的に合わせる    目的に合わせて使い分け始めている段階
      仕事で組み立てる  仕事の流れに組み込み始めている段階
      （4つとも4以上）  仕事の流れに組み込めている段階

  ※ 条件だけ2段に割ってある。ここが Day1 の受け持ちで、いちばん
    人数が多く、しかも「まだ何もしていない」と「やり始めた」では
    次に読ませたいものが違うため。割れ目は 3。
*/
export const STAGES: readonly Stage[] = [
  {
    number: 1,
    name: "AIを試し始めている段階",
    summary: "これから使いはじめるところ。まず1回、送ってみるところから。",
  },
  {
    number: 2,
    name: "AIに頼める段階",
    summary:
      "してほしいことを言葉にして、AIに渡せています。誰向けかを足すと、返ってくるものが変わります。",
  },
  {
    number: 3,
    name: "条件を加え始めている段階",
    summary:
      "AIに頼むことには慣れています。誰向けか・どんな言い方かを加えると、回答をさらに使いやすくできます。",
  },
  {
    number: 4,
    name: "目的に合わせて使い分け始めている段階",
    summary:
      "誰向けか・どんな言い方かを伝えられています。場面ごとに使い方を選べると、迷う時間が減ります。",
  },
  {
    number: 5,
    name: "仕事の流れに組み込み始めている段階",
    summary:
      "場面に応じて、AIの使い方そのものを選べています。返ってくる形を決めると、そのまま仕事に載せられます。",
  },
] as const;

/**
 * 4つとも身に付いている人の現在地。
 *
 * 段の番号は5のまま——道（`GrowthTrack`）の点は5つしかなく、ここは
 * その5つ目に立っている。違うのは**もう「これから」が無い**ことだけ
 * なので、名前と説明だけを差し替える。
 *
 * 前はこの人にも「仕事の流れへの組み込みはこれから」と出ていた。
 * `weakest` は必ず1つ返す作りなので、全部届いている人には
 * いちばん最後の軸が返り、それが「まだのところ」として表示されていた。
 */
const COMPLETE: Stage = {
  number: 5,
  name: "仕事の流れに組み込めている段階",
  summary: "仕事の流れの中で、どこにAIを置くかを設計できています。",
};

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
  /**
   * いちばん高い軸。「強み」としてそのまま出す。
   *
   * **`weakest` と対にならないことがある。** あちらは積み上げの順で
   * 決まるので、数字の大小とは別の物差し。全部が低い人は、ここも
   * 低い軸を指す——そのときに「身についていました」と書かないよう、
   * 使う側は `axes[strongest]` を見ること
   * （`course/recommend.ts` の `recommendLead`）。
   */
  strongest: Axis;
}

/** 軸ごとに、そこができていると言える文。 */
const STRENGTH_LINES: Record<Axis, string> = {
  ask: "AIに頼める",
  condition: "条件を足せる",
  purpose: "目的に合わせられる",
  workflow: "仕事の流れで使える",
};

/**
 * その答えが、どの力を動かしたか。
 *
 * なぜ要るか
 * ----------
 * 結果の画面には、答えた内容と4つの段が並ぶ。けれど**そのあいだが
 * 抜けていた**——自分の答えと、出てきた段のつながりが書いていないので、
 * 読んでも「そう出た」以上のことが分からない。診断を信じてもらえるか
 * どうかは、たいていここで決まる。
 *
 * 配点表から引く。**別に書かない。**
 * ここを手で書くと、配点を直した日に説明だけが古いまま残る
 * ——しかも読んだ人には、どちらが本当かを確かめる手段が無い。
 */
export function axesMovedBy(stepId: string, values: Record<string, string>): Axis[] {
  const gains: Partial<Record<Axis, number>>[] = [];

  if (stepId === "ai_usage") gains.push(Q1[values.ai_usage ?? ""] ?? {});
  if (stepId === "ask_style") gains.push(Q2[values.ask_style ?? ""] ?? {});
  if (stepId === "build_prompt") {
    const [what, who, how] = (values.build_prompt ?? "").split("|");
    gains.push(Q3.what[what] ?? {}, Q3.who[who] ?? {}, Q3.how[how] ?? {});
  }
  /*
    場面と使い方の対応。表は「正解」だけを持っていて配点は呼ぶ側に
    ある（`scoreDiagnosis`）ので、ここでは動く先だけを言う。
  */
  if (stepId === "match_purpose") gains.push({ purpose: 1 });

  return AXES.filter((axis) => gains.some((one) => (one[axis] ?? 0) > 0));
}

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
  const behind = AXES.find((axis) => axes[axis] < 4);
  const next = behind ?? AXES[AXES.length - 1];

  /*
    現在地は、**次に伸ばすところから決める。**

    前はここに別の積み上げ（`ask >= 3` から数える4行）が居て、段の
    境目が 3、身に付いた境目が 4 という**2つの物差し**が同じ画面に
    出ていた。そのあいだに居る人には、現在地と次の一歩が食い違って
    見える——総当たりで5通り出た（表は `STAGES` の上に貼ってある）。

    いまは1つ。届いていない軸そのものが現在地の名前になるので、
    ずれようが無い。条件だけ2段に割ってあるのは、そこが Day1 の
    受け持ちで、「まだ何もしていない」と「やり始めた」で次に
    読ませたいものが違うため。
  */
  const stageNumber = !behind
    ? 5
    : behind === "ask"
      ? 1
      : behind === "condition"
        ? axes.condition < 3
          ? 2
          : 3
        : behind === "purpose"
          ? 4
          : 5;

  return {
    axes,
    stage: behind ? STAGES[stageNumber - 1] : COMPLETE,
    strengths,
    weakest: next,
    strongest: ranked[0],
  };
}

/**
 * 回答から見えた特徴。**3つまで。**
 *
 * なぜ「できていること」と別に要るか
 * ----------------------------------
 * `strengths` は札に載せる短い言葉（「条件を足せる」）で、**できて
 * いることしか言わない**。診断の画面でいちばん効くのは、できている
 * ことと**まだのこと**が同じ並びに出て、境目が見えること。
 * 全部が「できている」だと、読んだ人は次に何をするのか分からない。
 *
 * 最後の1つは必ず「これから」にする
 * ----------------------------------
 * 上2つはできている軸から、最後は `weakest` から引く。順番を
 * 入れ替えない——できていることのあとに次が来る形そのものが、
 * 次の画面（4つの力）へのつながりになっている。
 */
const TRAIT_DONE: Record<Axis, string> = {
  ask: "AIにお願いすることには慣れている",
  condition: "条件を加えて結果を調整できる",
  purpose: "目的に応じて使い方を選べる",
  workflow: "仕事の流れの中でAIを使える",
};

const TRAIT_NEXT: Record<Axis, string> = {
  ask: "AIへの頼み方はこれから",
  condition: "条件を加えるのはこれから",
  purpose: "目的に応じた使い分けはこれから",
  workflow: "仕事の流れへの組み込みはこれから",
};

/**
 * 特徴の1行と、**その行の根拠になった回答**。
 *
 * なぜ根拠を一緒に返すか
 * ----------------------
 * 「条件を加えて結果を調整できる」とだけ出すと、どこからそう判断
 * したのかが分からない。**5問しか答えていない人**にとっては、当たって
 * いても外れていても「そう出た」以上のことが読み取れない
 * ——診断された感じは、待ち時間ではなくここで決まる。
 *
 * 根拠は作文しない。**選んだ札に書いてあった言葉**（`answerLines`）と、
 * その回答が動かした軸（`axesMovedBy`）だけでつなぐ。
 *
 * 根拠が無い行もある
 * ------------------
 * 「これから」の行は、たいてい**その軸を動かした回答が1つも無い**から
 * そうなっている。そのときは無理に理由を作らず、5問に出てこなかった
 * ことをそのまま言う（呼ぶ側が `from` の空で判断する）。
 */
export interface TraitLine {
  axis: Axis;
  /** 画面に出す1行。 */
  text: string;
  /** できていること（`true`）か、これから（`false`）か。 */
  done: boolean;
  /** この行の元になった回答。無いこともある。 */
  from: { stepId: string; text: string }[];
}

export function traitLines(
  result: DiagnosisResult,
  values: Record<string, string>,
): TraitLine[] {
  const lines = answerLines(values);
  return traitSeeds(result).map((seed) => ({
    ...seed,
    from: lines.filter((line) => axesMovedBy(line.stepId, values).includes(seed.axis)),
  }));
}

/** 特徴の行を、軸と「できている／これから」だけで決める。 */
function traitSeeds(result: DiagnosisResult): { axis: Axis; text: string; done: boolean }[] {
  const cleared: Axis[] = [];
  for (const axis of AXES) {
    if (axis === result.weakest || result.axes[axis] < 3) break;
    cleared.push(axis);
  }

  if (AXES.every((axis) => result.axes[axis] >= 4)) {
    return [
      ...AXES.slice(-2).map((axis) => ({ axis, text: TRAIT_DONE[axis], done: true })),
      { axis: result.weakest, text: ALL_ROUND, done: true },
    ];
  }

  return [
    ...cleared.slice(-2).map((axis) => ({ axis, text: TRAIT_DONE[axis], done: true })),
    { axis: result.weakest, text: TRAIT_NEXT[result.weakest], done: false },
  ];
}

/**
 * どの回答から判断したかを、人の言葉で並べる。
 *
 * 記号（`tried` `first_time`）のままでは、読んでも自分の答えだと
 * 分からない。**選んだ札に書いてあった言葉**で返す。
 *
 * どの問いの答えかも一緒に返す。「なおす」でその問いへ戻すのに要る。
 */
export function answerLines(
  values: Record<string, string>,
): { stepId: string; text: string }[] {
  const usage: Record<string, string> = {
    never: "AIはまだ使ったことがない",
    tried: "AIを試したことはある",
    sometimes: "困ったときにAIを使う",
    work: "仕事でAIをよく使う",
    daily: "ほぼ毎日、いろいろな用途でAIを使う",
  };
  const style: Record<string, string> = {
    lost: "何を書けばいいか迷う、と答えた",
    short: "とりあえず短くお願いする、と答えた",
    condition: "条件を足して頼むことがある、と答えた",
    adapt: "相手や目的に合わせて頼み方を変える、と答えた",
    design: "仕事の流れに合わせて頼み方を組み立てる、と答えた",
  };

  const lines: { stepId: string; text: string }[] = [];
  if (usage[values.ai_usage ?? ""]) {
    lines.push({ stepId: "ai_usage", text: usage[values.ai_usage] });
  }
  if (style[values.ask_style ?? ""]) {
    lines.push({ stepId: "ask_style", text: style[values.ask_style] });
  }

  const built = (values.build_prompt ?? "").split("|").filter(Boolean);
  if (built.length === 3) {
    lines.push({
      stepId: "build_prompt",
      text: "お願いを、3つの枠で組み立てた（何をしてほしい・誰向け・言い方）",
    });
  }

  const matched = (values.match_purpose ?? "").split("|");
  const answer = ["organize", "compare", "ideas"];
  const hits = answer.filter((one, index) => matched[index] === one).length;
  if (matched.filter(Boolean).length === 3) {
    lines.push({
      stepId: "match_purpose",
      text: `3つの場面のうち、${hits}つで場面に合う使い方を選んだ`,
    });
  }

  return lines;
}

export function traitsOf(result: DiagnosisResult): string[] {
  /*
    行の決め方は `traitSeeds` が1か所で持つ。ここと `traitLines` で
    別々に書いていたころは、片方だけ直すと画面と検査で違う行が出た。
  */
  return traitSeeds(result).map((seed) => seed.text);
}

/** 4つとも届いている人の、3行目。 */
const ALL_ROUND = "4つとも、ひととおり使えている";

/**
 * 次に覚えること。**技の名前ではなく、やることで書く。**
 *
 * `NEXT_SKILL` の名前（「ターゲット指定」）はこのアプリの中の呼び名で、
 * 初めて見る人には何をするのか分からない。ここは
 * **そのレッスンで実際に手を動かすこと**を1行で言う。
 */
export const NEXT_LEARNING: Record<Axis, string> = {
  ask: "何をしてほしいかを言葉にして、AIに渡す",
  condition: "誰向けか・どんな言い方かを足して、返ってくる文章を変える",
  purpose: "相手と目的を指定して、返ってくる文章を使い分ける",
  workflow: "返ってくる形を指定して、仕事の流れにそのまま載せる",
};

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
