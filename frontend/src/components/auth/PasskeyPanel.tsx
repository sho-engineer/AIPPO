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
  browserReason,
  wasCancelled,
} from "../../api/passkeys";
import { EVENTS, track } from "../../lib/analytics";
import { IconCaution, IconKey } from "../Icons";

export interface PasskeyPanelProps {
  /** 登録するのか、ログインするのか。 */
  mode: "signup" | "signin";
  /** 登録のときだけ要る。メールと同意はこちらで持っている。 */
  email?: string;
  displayName?: string;
  consent?: boolean;
  disabled?: boolean;
  /**
   * 前置きも区切り線も出さない。
   *
   * 登録では、この panel は「パスキーで登録する」1枚の画面の中に置く。
   * 何をする画面かは見出しに書いてあるので、ここで繰り返すと同じ話が
   * 2回出る。区切り線も、下に続くものが無いところでは線だけが残る。
   */
  bare?: boolean;
  /** 済んだら呼ぶ。呼ばれた側がログイン状態を取り直す。 */
  onDone: (message: string) => void;
}

/**
 * この端末でパスキーを使えるか。
 *
 * 入口のボタンを出す側にも要る。使えないのに「パスキーで続ける」を
 * 見せると、押した人がその先で行き止まりに当たる——押す前に消しておく。
 */
export function usePasskeyAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let alive = true;
    void isPasskeyAvailable().then((ok) => alive && setAvailable(ok));
    return () => {
      alive = false;
    };
  }, []);

  return available;
}

export function PasskeyPanel({
  mode,
  email = "",
  displayName = "",
  consent = false,
  disabled = false,
  bare = false,
  onDone,
}: PasskeyPanelProps) {
  const available = usePasskeyAvailable();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

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
      } else {
        /*
          やめた人は数えない。数えると「使えない端末が多い」ように
          見えて、直す場所を取り違える。
        */
        if (mode === "signup") track(EVENTS.passkeyRegistrationFailed);
        setFailure(
          error instanceof ApiError ? error.detail : browserReason(error),
        );
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

      {/*
        登録では、この panel を「パスキーで登録する」画面の中に置く。
        何をする画面かは見出しに書いてあるので、ここでは繰り返さない。
      */}
      {mode === "signin" && !bare && (
        <p className="mt-2 text-center text-xs leading-6 text-ink-muted">
          メールもパスワードも入力せずに入れます。
        </p>
      )}

      {needsEmail && !ready && (
        <p className="mt-1 text-center text-xs text-ink-muted">
          メールアドレスを入れると押せます。
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
      {!bare && (
        <div className="mt-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-ink-muted">または</span>
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
    </section>
  );
}
