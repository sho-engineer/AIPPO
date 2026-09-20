/**
 * AIPPO Level —— 5段階に名前を与えたもの。
 *
 * **新しい判定を作っていない。**
 * ----------------------------
 * Level N は、診断がもともと出している段階 N そのもの
 * （`diagnosisScore.ts` の `STAGES`）。数え方も境目も変えていない。
 * ここがやるのは、その段階を**人に見せるときの言葉**を持つことだけ。
 *
 * 2つの数を並行に持たない。持つと、片方だけ動かした日に「道は5番目が
 * 点いているのに Level 2」という食い違いが出る——実際、指示書に添えて
 * あった画面ではそうなっていた（道が「組み立て」で、文字が Level 2）。
 * `level === stage.number` を崩さないかぎり、その食い違いは起こらない。
 *
 * 段階の名前は2種類ある
 * ---------------------
 * `STAGES[n].name` は判定文に使う長い名前（「AIに頼める段階」）。
 * こちらの `name` は一覧で並べるための短い名前（「頼む」）で、
 * 結果の画面の道（`GrowthTrack` の `SHORT`）と同じ言葉。**同じものを
 * 指す言葉は、画面をまたいでそろえる。**
 *
 * これから増やすもの
 * ------------------
 * レッスンを終えて上がったときの画面（LEVEL UP）も、ここの表から
 * 作れるようにしてある。`levelOf` と `nextLevel` があれば、上がった
 * 先の名前も、次に要る技も、同じ場所から引ける。
 */

/** いちばん下と、いちばん上。 */
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

export interface AippoLevel {
  /** 1〜5。診断の段階そのもの。 */
  number: number;
  /** 一覧に並べる短い名前。結果の画面の道と同じ言葉。 */
  name: string;
  /** 1行の説明。**長くしない**——5つを一目で見比べるための表なので。 */
  summary: string;
  /**
   * この段へ上がるのに要る技。最大3つ。
   *
   * 「次は Lv.3」の下に出す。**何をすれば上がるか**まで言えないと、
   * 一覧はただの階級表になる。
   */
  skills: string[];
}

export const AIPPO_LEVELS: readonly AippoLevel[] = [
  {
    number: 1,
    name: "試す",
    summary: "AIに質問したり、簡単な文章生成を試せる",
    /* いちばん下。ここへ「上がる」ことは無いので空 */
    skills: [],
  },
  {
    number: 2,
    name: "頼む",
    summary: "目的を伝えて、基本的な仕事をAIに頼める",
    skills: ["してほしいことを言葉にする", "目的を伝える"],
  },
  {
    number: 3,
    name: "条件をつける",
    summary: "相手・目的・条件・形式を指定して、欲しい結果に近づけられる",
    skills: ["読む相手を決める", "条件を指定する", "出力の形を指定する"],
  },
  {
    number: 4,
    name: "使い分ける",
    summary: "仕事の内容に応じて、AIへの頼み方や使い方を選べる",
    skills: ["場面で頼み方を変える", "結果を見て直す", "使う場面を選ぶ"],
  },
  {
    number: 5,
    name: "組み立てる",
    summary: "AIを仕事の流れに組み込み、複数のステップを組み立てて使える",
    skills: ["手順に分ける", "前の結果を次に渡す", "仕事の流れへ組み込む"],
  },
] as const;

/** その番号の段。範囲の外は、いちばん近いところへ寄せる。 */
export function levelOf(number: number): AippoLevel {
  const at = Math.min(Math.max(number, MIN_LEVEL), MAX_LEVEL);
  return AIPPO_LEVELS[at - 1];
}

/**
 * 次の段。いちばん上に居れば null。
 *
 * null を返すのは大事で、5段目の人に「次は Lv.6」と出さないため。
 */
export function nextLevel(number: number): AippoLevel | null {
  return number >= MAX_LEVEL ? null : levelOf(number + 1);
}
