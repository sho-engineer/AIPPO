/**
 * 2つの文章から、**いちばん変わったところ**を1〜2組だけ取り出す。
 *
 * 何のためか
 * ----------
 * Day1 の結果画面では、全文を読み比べさせない。202字の専門文と、その
 * 書き直しを毎回突き合わせると、いちばん見てほしい変化がその中に埋もれる
 * ——実機で「長文が続く」「変化が分かりにくい」と言われたのがそこ。
 *
 * 代わりに出すのは、Before / After の**対応する1文**。
 *
 *     Before  Attention WeightをValueに適用することで…
 *     After   どの言葉に注目するかを判断する仕組みです。
 *
 * 台本を書かない
 * --------------
 * ここを固定の例文にする手もある。見た目はきれいに揃うが、
 * **その人の結果に出ていない変化**を「変わったところ」として見せる
 * ことになる。AIの返事は毎回違うので、そのうち画面と結果が食い違う。
 *
 * このアプリは、測って言い切れることだけを出す決まりにしてある
 * （`steps/Compare.tsx` の `changePointsOf` と同じ考え方）。だから
 * 実際の2つの文章から取り出す。
 *
 * どう取り出すか
 * --------------
 * 文に切って、**似ているものどうしを組にする**。そのうえで、
 * 中身の重なりがいちばん小さい組から返す——重なりが小さいほど
 * 「書き直された」ということ。
 *
 * 総当たりでよい
 * --------------
 * 文の数はどちらも数個から十数個。二重ループでも一瞬で終わるので、
 * 凝った照合はしない。読めるほうを取る。
 */

/** 文に切る。句点・改行で。空の行は落とす。 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[。！？])|\n/)
    .map((one) => one.trim())
    .filter((one) => one.length > 0);
}

/**
 * 2つの文が、どれくらい同じものを指しているか（0〜1）。
 *
 * 2文字の並び（bigram）の重なりで測る。日本語は分かち書きが無いので、
 * 単語に切るには辞書が要る——2文字ずつなら辞書なしで、語の途中でも
 * 重なりを拾える。
 */
function overlap(a: string, b: string): number {
  const grams = (text: string) => {
    const set = new Set<string>();
    for (let at = 0; at < text.length - 1; at += 1) set.add(text.slice(at, at + 2));
    return set;
  };
  const one = grams(a);
  const two = grams(b);
  if (one.size === 0 || two.size === 0) return 0;
  let shared = 0;
  for (const gram of one) if (two.has(gram)) shared += 1;
  return shared / Math.min(one.size, two.size);
}

export interface ChangePair {
  before: string;
  after: string;
}

/**
 * 変わったところを、多い順に。
 *
 * @param limit いくつまで返すか。画面に置けるのは2組まで。
 *
 * 返せないときは空。**無いものを作らない**——似た文が見つからない
 * （＝丸ごと書き直された）ときに、無理に組を作ると、対応していない
 * 2文が「ここが変わりました」として並ぶ。
 */
export function changePairs(
  before: string,
  after: string,
  limit = 2,
): ChangePair[] {
  const from = sentences(before);
  const to = sentences(after);
  if (from.length === 0 || to.length === 0) return [];

  /*
    後の文それぞれに、元の文のうちいちばん近いものを当てる。

    後ろから引くのは、**後の文のほうが数が増えがち**だから。
    かみくだくと1文が2文に割れることがあり、元から引くと
    割れた片方だけが選ばれて、対応が半分になる。
  */
  const paired = to
    .map((sentence) => {
      let best = "";
      let score = 0;
      for (const source of from) {
        const near = overlap(sentence, source);
        if (near > score) {
          score = near;
          best = source;
        }
      }
      return { before: best, after: sentence, score };
    })
    /*
      まったく対応の取れない文は出さない。0.12 は、**同じ話題を
      していれば超える**あたり（実測で、書き直し後の文と元の文は
      0.2〜0.5、無関係な文どうしは 0.05 以下）。

      上も切る。0.95 を超えるものは「ほぼそのまま」で、
      変わったところとして出す意味が無い。
    */
    .filter((one) => one.before && one.score >= 0.12 && one.score < 0.95);

  /*
    同じ元の文が2回選ばれることがある（1文が2文に割れた場合）。
    先に来たほうだけを残す——同じ Before が2回並ぶと、
    2組あるのに1組ぶんのことしか言っていない画面になる。
  */
  const seen = new Set<string>();
  return paired
    .sort((a, b) => a.score - b.score)
    .filter((one) => {
      if (seen.has(one.before)) return false;
      seen.add(one.before);
      return true;
    })
    .slice(0, limit)
    .map(({ before: from_, after: to_ }) => ({ before: from_, after: to_ }));
}
