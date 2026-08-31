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
  /**
   * 次に試せるまでの秒数（`Retry-After`）。
   *
   * 「しばらく待ってください」だけだと、待つべきか壊れているのかが
   * 分からず、結局押し直される。残りを数字で出すために通しておく。
   * サーバーが言わなければ 0。
   */
  retryAfter: number;
}

export class ApiError extends Error implements ApiFailure {
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly fieldErrors: Record<string, string>;
  readonly retryAfter: number;

  constructor(failure: ApiFailure) {
    super(failure.detail);
    this.name = "ApiError";
    this.status = failure.status;
    this.code = failure.code;
    this.detail = failure.detail;
    this.fieldErrors = failure.fieldErrors;
    this.retryAfter = failure.retryAfter ?? 0;
  }
}

/**
 * `Retry-After` を秒として読む。無ければ 0。
 *
 * `headers` が無い応答も想定する。差し替えた応答（テストの偽物や、
 * 途中の proxy が返す簡易な応答）には付いていないことがあり、
 * そこで例外が出ると**本来の失敗の理由が握りつぶされる**
 * ——「メールアドレスかパスワードが違います」が
 * 「うまくいきませんでした」に化ける、という形で実際に踏んだ。
 * ここは補足の情報なので、読めなければ黙って 0 でよい。
 */
function retryAfterOf(response: Response): number {
  const raw = response?.headers?.get?.("Retry-After");
  if (!raw) return 0;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

const FALLBACK = "うまく届かなかったようです。少し待ってからお試しください。";

/** サーバーの返す `{ code, errors }` を、画面で使える形へ直す。 */
function toFailure(
  status: number,
  payload: unknown,
  retryAfter = 0,
): ApiFailure {
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

  return {
    status,
    code: body.code ?? "REQUEST_FAILED",
    detail,
    fieldErrors,
    retryAfter,
  };
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
      retryAfter: 0,
    });
  }

  if (response.status === 204) return undefined as T;

  let parsed = true;
  const payload = await response.json().catch(() => {
    parsed = false;
    return null;
  });

  if (!response.ok) {
    throw new ApiError(toFailure(response.status, payload, retryAfterOf(response)));
  }

  /*
    200 なのに JSON でない、を成功として扱わない。

    通信は成立しているので黙って通したくなるが、実際に返ってきているのは
    別物。**経路の設定が狂うと必ずこの形になる**——Vercel の rewrite が
    ずれて `/api/...` が画面側（index.html）へ流れる、間の proxy が
    エラーページを返す、配置の途中で古い静的ファイルだけが応答する。
    どれも 200 で返る。

    ここで null を返すと、呼んだ側は成功したつもりで `data.items` を
    触り、そこで初めて落ちる。落ちる場所が原因から遠いので、
    調べても経路の設定には辿り着けない。近いところで止める。
  */
  if (!parsed) {
    throw new ApiError({
      status: response.status,
      code: "NOT_JSON",
      detail: "サーバーからの応答を読めませんでした。時間をおいてお試しください。",
      fieldErrors: {},
      retryAfter: 0,
    });
  }

  return payload as T;
}

export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: "GET", signal });
}

export async function sendJson<T>(
  path: string,
  body: unknown,
  method: "POST" | "PATCH" | "DELETE" = "POST",
  signal?: AbortSignal,
): Promise<T> {
  return request<T>(path, {
    method,
    headers: await writeHeaders(),
    body: JSON.stringify(body ?? {}),
    signal,
  });
}
