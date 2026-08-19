/**
 * 登録・ログインの画面に置く、パスキーの入口。
 *
 * パスキーを**先に**出す。合言葉より速くて、覚えるものが無く、
 * 偽サイトに引っかからない。学習アプリの入口で、いちばん手が止まるのが
 * 「パスワードを決める」ところなので、そこを飛ばせる道を上に置く。
 *
 * 使えない端末では何も出さない。押すと必ず失敗するボタンは、
 * 無いより悪い（外部サービスでのログインと同じ考え方）。
 */

import { useEffect, useState } from "react";

import { ApiError } from "../../api/http";
import {
  isPasskeyAvailable,
  signInWithPasskey,
  signUpWithPasskey,
  wasCancelled,
} from "../../api/passkeys";
import { IconCaution, IconKey } from "../Icons";

export interface PasskeyPanelProps {
  /** 登録するのか、ログインするのか。 */
  mode: "signup" | "signin";
  /** 登録のときだけ要る。メールと同意はこちらで持っている。 */
  email?: string;
  displayName?: string;
  consent?: boolean;
  disabled?: boolean;
  /** 済んだら呼ぶ。呼ばれた側がログイン状態を取り直す。 */
  onDone: (message: string) => void;
}

export function PasskeyPanel({
  mode,
  email = "",
  displayName = "",
  consent = false,
  disabled = false,
  onDone,
}: PasskeyPanelProps) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void isPasskeyAvailable().then((ok) => alive && setAvailable(ok));
    return () => {
      alive = false;
    };
  }, []);

  if (!available) return null;

  const needsEmail = mode === "signup";
  const ready = needsEmail ? Boolean(email.trim()) && consent : true;

  async function run() {
    if (busy) return;
    setBusy(true);
    setFailure(null);

    try {
      if (mode === "signup") {
        await signUpWithPasskey({
          email,
          displayName,
          acceptTerms: consent,
          acceptPrivacy: consent,
        });
        onDone("パスキーで登録しました。次からは指紋や顔で入れます。");
      } else {
        await signInWithPasskey();
        onDone("ログインしました。続きから始められます。");
      }
    } catch (error) {
      /*
        「やめる」を押しただけの人に、失敗と言わない。
        ブラウザは中断も例外で知らせてくるので、そこを見分ける。
      */
      if (wasCancelled(error)) {
        setFailure(null);
      } else if (error instanceof ApiError) {
        setFailure(error.detail);
      } else {
        setFailure("パスキーを使えませんでした。もう一度お試しください。");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5" aria-labelledby="passkey-heading">
      <h3 id="passkey-heading" className="sr-only">
        パスキー
      </h3>

      <button
        type="button"
        data-testid="passkey-action"
        onClick={run}
        disabled={disabled || busy || !ready}
        className="flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-cta
                   border border-brand bg-surface px-6 py-3 text-base font-bold
                   text-brand-dark transition hover:bg-brand-soft
                   disabled:cursor-not-allowed disabled:border-line
                   disabled:text-ink-muted"
      >
        <IconKey className="h-5 w-5 shrink-0" />
        {busy
          ? "確認しています…"
          : mode === "signup"
            ? "パスキーで登録する"
            : "パスキーでログイン"}
      </button>

      <p className="mt-2 text-center text-xs leading-6 text-ink-muted">
        {mode === "signup"
          ? "パスワードを決めずに、指紋や顔で登録できます。"
          : "メールもパスワードも入力せずに入れます。"}
      </p>

      {needsEmail && !ready && (
        <p className="mt-1 text-center text-xs text-ink-muted">
          メールアドレスの入力と同意のあとに使えます。
        </p>
      )}

      {failure && (
        <p
          role="alert"
          data-testid="passkey-error"
          className="mt-3 flex items-start gap-2 rounded-card bg-caution-soft px-4 py-3
                     text-sm leading-6 text-caution"
        >
          <IconCaution className="mt-0.5 h-4 w-4 shrink-0" />
          {failure}
        </p>
      )}

      {/* 区切り。下は今までどおりの合言葉の道 */}
      <div className="mt-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-muted">または</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    </section>
  );
}
