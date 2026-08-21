/**
 * Credit の残高と、これまでの動き。
 *
 * ここは「見るだけ」の画面。増やす・使うはここからは起きない。
 *
 * ゲストのとき
 * ------------
 * 残高そのものを出さない。0 と出すと「使い切った」と読めるが、
 * 実際には**まだ持っていない**だけで、意味が違う。
 * スタンプは埋まっているので、それは失われていないことを伝えたうえで、
 * 受け取るには保存が要ることを案内する（行き止まりにしない）。
 */

import { useCallback, useEffect, useState } from "react";

import { Card } from "../AppShell";
import {
  claimRewards,
  fetchCredits,
  fetchStamps,
  type CreditState,
  type StampState,
} from "../../api/rewards";

export interface CreditPanelProps {
  /** 登録・ログインを開く。ゲストのときの受け皿 */
  onOpenAuth: () => void;
  onNotice: (message: string) => void;
}

export function CreditPanel({ onOpenAuth, onNotice }: CreditPanelProps) {
  const [credits, setCredits] = useState<CreditState | null>(null);
  const [stamps, setStamps] = useState<StampState | null>(null);
  const [error, setError] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [creditState, stampState] = await Promise.all([
        fetchCredits(),
        fetchStamps(),
      ]);
      setCredits(creditState);
      setStamps(stampState);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async () => {
    setClaiming(true);
    try {
      const result = await claimRewards();
      onNotice(
        result.granted > 0
          ? `${result.granted} Credit を受け取りました。`
          : "いま受け取れる特典はありません。",
      );
      await load();
    } catch {
      onNotice("受け取れませんでした。もう一度お試しください。");
    } finally {
      setClaiming(false);
    }
  };

  if (error) {
    return (
      <Card className="mt-5">
        <p className="text-sm text-ink-muted">読み込めませんでした。</p>
        <button
          type="button"
          className="btn-secondary mt-3"
          data-testid="credit-retry"
          onClick={() => void load()}
        >
          もう一度読み込む
        </button>
      </Card>
    );
  }

  if (!credits || !stamps) {
    return (
      <Card className="mt-5">
        <p className="text-sm text-ink-muted">読み込んでいます…</p>
      </Card>
    );
  }

  const waiting = stamps.unclaimed_waiting;

  return (
    <div data-testid="credit-panel">
      {credits.requires_account ? (
        /*
          ゲスト。残高は出さない。
          「まだ持っていない」と「使い切った」は別のことなので、
          0 という数字そのものを見せない。
        */
        <Card className="mt-5">
          <h2 className="text-base font-bold">Credit</h2>
          <p className="mt-2 text-sm leading-7 text-ink-muted">
            Credit は、画像生成など一部のAI機能に使えます。
          </p>
          {waiting ? (
            <p
              className="mt-3 rounded-card bg-brand-soft px-4 py-3 text-sm
                         leading-7 text-brand-dark"
              data-testid="credit-waiting"
            >
              スタンプは獲得しています。Credit を受け取るには、進捗の保存が必要です。
            </p>
          ) : (
            <p className="mt-3 text-sm leading-7 text-ink-muted">
              レッスンを進めてスタンプを集めると、節目で受け取れます。
            </p>
          )}
          <button
            type="button"
            className="btn-primary mt-4"
            data-testid="credit-signup"
            onClick={onOpenAuth}
          >
            進捗を保存する
          </button>
        </Card>
      ) : (
        <>
          <Card className="mt-5">
            <h2 className="text-base font-bold">いまの残高</h2>
            <p className="mt-2 flex items-baseline gap-2">
              <span
                className="text-3xl font-bold text-brand"
                data-testid="credit-balance"
              >
                {credits.balance}
              </span>
              <span className="text-sm text-ink-muted">Credits</span>
            </p>
            <dl className="mt-4 flex gap-6 text-sm">
              <div>
                <dt className="text-ink-muted">これまで獲得</dt>
                <dd className="mt-1 font-bold" data-testid="credit-earned">
                  {credits.lifetime_earned}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">これまで使用</dt>
                <dd className="mt-1 font-bold" data-testid="credit-spent">
                  {credits.lifetime_spent}
                </dd>
              </div>
            </dl>

            {waiting && (
              <div className="mt-4 rounded-card bg-brand-soft p-4">
                <p className="text-sm leading-7 text-brand-dark">
                  受け取れる特典があります。
                </p>
                <button
                  type="button"
                  className="btn-primary mt-3"
                  data-testid="credit-claim"
                  disabled={claiming}
                  onClick={() => void claim()}
                >
                  {claiming ? "受け取っています…" : "受け取る"}
                </button>
              </div>
            )}
          </Card>

          <Card className="mt-4">
            <h2 className="text-base font-bold">最近の動き</h2>
            {credits.transactions.length === 0 ? (
              <p className="mt-2 text-sm leading-7 text-ink-muted">
                まだありません。レッスンを進めると、節目で受け取れます。
              </p>
            ) : (
              <ul className="mt-3 space-y-3" role="list">
                {credits.transactions.map((row, index) => (
                  <li
                    key={`${row.created_at}-${index}`}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 flex-1 text-ink-muted">
                      {row.reason || (row.amount > 0 ? "獲得" : "使用")}
                    </span>
                    <span
                      className={
                        row.amount > 0
                          ? "shrink-0 font-bold text-brand"
                          : "shrink-0 font-bold text-ink"
                      }
                    >
                      {row.amount > 0 ? `+${row.amount}` : row.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {/* スタンプの埋まり具合。Credit の出どころが見えるようにする */}
      {stamps.paths.length > 0 && (
        <Card className="mt-4">
          <h2 className="text-base font-bold">スタンプ</h2>
          <ul className="mt-3 space-y-4" role="list">
            {stamps.paths.map((path) => (
              <li key={path.path_id} data-testid={`credit-path-${path.path_id}`}>
                <p className="text-sm font-bold">{path.title}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {path.done} / {path.total}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
