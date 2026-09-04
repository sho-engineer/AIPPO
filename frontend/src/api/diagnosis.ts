/**
 * 診断の答えを、サーバーへ残す。
 *
 * 実証実験で「どんな人が来て、どんな人が完走したか」を見るために要る。
 * 完了率だけでは、AIを使ったことがない人が離脱しているのか、
 * ふだん使う人が物足りなくて離脱しているのかを区別できない。
 *
 * 診断は本題ではないので、**結果を待たせない**。失敗しても学習者には
 * 何も見せず、そのまま先へ進める。
 *
 * おすすめの決め方はここに置かない。ルールで決めるものなので
 * `course/recommend.ts` が持つ——通信の成否で出方が変わってはいけない。
 */

import { apiBaseUrl } from "./config";
import { writeHeaders } from "./http";

/**
 * 5問の答えを、いまのサーバー側の3項目へ落とす。
 *
 * `LearnerProfile` は診断が3問だったころの形のままで、
 * `ai_experience` / `job_category` / `pain_point` を持っている。
 * 5問に合う形（4軸・現在地・履歴）へ作り替えるのは別の段取りなので、
 * それまでのあいだ**送れる形に寄せて**おく。
 *
 * ここで意味を作らない。無いものは空で送る——「営業」のような
 * それらしい値を埋めると、集計する人が本当に聞いたことだと読む。
 */
function toLegacyProfile(answers: Record<string, string>) {
  const experience: Record<string, string> = {
    never: "none",
    tried: "tried",
    sometimes: "occasional",
    work: "regular",
    daily: "regular",
  };
  return {
    ai_experience: experience[answers.ai_usage ?? ""] ?? "none",
    // 職種はもう聞いていない（初回で聞くと、答えても次の一歩が変わらない）
    job_category: "",
    // 「面倒なこと」の代わりに、本人が向かいたい方向を残す
    pain_point: (answers.want_to_do ?? "").split(",").filter(Boolean).join(","),
  };
}

export async function saveProfile(
  answers: Record<string, string>,
): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/profile/`, {
      method: "POST",
      credentials: "include", // learner_key Cookie を送る
      headers: await writeHeaders(),
      body: JSON.stringify(toLegacyProfile(answers)),
    });
    return response.ok;
  } catch {
    return false;
  }
}
