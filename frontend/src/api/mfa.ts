/**
 * 2段階認証（認証アプリ）。
 *
 * 入れたい人だけが設定から入れる。登録の時点では求めない。
 *
 * 秘密は登録の途中でしか出てこない
 * --------------------------------
 * `setup` の返事にだけ入っている。端末に残さない——残すと、
 * 画面を閉じたあとも取り出せる場所が増える。
 *
 * 予備の合言葉も同じ
 * ------------------
 * `confirm` の返事で1回だけ渡される。**渡したあとは二度と出ない**
 * ので、画面はその場で写してもらう。
 */

import { getJson, sendJson } from "./http";

export interface MfaState {
  enabled: boolean;
  /** 設定の途中で離れている。続きから戻れる */
  pending: boolean;
  recovery_codes_left: number;
}

export interface MfaSetup {
  /** 手で入れるための秘密。4文字ずつ空けてある */
  secret: string;
  /** 携帯で開くと、そのまま認証アプリが開く */
  uri: string;
}

export interface MfaConfirmed {
  enabled: boolean;
  /** 1回だけ渡される。無くすと、端末を替えたときに締め出される */
  recovery_codes: string[];
}

const BASE = "/api/v1/accounts/mfa";

export function fetchMfaState(signal?: AbortSignal): Promise<MfaState> {
  return getJson<MfaState>(`${BASE}/`, signal);
}

export function startMfaSetup(): Promise<MfaSetup> {
  return sendJson<MfaSetup>(`${BASE}/setup/`, {});
}

export function confirmMfa(code: string): Promise<MfaConfirmed> {
  return sendJson<MfaConfirmed>(`${BASE}/confirm/`, { code });
}

export function disableMfa(code: string): Promise<{ enabled: boolean }> {
  return sendJson<{ enabled: boolean }>(`${BASE}/disable/`, { code });
}

/** ログインの続き。合言葉が合っていた人だけが呼べる。 */
export function verifyMfa(code: string): Promise<{
  verified: boolean;
  recovery_used: boolean;
  recovery_codes_left: number;
}> {
  return sendJson(`${BASE}/verify/`, { code });
}
