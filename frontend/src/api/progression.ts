/**
 * 学習マップ——いまどの段に居て、次に何が要るか。
 *
 * **段も要件も、ここには書かない。**
 * -------------------------------
 * 段の数・名前・要る技は、全部サーバーから来る
 * （`backend/apps/rewards/levels.py`）。画面側に写しを置くと、段を1つ
 * 足した日に「地図は6段だが一覧は5段」という状態になる。
 *
 * 判定もサーバー
 * --------------
 * 「上がれるか」を画面で数えない。上がる条件は2つあって
 * （技がそろう・実践問題を通る）、どちらも要る。ここで片方だけ数えると、
 * 画面と記録が食い違う。押せるかどうかは `challenge_open` をそのまま使う。
 */

import { getJson, sendJson } from "./http";

/** 1つの技の、その人にとっての状態。 */
export interface MapSkill {
  slug: string;
  name: string;
  one_line: string;
  /** earned … 実際に取った / locked … まだ */
  status: "earned" | "locked";
  /** どのレッスンで取れるか。空なら、まだ教材が無い技 */
  lessons: string[];
}

/** 1つの段の、その人にとっての状態。地図の1区画になる。 */
export interface MapLevel {
  number: number;
  name: string;
  description: string;
  /** done … 通り過ぎた / current … いまここ / locked … まだ先 */
  status: "done" | "current" | "locked";
  /**
   * 診断で飛ばした段か。
   *
   * **技を取ったわけではない**ことを、地図で言うために要る。通り過ぎた
   * 印だけ付けて技を習得済みにすると、使えるか分からない技が並ぶ。
   */
  skipped: boolean;
  skills: MapSkill[];
  /** そろっていない技の数。0 なら挑戦できる */
  remaining: number;
  /** 昇段の実践問題があるか。無い段は「準備中」 */
  has_challenge: boolean;
  /** いま挑戦できるか。技がそろい、かつ**すぐ次の段**であること */
  challenge_open: boolean;
}

export interface LevelMap {
  current_level: number;
  /** diagnosis … 診断で決まった / rankup … 実践問題を通って上がった */
  reached_by: string;
  levels: MapLevel[];
  /** 次の段。いちばん上に居れば null（「次は Lv.6」を出さない） */
  next: MapLevel | null;
}

export function fetchLevelMap(signal?: AbortSignal): Promise<LevelMap> {
  return getJson<LevelMap>("/api/v1/rewards/map/", signal);
}

/** このレッスンを終えると、何が増えるか。 */
export interface LessonReward {
  lesson: string;
  skills: {
    slug: string;
    name: string;
    one_line: string;
    /** すでに持っている技。やり直しの回に「新しく身につく」と書かないため */
    acquired: boolean;
  }[];
  next_level: {
    number: number;
    name: string;
    /** いま足りない技の数 */
    remaining: number;
    has_challenge: boolean;
  } | null;
  /**
   * このレッスンを終えたあと、次の段に**まだ足りない**技の数。
   *
   * 0 になっても「上がる」ではない。上がる条件は2つあって、技が
   * そろうのは片方だけ（もう片方は昇段の実践問題）。
   */
  remaining_after: number;
}

export function fetchLessonReward(
  lessonId: string,
  signal?: AbortSignal,
): Promise<LessonReward> {
  return getJson<LessonReward>(
    `/api/v1/rewards/lesson/${encodeURIComponent(lessonId)}/`,
    signal,
  );
}

/** 昇段の実践問題。 */
export interface RankUpChallenge {
  level: number;
  title: string;
  scenario: string;
  estimated_minutes: number;
  /**
   * 見る観点の名前（「目的」「誰向けか」…）。
   *
   * **見分け方そのものは来ない。** 言い回しの一覧が手元にあると、
   * 答えではなく一覧を写せば通ってしまう。
   */
  check_labels: string[];
  /** いま受けられるか。技がそろい、かつ**すぐ次の段**であること */
  open: boolean;
  /** そろっていない技の数 */
  remaining: number;
}

/** 書いた指示文を見てもらった結果。 */
export interface ChallengeVerdict {
  passed: boolean;
  /** 足りなかった観点の鍵。通ったときは空 */
  missing: string[];
  /** 足りなかった観点の、人に見せる名前 */
  missing_labels: string[];
  /** この回で段が上がったか */
  level_up: boolean;
  current_level: number;
  /** 通っても上がらなかったとき、あといくつ技が要るか */
  remaining_skills: number;
}

export function fetchChallenge(
  level: number,
  signal?: AbortSignal,
): Promise<RankUpChallenge> {
  return getJson<RankUpChallenge>(
    `/api/v1/rewards/challenge/${level}/`,
    signal,
  );
}

/**
 * 書いた指示文を送る。
 *
 * **判定はサーバー。** 画面で見ると観点の一覧が手元に渡るので、
 * 答えを読まずに通せる。
 */
export function submitChallenge(
  level: number,
  answer: string,
): Promise<ChallengeVerdict> {
  return sendJson<ChallengeVerdict>(`/api/v1/rewards/challenge/${level}/`, {
    answer,
  });
}

/**
 * 診断の結果を、地図の開始地点として記録する。
 *
 * **下げない。** 受け直した診断が、実践問題を通って上がった段を
 * 取り消す形にすると、やったことが消える——判断はサーバー側
 * （`start_from_diagnosis`）。画面はただ出た段を送るだけで、
 * 上げ下げを決めない。
 */
export function recordDiagnosisLevel(
  level: number,
): Promise<{ current_level: number }> {
  return sendJson<{ current_level: number }>("/api/v1/rewards/level/", {
    level,
  });
}
