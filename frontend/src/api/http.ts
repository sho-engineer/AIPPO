/**
 * サーバーへ送るときの共通の作法。
 *
 * ここにあるのは2つだけ。
 *
 * - Cookie を必ず一緒に送る（learner_key と、ログイン中はセッション）
 * - 書き込みのときは CSRF の合言葉を添える
 *
 * 合言葉を添える理由
 * ------------------
 * ログイン中の人がよそのサイトを開くと、そのサイトから AIPPO へ
 * POST を投げられる。Cookie は自動でついていくので、本人の操作に見える。
 * 合言葉は Cookie とは別に **ヘッダ** で送るため、よそのサイトからは
 * 用意できない。これで「本人がこの画面から押した」ことが分かる。
 *
 * 合言葉そのものは秘密ではない（script から読める Cookie に入る）。
 * 秘密なのはセッションのほうで、そちらは HttpOnly で読めない。
 */

import { apiBaseUrl } from "./config";

const CSRF_COOKIE = "csrftoken";
const CSRF_HEADER = "X-CSRFToken";

/** ブラウザの Cookie から1つ取り出す。無ければ空文字。 */
function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const found = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}

/**
 * 合言葉を確実に持っている状態にする。
 *
 * Django は「1度でも聞かれるまで」Cookie を置かない。
 * 初回だけこの1往復が入るが、以後は Cookie が残るので発生しない。
 */
export async function ensureCsrfToken(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;

  try {
    await fetch(`${apiBaseUrl()}/api/v1/accounts/csrf/`, {
      credentials: "include",
    });
  } catch {
    // 取れなくても POST は試す。ログインしていなければ照合されない
  }
  return readCookie(CSRF_COOKIE);
}

/** 書き込みに添えるヘッダ。 */
export async function writeHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const token = await ensureCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  if (token) headers[CSRF_HEADER] = token;
  return headers;
}

export interface ApiFailure {
  status: number;
  code: string;
  /** 学習者へそのまま見せてよい文。専門用語を含めない。 */
  detail: string;
  /** 入力欄ごとの指摘。項目名 → 文言。 */
  fieldErrors: Record<string, string>;
}

export class ApiError extends Error implements ApiFailure {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly fieldErrors: Record<string, string>;

  constructor(failure: ApiFailure) {
    super(failure.detail);
    this.name = "ApiError";
    this.status = failure.status;
    this.code = failure.code;
    this.detail = failure.detail;
    this.fieldErrors = failure.fieldErrors;
  }
}

const FALLBACK = "うまく届かなかったようです。少し待ってからお試しください。";

/** サーバーの返す `{ code, errors }` を、画面で使える形へ直す。 */
function toFailure(status: number, payload: unknown): ApiFailure {
  const body = (payload ?? {}) as {
    code?: string;
    errors?: Record<string, unknown>;
  };
  const fieldErrors: Record<string, string> = {};

  for (const [field, messages] of Object.entries(body.errors ?? {})) {
    const first = Array.isArray(messages) ? messages[0] : messages;
    if (typeof first === "string") fieldErrors[field] = first;
  }

  // detail が無いときは、最初の指摘をそのまま見出しに使う
  const detail = fieldErrors.detail ?? Object.values(fieldErrors)[0] ?? FALLBACK;

  return { status, code: body.code ?? "REQUEST_FAILED", detail, fieldErrors };
}

async function request<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      credentials: "include",
      ...init,
    });
  } catch {
    // 通信自体が届かなかった。CORS の漏れでもここに来る
    throw new ApiError({
      status: 0,
      code: "NETWORK",
      detail: "通信できませんでした。電波のよい場所でお試しください。",
      fieldErrors: {},
    });
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(toFailure(response.status, payload));
  return payload as T;
}

export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: "GET", signal });
}

export async function sendJson<T>(
  path: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(path, {
    method,
    headers: await writeHeaders(),
    body: JSON.stringify(body ?? {}),
    signal,
  });
}
