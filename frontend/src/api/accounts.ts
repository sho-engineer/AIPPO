/**
 * アカウントの API クライアント。
 *
 * 合言葉（トークン）はここを通っても画面に現れない。ログイン状態は
 * サーバーが HttpOnly の Cookie で持つ。画面が知るのは
 * 「いまログインしているか」「誰か」「どれだけ進んだか」だけ。
 *
 * localStorage には何も置かない。置いた瞬間、画面に差し込まれた
 * script から読み取れる状態になる。
 */

import { getJson, sendJson } from "./http";

const BASE = "/api/v1/accounts";

export interface AccountUser {
  email: string;
  display_name: string;
  email_verified: boolean;
  terms_version: string;
  joined_at: string;
  /** 学習リマインダーを受け取るか。送るのはサーバーなので、正はこちら。 */
  remind_study: boolean;
}

export interface Progress {
  completed: number;
  in_progress: number;
  /** 結びついている端末の数。増えるのはログインしたときだけ。 */
  devices: number;
}

export interface MeResponse {
  authenticated: boolean;
  user?: AccountUser;
  progress?: Progress;
}

/** 登録前の学習を引き継げたか。画面の言い方を変えるために使う。 */
export interface MigrationResult {
  linked: boolean;
  sessions: number;
  already_linked: boolean;
  /** もう一度やれば直る見込みがあるとき true。 */
  retryable?: boolean;
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName?: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
}

export function fetchMe(signal?: AbortSignal): Promise<MeResponse> {
  return getJson<MeResponse>(`${BASE}/me/`, signal);
}

export function signUp(
  input: SignUpInput,
): Promise<{ user: AccountUser; migration: MigrationResult }> {
  return sendJson(`${BASE}/signup/`, {
    email: input.email.trim(),
    password: input.password,
    display_name: input.displayName ?? "",
    accept_terms: input.acceptTerms,
    accept_privacy: input.acceptPrivacy,
  });
}

export function signIn(
  email: string,
  password: string,
): Promise<{ user: AccountUser }> {
  return sendJson(`${BASE}/signin/`, { email: email.trim(), password });
}

export function signOut(): Promise<{ signed_out: boolean }> {
  return sendJson(`${BASE}/signout/`, {});
}

export function updateDisplayName(
  displayName: string,
): Promise<{ user: AccountUser }> {
  return sendJson(`${BASE}/profile/`, { display_name: displayName }, "PATCH");
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ changed: boolean }> {
  return sendJson(`${BASE}/password/change/`, {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

/**
 * 再設定の案内を送る。
 *
 * 登録の無いメールでも同じ応答が返る。返し分けると、
 * どのメールが登録済みかを外から調べられてしまう。
 */
export function requestPasswordReset(
  email: string,
): Promise<{ sent: boolean; detail: string }> {
  return sendJson(`${BASE}/password/reset/`, { email: email.trim() });
}

export function confirmPasswordReset(
  uid: string,
  token: string,
  newPassword: string,
): Promise<{ changed: boolean }> {
  return sendJson(`${BASE}/password/reset/confirm/`, {
    uid,
    token,
    new_password: newPassword,
  });
}

export function verifyEmail(
  uid: string,
  token: string,
): Promise<{ verified: boolean }> {
  return sendJson(`${BASE}/email/verify/`, { uid, token });
}

export function deleteLearningData(): Promise<{ deleted: boolean; rows: number }> {
  return sendJson(`${BASE}/learning-data/delete/`, {});
}

export function deleteAccount(): Promise<{ deleted: boolean }> {
  return sendJson(`${BASE}/delete/`, {});
}

export interface SocialProvider {
  name: "google" | "line";
  label: string;
  /** ここへ画面ごと移動する。合言葉は画面を通らない。 */
  start_url: string;
}

/**
 * 使える連携先。
 *
 * 設定が入っている先だけが返る。返らなかった先のボタンは出さない。
 * 押すと落ちるボタンは、無いより悪い。
 */
export function fetchSocialProviders(
  signal?: AbortSignal,
): Promise<{ providers: SocialProvider[] }> {
  return getJson(`${BASE}/social/providers/`, signal);
}


/**
 * 学習リマインダーを受け取るかを切り替える。
 *
 * 端末（localStorage）ではなくサーバーへ保存する。送るのはサーバーなので、
 * 端末にだけ持たせると「切ったのに届く」ことになる。
 */
export function updateReminders(remindStudy: boolean): Promise<{ user: AccountUser }> {
  return sendJson(`${BASE}/profile/`, { remind_study: remindStudy }, "PATCH");
}
