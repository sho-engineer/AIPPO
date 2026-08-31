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
  /*
    登録までの道のりを、押した順に数える。

    いちばん見たいのは「ゲストで試した人のうち、何人が登録まで来て、
    元のレッスンへ戻れたか」。前は登録の**始まり**と**終わり**しか
    無く、あいだで何人落ちたのか、どの入口で落ちたのかが見えなかった。
  */
  /*
    名前は**サーバーが持っている一覧から選ぶ**
    （backend/apps/lessons/models.py の LearningEventType）。
    無い名前を送ると 400 で黙って捨てられ、集計を見るまで
    気づけない——過去に5種類がそうなっていた。

    誘いを出した回は、既にある `signup_prompt_viewed` を使う。
    同じ出来事に2つ名前を作らない。

    ログインできた回（`login_completed`）は**送らない**。
    サーバーが自分で記録している（accounts/views.py）ので、
    こちらからも送ると二重に数える。
  */
  authPromptShown: "signup_prompt_viewed",
  authGoogleClicked: "auth_google_clicked",
  authPasskeyClicked: "auth_passkey_clicked",
  returnedToLesson: "returned_to_lesson",
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
