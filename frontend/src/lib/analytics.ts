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
  /*
    無料で使える分を使い切ったあと、その場で選んだ道。

    見たいのは「使い切った人のうち、何人が登録まで進み、何人が
    また明日を選んだか」。どちらも**行き止まりではない**のが
    この画面の狙いなので、両方を数える。

    使い切ったこと自体（`guest_text_limit_reached`）はここから
    送らない。断ったのはサーバーなので、サーバーが記録している
    （apps/ai/views.py の `_out_of_credits`）。こちらからも送ると
    二重に数える。
  */
  registerNowClicked: "register_now_clicked",
  waitTomorrowClicked: "wait_tomorrow_clicked",
  missionCompleted: "mission_completed",
  artifactSaved: "artifact_saved",
  skillDictionaryOpened: "skill_dictionary_opened",
  /*
    ホームを作り直したあと、効いたかどうかを見るための2本と、
    レッスンの山を数える1本（そちらは STEP_EVENT から送る）。

    見たい問いは1つだけ。**開いた人のうち、何人がその日の1本を
    始めたか。** ホームの並びを変えた（今日やることを記録より上へ、
    浮いた面を10枚から1枚へ）のは、この率を上げるためだった。

        homeOpened          … 分母。開いた回
        continueLessonClicked … 分子。今日の1本を押した回

    もう1つは、レッスンの山。**条件を足すと変わる**を見た回で、
    ここまで来れば続くと見ている場所。前は `step_viewed` に
    混ざっていて、通ったかどうかが分からなかった
    （送るのは `useCourseLesson.ts` の STEP_EVENT）。

    足さなかったもの
    ----------------
    `choice_selected` は `option_selected`、`progress_advanced` は
    `step_viewed`、`ai_result_viewed` は `first_result_generated`、
    `lesson_overview_viewed` は `outcome_preview_viewed` と
    ほぼ同じ出来事になる。**同じ出来事に2つ名前を作らない**——
    作ると、どちらを数えるかで結果が変わり、後から見た人は
    どちらが本当か決められない。
  */
  homeOpened: "home_opened",
  continueLessonClicked: "continue_lesson_clicked",
  /*
    Day を終えた瞬間（`components/course/DayComplete.tsx`）。

    見たいのは「終えた人のうち、何人がそのまま次の1本へ入ったか」。
    重ねた画面を出した意味があったかは、この2つでしか出ない。

    1本ごとの `lesson_completed` とは別物。あちらはレッスンの単位で、
    こちらは Day の区切り。同じ数になる日もあるが、意味が違う。
  */
  dayCompleted: "day_completed",
  dayCompleteNextClicked: "day_complete_next_clicked",
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
