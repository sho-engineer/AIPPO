/**
 * 選べる AI モデルの一覧を、サーバーから受け取る。
 *
 * モデル名を画面に書かないための口（GET /api/v1/ai/models/）。
 * 名前は環境や契約で変わるし、どれを勧めるかは運用の判断で、
 * 見た目の都合ではない。画面は受け取ったものを並べるだけにする。
 *
 * 取れなかったときは空で返す。設定画面はそれでも開き、
 * 「おまかせ」だけが残る。ここで例外を投げると、
 * モデルを選ぶ気のない人まで設定画面を開けなくなる。
 */

import { apiBaseUrl } from "./config";

export interface AiModelChoice {
  id: string;
  label: string;
  note: string;
  provider: string;
  /** いまサーバーが既定にしているもの。 */
  recommended: boolean;
}

export async function fetchModels(signal?: AbortSignal): Promise<AiModelChoice[]> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/v1/ai/models/`, {
      credentials: "include",
      signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { models?: unknown };
    if (!Array.isArray(payload.models)) return [];

    // 形が違うものは黙って捨てる。1件壊れていても残りは出す
    return payload.models.filter(
      (item): item is AiModelChoice =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as AiModelChoice).id === "string" &&
        typeof (item as AiModelChoice).label === "string",
    );
  } catch {
    return [];
  }
}
