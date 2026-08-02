/**
 * API の接続先。
 *
 * VITE_API_BASE_URL が無いときは、**いま開いているホスト**の 8000 番を使う。
 * 127.0.0.1 で開いているのに localhost へ投げると、
 * 名前解決（IPv6 の ::1）や CORS の許可オリジンがずれて届かなくなるため。
 */
export function apiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined" && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}
