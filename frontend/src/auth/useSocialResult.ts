/**
 * 外部サービスから戻ってきたときの知らせ。
 *
 * サーバーは画面へ戻すときに、短い名前だけを URL へ載せる。
 *
 *     /?social=google&social_result=signin
 *     /?social_error=denied
 *
 * **文はサーバーから渡さない。** 渡す形にすると、URL に載った文字が
 * そのまま画面に出る作りになり、差し込みの入口になる。
 * ここでは名前を固定文へ引き当てるだけで、知らない名前は既定文にする。
 *
 * 読んだら URL から消す。残しておくと、読み込み直すたびに
 * 同じ知らせが出る。共有された URL でも出てしまう。
 */

import { useEffect, useState } from "react";

import { SOCIAL_COPY } from "../content/ui";
import { EVENTS, track } from "../lib/analytics";

export interface SocialResult {
  kind: "ok" | "error";
  message: string;
}

export function useSocialResult(): {
  result: SocialResult | null;
  dismiss: () => void;
} {
  const [result, setResult] = useState<SocialResult | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const failure = params.get("social_error");
    const outcome = params.get("social_result");
    if (!failure && !outcome) return;

    /*
      外部ログインで落ちた回を数える。

      押した人には固定文しか出さない（URL の中身を画面に出さない）ので、
      **どこで落ちているかは記録にしか残らない**。設定の取り違えは
      配置のたびに起こりうるので、気づける形にしておく。

      理由の名前は載せない。URL から来た文字列なので、そのまま
      記録に流すと、そこが差し込みの入口になる。
    */
    if (failure) track(EVENTS.googleAuthFailed);

    setResult(
      failure
        ? {
            kind: "error",
            // 知らない名前は既定文へ。URL の中身を画面に出さない
            message: SOCIAL_COPY.errors[failure] ?? SOCIAL_COPY.fallbackError,
          }
        : {
            kind: "ok",
            message: SOCIAL_COPY.results[outcome ?? ""] ?? SOCIAL_COPY.results.signin,
          },
    );

    // 読んだら消す。読み込み直しても、もう出ない
    params.delete("social_error");
    params.delete("social_result");
    params.delete("social");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, []);

  return { result, dismiss: () => setResult(null) };
}
