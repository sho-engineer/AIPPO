/**
 * 200 なのに JSON でない応答。
 *
 * ありえない話ではない。むしろこのアプリが実際に踏んだ形で、
 * **経路の設定が狂うと必ずこうなる**。
 *
 *   - Vercel の rewrite がずれて、`/api/...` が画面側（index.html）へ流れる
 *   - 間に proxy が挟まり、エラーページや同意画面を返す
 *   - 配置の途中で、古い静的ファイルだけが応答する
 *
 * どれも「届いていない」のではなく **200 で別物が返る**。
 * 通信が失敗していないので、素直に書くと成功として扱ってしまう。
 *
 * ここで守るのは2つ。
 *
 *   1. 黙って null を返さないこと。
 *      返すと、呼んだ側が `data.items` を触った時点で落ちる。
 *      落ちる場所が原因から遠いので、調べても経路の設定に辿り着けない。
 *   2. 生の SyntaxError を投げないこと。
 *      アプリは LessonApiError / ApiError を前提に「もう一度おくって
 *      みましょう」を出している。型の違う例外はその道を素通りする。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getJson } from "../src/api/http";
import { LessonApiError, rewriteText } from "../src/api/lesson";

/** 経路がずれて画面側へ流れたときに返るもの。 */
const HTML = "<!doctype html><html><body><div id=\"root\"></div></body></html>";

function servesHtml(status = 200) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      ({
        ok: status < 400,
        status,
        json: async () => {
          throw new SyntaxError("Unexpected token '<'");
        },
        text: async () => HTML,
      }) as unknown as Response,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("共通の読み口（http.ts）", () => {
  it("200でJSONでなければ、失敗として投げる", async () => {
    /*
      null を返してはいけない。呼んだ側は成功したつもりで
      `data.items` を触り、そこで初めて落ちる。原因から遠い場所で
      落ちるので、経路の設定違いだと気づけない。
    */
    servesHtml();

    await expect(getJson("/api/v1/progress/")).rejects.toBeInstanceOf(ApiError);
  });

  it("その失敗は、人に見せられる文言を持っている", async () => {
    servesHtml();

    await expect(getJson("/api/v1/progress/")).rejects.toMatchObject({
      detail: expect.stringMatching(/./),
    });
  });
});

describe("レッスンの読み口（lesson.ts）", () => {
  it("200でJSONでなければ、アプリの例外として投げる", async () => {
    /*
      生の SyntaxError だと、画面の「もう一度おくってみましょう」に
      繋がらない。名前の付いた例外にして、扱いを1本にする。

      見るのは AI 実行のような、失敗が利用者に届かないと困る経路。
      再開位置の取得（fetchSessionState）は取れなければ null に倒す
      作りなので、ここでは対象にしない。
    */
    servesHtml();

    const failing = rewriteText({
      originalText: "本文",
      audience: "上司",
      tone: "polite",
      length: "standard",
    });

    await expect(failing).rejects.toBeInstanceOf(LessonApiError);
    await expect(failing).rejects.not.toBeInstanceOf(SyntaxError);
  });
});
