/**
 * 学習の記録を読む。
 *
 * 「学習記録」（何を学んだか）と「マイ成果物」（何を作ったか）の
 * 2画面が、同じ1本の記録から別の面を出す。取り方をここに1つ置いて、
 * 画面ごとに書き分けない——書き分けると、片方だけ壊れ方が違う。
 *
 * 形が違うものが返ることがある
 * ----------------------------
 * 前段のプロキシ、設定違いのエンドポイント、古い版のサーバー。
 * そのまま入れると `artifacts.length` で落ち、**画面ごと真っ白**になる。
 * 200 が返っている以上「読み込めませんでした」でもないので、
 * 足りない配列は空として扱い、画面は出す。
 */

import { useCallback, useEffect, useState } from "react";

import { fetchHistory, type History } from "../../api/history";

export interface HistoryState {
  history: History | null;
  failed: boolean;
  /** もう一度読みにいく。押した場所に置くために返している */
  reload: () => void;
}

export function useHistory(): HistoryState {
  const [history, setHistory] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const body = await fetchHistory(signal);
      setHistory({
        artifacts: Array.isArray(body?.artifacts) ? body.artifacts : [],
        sessions: Array.isArray(body?.sessions) ? body.sessions : [],
        ai_quota: body?.ai_quota ?? { limit: null, used: 0, remaining: null },
      });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { history, failed, reload: () => void load() };
}

/** 「8月18日 15:03」の形。年は今年なら出さない（読む量を減らす）。 */
export function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const year = date.getFullYear() === now.getFullYear() ? "" : `${date.getFullYear()}年`;
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${year}${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}
