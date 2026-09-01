/**
 * この端末の暦を、サーバーへ必ず伝える。
 *
 * 何のために送るか
 * ----------------
 * 毎日の無料ぶんを配る境目。サーバーは「最後に使ってから24時間後」
 * ではなく、**その人の 00:00** で配る。ここが届かないと、サーバーは
 * 接続元から推すしかなく、VPN を通している人は住んでいる場所と
 * 違う暦で数えられる。
 *
 * ここで見張るもの
 * ----------------
 * 1. 読むだけの要求にも付くこと
 * 2. **AIを呼ぶ道にも付くこと**（そこだけ別の道を通っている）
 * 3. 付けたことで、CSRF の合言葉を落としていないこと
 * 4. `Intl` が無い環境で、通信そのものを壊さないこと
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getJson, sendJson, writeHeaders } from "../src/api/http";

const HEADER = "X-AIPPO-Timezone";

function headersOf(call: unknown[]): Record<string, string> {
  const init = call[1] as RequestInit;
  return (init.headers ?? {}) as Record<string, string>;
}

function ok(): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({}),
  } as unknown as Response;
}

describe("暦をサーバーへ伝える", () => {
  beforeEach(() => {
    document.cookie = "csrftoken=token-abc; path=/";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(ok());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("読むだけの要求にも付く", async () => {
    await getJson("/api/v1/catalog/courses/");

    const spy = vi.mocked(globalThis.fetch);
    expect(headersOf(spy.mock.calls[0])[HEADER]).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });

  it("書き込みにも付く", async () => {
    await sendJson("/api/v1/lessons/sessions/", { lesson_id: "rewrite_text" });

    const spy = vi.mocked(globalThis.fetch);
    const sent = spy.mock.calls.map((call) => headersOf(call)[HEADER]);
    expect(sent).toContain(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("AIを呼ぶ道のヘッダにも入っている", async () => {
    /*
      api/ai.ts は返ってきた本文を自前で読み分ける都合で fetch を
      直に叩いていて、ヘッダは writeHeaders() からしか受け取らない。
      **いちばん暦が要る道**なので、ここが落ちていないことを見る。
    */
    const headers = await writeHeaders();

    expect(headers[HEADER]).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });

  it("合言葉と本文の型を落とさない", async () => {
    const headers = await writeHeaders();

    expect(headers["X-CSRFToken"]).toBe("token-abc");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("ずれの分数ではなく、席の名前を送る", async () => {
    /*
      夏時間のある地域では、ずれが年に2回変わる。名前で送れば、
      変換のたびに正しいずれが選ばれる。
    */
    const headers = await writeHeaders();

    // 「+09:00」「540」のような、ずれそのものを送っていないこと。
    // 名前の形は環境で変わる（検査環境では "UTC" になる）ので、
    // 形ではなく**数ではないこと**を見る
    expect(headers[HEADER]).not.toMatch(/^[+-]?\d/);
    expect(headers[HEADER]).toMatch(/^[A-Za-z][A-Za-z0-9_+/-]*$/);
  });

  it("Intl が読めない環境でも、通信を壊さない", async () => {
    // ごく古い環境。暦は送らず、サーバーが接続元から推す
    const broken = vi
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation((() => {
        throw new Error("no Intl");
      }) as unknown as typeof Intl.DateTimeFormat);

    const headers = await writeHeaders();

    expect(headers[HEADER]).toBeUndefined();
    expect(headers["X-CSRFToken"]).toBe("token-abc");
    broken.mockRestore();
  });
});
