/**
 * 「ひとつの操作」に付ける合言葉。
 *
 * なぜ要るか
 * ----------
 * AI を呼ぶ回は、無料の持ち分を1つ使う。だから**同じ操作が2回数えられて
 * はいけない**。数えられうる場面は2つある。
 *
 *   1. 送信ボタンが連打された
 *   2. 送れたのに返事が届かず（回線が切れた等）、画面が送り直した
 *
 * 1つ目は画面側でも止められる（送信中はボタンを止める）。
 * ただし**画面だけに任せない**——タブを2つ開く、通信を手で送り直す、
 * といった道が残る。2つ目にいたっては画面側では防ぎようがない。
 * サーバーが「これはさっきと同じ操作だ」と分かる必要がある。
 *
 * そのための合言葉。同じ操作には同じもの、別の操作には別のものを付ける。
 * サーバーは同じ合言葉を見たら、作り直さずに前の結果をそのまま返す
 * （`apps/ai/views.py` の `_replay`）。
 *
 * 形は UUID
 * ---------
 * サーバーが `UUIDField` で受けるので、UUID でないものは 400 で捨てられる。
 * `crypto.randomUUID` があればそれを使い、無い環境（古いブラウザ、
 * https でない場所）でも落ちないように手で組む道を残す。
 */

export function newRequestId(): string {
  const api = globalThis.crypto;
  if (api && typeof api.randomUUID === "function") return api.randomUUID();

  /*
    後ろの道。`randomUUID` は安全な文脈（https や localhost）でしか
    生えないことがある。**ここで落ちると AI が呼べなくなる**ので、
    質は落ちても組めることを優先する。
  */
  const bytes = new Uint8Array(16);
  if (api && typeof api.getRandomValues === "function") {
    api.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  // 版（4）と種類（10xx）の印を立てる。UUID として読める形にするため
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
