/**
 * パスキー（WebAuthn）。
 *
 * 合言葉を覚えなくてよくする仕組み。端末の指紋・顔・暗証番号で本人を
 * 確かめ、その端末が持つ秘密鍵で署名する。**秘密鍵は端末から出ない。**
 *
 * ここがやること
 * --------------
 * サーバーと `navigator.credentials` のあいだで、形を詰め替えるだけ。
 * 判断は何もしない。誰かを決めるのも、署名を確かめるのもサーバーの仕事。
 *
 *   1. サーバーから挑戦文をもらう（base64url の JSON）
 *   2. ブラウザが分かる形（ArrayBuffer）へ直して渡す
 *   3. 返ってきた署名を base64url へ直してサーバーへ送る
 *
 * 詰め替えを間違えると「なぜか登録できない」だけの症状になり、
 * 原因が非常に分かりにくい。だから変換はこの1ファイルに閉じる。
 */

import { getJson, sendJson } from "./http";

const BASE = "/api/v1/accounts/passkey";

export interface PasskeySummary {
  id: number;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

export interface PasskeySignUpInput {
  email: string;
  displayName?: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
}

// ------------------------------------------------------------ 形の詰め替え

/**
 * base64url の文字列を、ブラウザが読めるバイト列にする。
 *
 * 返すのは ArrayBuffer。WebAuthn の受け口（BufferSource）は
 * SharedArrayBuffer を後ろに持つ配列を受け付けないので、
 * ArrayBuffer から作った配列であることを型でも示しておく。
 */
function toBytes(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

/** バイト列を base64url にする。末尾の = は落とす（決まりごと）。 */
function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** サーバーの「作ってください」を、ブラウザが読める形にする。 */
function toCreationOptions(options: Record<string, unknown>): CredentialCreationOptions {
  const source = options as {
    challenge: string;
    user: { id: string; name: string; displayName: string };
    excludeCredentials?: { id: string; type: string; transports?: AuthenticatorTransport[] }[];
  };

  return {
    publicKey: {
      ...(options as unknown as PublicKeyCredentialCreationOptions),
      challenge: toBytes(source.challenge),
      user: {
        ...source.user,
        id: toBytes(source.user.id),
      },
      excludeCredentials: (source.excludeCredentials ?? []).map((item) => ({
        ...item,
        id: toBytes(item.id),
        type: "public-key" as const,
      })),
    },
  };
}

/** サーバーの「署名してください」を、ブラウザが読める形にする。 */
function toRequestOptions(options: Record<string, unknown>): CredentialRequestOptions {
  const source = options as {
    challenge: string;
    allowCredentials?: { id: string; type: string; transports?: AuthenticatorTransport[] }[];
  };

  return {
    publicKey: {
      ...(options as unknown as PublicKeyCredentialRequestOptions),
      challenge: toBytes(source.challenge),
      allowCredentials: (source.allowCredentials ?? []).map((item) => ({
        ...item,
        id: toBytes(item.id),
        type: "public-key" as const,
      })),
    },
  };
}

/** ブラウザが返した資格情報を、サーバーへ送れる形にする。 */
function fromCredential(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response;

  const base = {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
  };

  if ("attestationObject" in response) {
    const made = response as AuthenticatorAttestationResponse;
    return {
      ...base,
      response: {
        clientDataJSON: toBase64Url(made.clientDataJSON),
        attestationObject: toBase64Url(made.attestationObject),
        transports: made.getTransports?.() ?? [],
      },
    };
  }

  const signed = response as AuthenticatorAssertionResponse;
  return {
    ...base,
    response: {
      clientDataJSON: toBase64Url(signed.clientDataJSON),
      authenticatorData: toBase64Url(signed.authenticatorData),
      signature: toBase64Url(signed.signature),
      userHandle: signed.userHandle ? toBase64Url(signed.userHandle) : null,
    },
  };
}

// ---------------------------------------------------------------- 使えるか

/**
 * この端末でパスキーを使えるか。
 *
 * 古い端末やブラウザでは使えない。使えない場所に「パスキーで始める」を
 * 出すと、押した人が必ず行き止まりに当たる。
 * サーバー側の設定（ドメイン）も要るので、両方を見る。
 */
export async function isPasskeyAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential || !navigator.credentials) return false;

