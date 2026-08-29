/**
 * 見張っている出来事（Analytics）。
 *
 * 名前をここに1つ置く。画面ごとに文字列を書くと、綴りの違う行が
 * 静かに増える——**捨てられても画面は止まらない**ので、
 * 気づくのは集計を見たときになる（実際に一度そうなった）。
 *
 * サーバーが決めることは、ここから送らない
 * ----------------------------------------
 * AI技の習得・XP・コースの節目は、サーバー側で判定して記録している
 * （設計方針 §36）。画面から送ると、送られてこなかった回と
 * 起きなかった回の区別が付かなくなる。
 *
 * 本文は送らない
 * --------------
 * 送るのは名前と数だけ（設計判断 Q-2）。メールアドレスも入力も、
 * ここを通らない。
 */

import { sendLearningEvent } from "../api/lesson";

/** 画面から送る出来事。サーバー側で判定するものは含めない。 */
export const EVENTS = {
  signUpStarted: "signup_started",
  signUpCompleted: "signup_completed",
  googleAuthFailed: "google_auth_failed",
  passkeyRegistrationFailed: "passkey_registration_failed",
  passwordResetRequested: "password_reset_requested",
  missionCompleted: "mission_completed",
  artifactSaved: "artifact_saved",
  skillDictionaryOpened: "skill_dictionary_opened",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/**
 * 1件送る。**失敗しても何も起きない。**
 *
 * 記録のために学習や登録を止めない。押した人から見て、
 * ここが原因で画面が変わることは無い。
 */
export function track(
  event: EventName,
  options: { lessonId?: string; amount?: number } = {},
): void {
  void sendLearningEvent({
    lessonId: options.lessonId,
    eventType: event,
    inputLength: options.amount ?? 0,
  });
}
