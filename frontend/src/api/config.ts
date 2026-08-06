/**
 * API の接続先。
 *
 * VITE_API_BASE_URL が無いときは、**いま開いているホスト**の 8000 番を使う。
 * 127.0.0.1 で開いているのに localhost へ投げると、
 * 名前解決（IPv6 の ::1）や CORS の許可オリジンがずれて届かなくなるため。
 *
 * 空文字を**明示的に**渡したときは「今開いているオリジンと同じ」を意味する。
 * 呼び出し側は `${apiBaseUrl()}/api/v1/...` と繋ぐので、空文字なら
 * `/api/v1/...` という相対URLになり、同じオリジンへ飛ぶ。
 * Vercel Services のように画面とAPIが1つのドメインに同居する構成で使う。
 * 未設定（undefined）と空文字を区別する必要があるため、真偽値ではなく
 * undefined かどうかで判定している。
 */
export function apiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (fromEnv !== undefined) return fromEnv;

  if (typeof window !== "undefined" && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}
