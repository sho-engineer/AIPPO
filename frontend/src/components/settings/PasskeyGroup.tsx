/**
 * 設定の「パスキー」。
 *
 * やることは2つだけ。**この端末に足す**ことと、**要らなくなったものを消す**こと。
 *
 * 複数持てるようにしてある。スマホと仕事のパソコンで別々に作るのが普通で、
 * 1つに限ると端末を変えたときに入れなくなる。
 *
 * 最後の1本は、合言葉が無いあいだ消せない。消した瞬間にどこからも
 * 入れなくなるため——サーバー側でも同じことを見ている
 * （apps/accounts/passkey_views.py）。ここで止めるのは、
 * 押す前に理由が読めるようにするため。
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../../api/http";
import {
  addPasskey,
  isPasskeyAvailable,
  listPasskeys,
  removePasskey,
  wasCancelled,
  type PasskeySummary,
} from "../../api/passkeys";
import { IconCaution, IconKey } from "../Icons";
import { SettingsGroup } from "./Controls";

export interface PasskeyGroupProps {
  onNotice: (message: string) => void;
}

/** 「2026年8月18日」の形。時刻までは出さない（要らない）。 */
function onDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function PasskeyGroup({ onNotice }: PasskeyGroupProps) {
  const [available, setAvailable] = useState(false);
  const [keys, setKeys] = useState<PasskeySummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const { passkeys } = await listPasskeys();
      setKeys(passkeys);
    } catch {
      // 取れなくても、足す道は残しておく
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void isPasskeyAvailable().then((ok) => {
      if (!alive) return;
      setAvailable(ok);
      if (ok) void reload();
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  if (!available) return null;

  async function add() {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await addPasskey();
      await reload();
      onNotice("この端末にパスキーを登録しました。");
    } catch (error) {
      if (wasCancelled(error)) {
        setFailure(null);
      } else if (error instanceof ApiError) {
        setFailure(error.detail);
      } else {
        setFailure("パスキーを登録できませんでした。");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(key: PasskeySummary) {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await removePasskey(key.id);
      await reload();
      onNotice("パスキーを削除しました。");
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.detail
          : "パスキーを削除できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsGroup
      title="パスキー"
      description="指紋や顔で入れるようにします。パスワードを覚える必要がなくなります。"
    >
      {keys.length === 0 ? (
        <p className="text-sm leading-7 text-ink-muted">
          まだ登録されていません。この端末で登録すると、次からはパスワードを
          入力せずに入れます。
        </p>
      ) : (
        <ul className="space-y-0" role="list" data-testid="passkey-list">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex items-center gap-3 border-b border-line py-3 last:border-b-0"
            >
              <IconKey className="h-[1.125rem] w-[1.125rem] shrink-0 text-brand" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">
                  {key.label || "パスキー"}
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {onDay(key.created_at)}に登録
                  {key.last_used_at && `・最後に使ったのは${onDay(key.last_used_at)}`}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(key)}
                data-testid={`passkey-remove-${key.id}`}
                className="shrink-0 rounded-badge px-3 py-1.5 text-xs text-caution
                           transition hover:bg-caution-soft disabled:cursor-not-allowed
                           disabled:text-ink-muted"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      {failure && (
        <p
          role="alert"
          data-testid="passkey-settings-error"
          className="mt-3 flex items-start gap-2 rounded-card bg-caution-soft px-4 py-3
                     text-sm leading-6 text-caution"
        >
          <IconCaution className="mt-0.5 h-4 w-4 shrink-0" />
          {failure}
        </p>
      )}

      <button
        type="button"
        onClick={add}
        disabled={busy}
        data-testid="passkey-add"
        className="mt-4 flex min-h-[2.75rem] items-center justify-center gap-2
                   rounded-cta border border-brand px-5 py-2 text-sm font-bold
                   text-brand-dark transition hover:bg-brand-soft
                   disabled:cursor-not-allowed disabled:border-line
                   disabled:text-ink-muted"
      >
        <IconKey className="h-4 w-4 shrink-0" />
        {busy ? "確認しています…" : "この端末にパスキーを登録"}
      </button>
    </SettingsGroup>
  );
}