  try {
    const { available } = await getJson<{ available: boolean }>(`${BASE}/support/`);
    return available;
  } catch {
    // サーバーに聞けなければ出さない。押して失敗するより、出ないほうがよい
    return false;
  }
}

/**
 * 利用者がやめたのか、本当に失敗したのか。
 *
 * 「やめる」を押しただけの人に「登録できませんでした」と出すと、
 * 壊れているように見える。ブラウザは中断も例外で知らせてくるので、
 * ここで見分ける。
 */
export function wasCancelled(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  );
}

// ---------------------------------------------------------------- 新規登録

/**
 * パスキーだけで登録する。合言葉は作らない。
 *
 * メールアドレスは受け取る。全部の端末を失ったときの逃げ道
 * （メールでのパスワード再設定）に要る。
 */
export async function signUpWithPasskey(
  input: PasskeySignUpInput,
): Promise<{ user: unknown; migration: unknown }> {
  const options = await sendJson<Record<string, unknown>>(`${BASE}/signup/options/`, {
    email: input.email,
    display_name: input.displayName ?? "",
    accept_terms: input.acceptTerms,
    accept_privacy: input.acceptPrivacy,
  });

  const credential = (await navigator.credentials.create(
    toCreationOptions(options),
  )) as PublicKeyCredential | null;

  if (!credential) throw new Error("パスキーを作成できませんでした。");

  return sendJson(`${BASE}/signup/verify/`, {
    credential: fromCredential(credential),
    label: deviceLabel(),
  });
}

// ------------------------------------------------------------------ ログイン

/** パスキーでログインする。何も打たなくてよい。 */
export async function signInWithPasskey(): Promise<{ user: unknown }> {
  const options = await sendJson<Record<string, unknown>>(`${BASE}/signin/options/`, {});

  const credential = (await navigator.credentials.get(
    toRequestOptions(options),
  )) as PublicKeyCredential | null;

  if (!credential) throw new Error("パスキーを確認できませんでした。");

  return sendJson(`${BASE}/signin/verify/`, {
    credential: fromCredential(credential),
  });
}

// ------------------------------------------------------------------ 管理

/** いまログインしている人に、この端末のパスキーを足す。 */
export async function addPasskey(label?: string): Promise<{ passkey: PasskeySummary }> {
  const options = await sendJson<Record<string, unknown>>(`${BASE}/register/options/`, {});

  const credential = (await navigator.credentials.create(
    toCreationOptions(options),
  )) as PublicKeyCredential | null;

  if (!credential) throw new Error("パスキーを作成できませんでした。");

  return sendJson(`${BASE}/register/verify/`, {
    credential: fromCredential(credential),
    label: label ?? deviceLabel(),
  });
}

export function listPasskeys(): Promise<{ passkeys: PasskeySummary[] }> {
  return getJson(`${BASE}/`);
}

export function removePasskey(id: number): Promise<void> {
  return sendJson(`${BASE}/${id}/`, {}, "DELETE");
}

/**
 * 端末につける名前の下書き。
 *
 * 複数持ったときに「どれを消せばよいか」が分かるようにするためのもの。
 * 当てにいくのは種類だけで、細かく当てようとしない
 * （利用者は設定からいつでも直せる）。
 */
function deviceLabel(): string {
  if (typeof navigator === "undefined") return "";
  const agent = navigator.userAgent;
  if (/iPhone/.test(agent)) return "iPhone";
  if (/iPad/.test(agent)) return "iPad";
  if (/Android/.test(agent)) return "Android";
  if (/Mac/.test(agent)) return "Mac";
  if (/Windows/.test(agent)) return "Windows";
  return "この端末";
}
