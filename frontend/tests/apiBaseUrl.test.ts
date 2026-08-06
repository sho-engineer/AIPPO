/**
 * API の接続先の決め方。
 *
 * ここが狂うと、画面は出るのに一切通信できない——という一番わかりにくい
 * 壊れ方をする。特に「空文字」の扱いが要で、Vercel Services のように
 * 画面とAPIが同じドメインに同居する構成では、空文字を渡して
 * `/api/v1/...` という相対URLにしたい。
 *
 * 以前は `if (fromEnv)` で見ていたため、空文字が「未設定」と同じ扱いになり、
 * 本番でも `https://<今のホスト>:8000` へ投げていた。Vercel に 8000 番は
 * 無いので、全部つながらない。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { apiBaseUrl } from "../src/api/config";

/** import.meta.env.VITE_API_BASE_URL を一時的に差し替える。 */
function withEnv(value: string | undefined, run: () => void) {
  if (value === undefined) {
    vi.stubEnv("VITE_API_BASE_URL", undefined as unknown as string);
  } else {
    vi.stubEnv("VITE_API_BASE_URL", value);
  }
  run();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("APIの接続先", () => {
  it("URLが指定されていればそれを使う", () => {
    withEnv("https://api.example.com", () => {
      expect(apiBaseUrl()).toBe("https://api.example.com");
    });
  });

  it("空文字なら「同じオリジン」を意味する（相対URLになる）", () => {
    withEnv("", () => {
      // 呼び出し側は `${apiBaseUrl()}/api/v1/...` と繋ぐ。
      // 空文字ならそのまま `/api/v1/...` になり、今開いているドメインへ飛ぶ。
      expect(apiBaseUrl()).toBe("");
      expect(`${apiBaseUrl()}/api/v1/ai/generate/`).toBe("/api/v1/ai/generate/");
    });
  });

  it("未設定なら、開いているホストの8000番に落とす（手元の開発用）", () => {
    withEnv(undefined, () => {
      expect(apiBaseUrl()).toBe(`${window.location.protocol}//${window.location.hostname}:8000`);
    });
  });
});
