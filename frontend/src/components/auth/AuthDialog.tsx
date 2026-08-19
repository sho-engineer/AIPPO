/**
 * 登録・ログイン・パスワード再設定。
 *
 * 3つを1枚にまとめてあるのは、途中で行き先が変わるため。
 * 「登録しよう」と開いた人の半分は、実は登録済みで思い出せていない。
 * 別画面にすると、そこで開き直しになる。
 *
 * 出さないもの
 * ------------
 * - 合言葉（トークン）。ログイン状態は HttpOnly の Cookie にしかない
 * - 「そのメールアドレスは登録されていません」。どのメールが登録済みかを
 *   外から調べられる。ログインの失敗はどちらの理由でも同じ文にする
 *
 * パスワードは入力欄以外のどこにも出さない。console.log もしない。
 */

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { ApiError } from "../../api/http";
import { requestPasswordReset } from "../../api/accounts";
import { useAuth } from "../../auth/AuthContext";
import { AUTH_COPY } from "../../content/ui";
import { PRIVACY, TERMS, findLegalDocument, type LegalDocument } from "../../content/legal";
import { LegalView } from "../legal/LegalView";
import { PasskeyPanel } from "./PasskeyPanel";
import { SocialButtons } from "./SocialButtons";
import { IconCaution } from "../Icons";

export type AuthMode = "signup" | "signin" | "reset";

export interface AuthDialogProps {
  mode?: AuthMode;
  onClose: () => void;
  /** 成功したとき。呼び出し側が知らせを出す。 */
  onDone?: (message: string) => void;
}

const FIELD =
  "mt-1 w-full rounded-card border border-line bg-surface px-4 py-3 text-base " +
  "transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

export function AuthDialog({ mode = "signup", onClose, onDone }: AuthDialogProps) {
  const auth = useAuth();
  const ids = useId();
  const first = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<AuthMode>(mode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [sent, setSent] = useState(false);
  /*
    規約を読んでいる最中。外部のページへ飛ばさない。
    飛ばすと、戻ってきたときに入力が消えている。
  */
  const [reading, setReading] = useState<LegalDocument["id"] | null>(null);

  // 開いたら最初の欄に焦点を置く。指を1回減らす
  useEffect(() => first.current?.focus(), [view]);

  // 画面を切り替えたら、前の指摘は消す。別の話になっているため
  useEffect(() => {
    setFailure(null);
    setSent(false);
  }, [view]);

  // Esc で閉じられるようにする。閉じ方が1つしかないと逃げ場がない
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fieldError = (name: string) => failure?.fieldErrors[name];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setFailure(null);
    try {
      if (view === "signup") {
        const migration = await auth.signUp({
          email,
          password,
          displayName,
          acceptTerms: consent,
          acceptPrivacy: consent,
        });
        onDone?.(
          migration.retryable
            ? AUTH_COPY.migrationRetryable
            : AUTH_COPY.migrationLinked(migration.linked ? migration.sessions : 0),
        );
        onClose();
      } else if (view === "signin") {
        await auth.signIn(email, password);
        onDone?.("ログインしました。続きから始められます。");
        onClose();
      } else {
        await requestPasswordReset(email);
        // 登録の有無にかかわらず同じ文にする
        setSent(true);
      }
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error
          : new ApiError({
              status: 0,
              code: "UNKNOWN",
              detail: "うまくいきませんでした。もう一度お試しください。",
              fieldErrors: {},
            }),
      );
    } finally {
      setBusy(false);
    }
  }

  const title = {
    signup: AUTH_COPY.signUpTitle,
    signin: AUTH_COPY.signInTitle,
    reset: AUTH_COPY.resetTitle,
  }[view];

  const lead = {
    signup: AUTH_COPY.signUpLead,
    signin: AUTH_COPY.signInLead,
    reset: AUTH_COPY.resetLead,
  }[view];

  const submitLabel = {
    signup: AUTH_COPY.submitSignUp,
    signin: AUTH_COPY.submitSignIn,
    reset: AUTH_COPY.submitReset,
  }[view];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${ids}-title`}
      data-testid="auth-dialog"
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
    >
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-card bg-surface p-5 shadow-raised">
        {reading !== null ? (
          <ReadingView id={reading} onBack={() => setReading(null)} titleId={`${ids}-title`} />
        ) : (
        <>
        <h2 id={`${ids}-title`} className="text-lg font-bold">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-7 text-ink-muted">{lead}</p>

        {/* 全体の指摘。入力欄ごとの指摘は、その欄の下に出す */}
        {failure && !Object.keys(failure.fieldErrors).some((key) => key !== "detail") && (
          <p
            role="alert"
            data-testid="auth-error"
            className="mt-4 flex items-start gap-2 rounded-card bg-caution-soft px-4 py-3
                       text-sm leading-6 text-caution"
          >
            <IconCaution className="mt-0.5 h-4 w-4 shrink-0" />
            {failure.detail}
          </p>
        )}

        {sent && (
          <p
            role="status"
            data-testid="auth-reset-sent"
            className="mt-4 rounded-card bg-brand-soft px-4 py-3 text-sm leading-6 text-brand-dark"
          >
            {AUTH_COPY.resetSent}
          </p>
        )}

        {/*
          パスキーを先に出す。合言葉を決めるところが、登録でいちばん
          手が止まる場所なので、そこを飛ばせる道を上に置く。
          使えない端末では何も出ない（PasskeyPanel が自分で判断する）。
        */}
        {view !== "reset" && (
          <PasskeyPanel
            mode={view === "signup" ? "signup" : "signin"}
            email={email}
            displayName={displayName}
            consent={consent}
            disabled={busy}
            onDone={async (message) => {
              await auth.refresh();
              onDone?.(message);
              onClose();
            }}
          />
        )}

        <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
          <div>
            <label htmlFor={`${ids}-email`} className="text-sm font-bold">
              {AUTH_COPY.email}
            </label>
            <input
              ref={first}
              id={`${ids}-email`}
              type="email"
              value={email}
              autoComplete="email"
              inputMode="email"
              required
              aria-describedby={fieldError("email") ? `${ids}-email-error` : undefined}
              aria-invalid={Boolean(fieldError("email"))}
              onChange={(event) => setEmail(event.target.value)}
              className={FIELD}
            />
            {fieldError("email") && (
              <p id={`${ids}-email-error`} className="mt-1 text-xs text-caution">
                {fieldError("email")}
              </p>
            )}
          </div>

          {view !== "reset" && (
            <div>
              <label htmlFor={`${ids}-password`} className="text-sm font-bold">
                {AUTH_COPY.password}
              </label>
              <input
                id={`${ids}-password`}
                type="password"
                value={password}
                /* 新規は new-password。使い回しを勧めない */
                autoComplete={view === "signup" ? "new-password" : "current-password"}
                required
                minLength={8}
                aria-describedby={`${ids}-password-hint`}
                aria-invalid={Boolean(fieldError("password"))}
                onChange={(event) => setPassword(event.target.value)}
                className={FIELD}
              />
              <p id={`${ids}-password-hint`} className="mt-1 text-xs text-ink-muted">
                {fieldError("password") ?? (view === "signup" ? AUTH_COPY.passwordHint : "")}
              </p>
            </div>
          )}

          {view === "signup" && (
            <>
              <div>
                <label htmlFor={`${ids}-name`} className="text-sm font-bold">
                  {AUTH_COPY.displayName}
                </label>
                <input
                  id={`${ids}-name`}
                  type="text"
                  value={displayName}
                  autoComplete="nickname"
                  maxLength={60}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className={FIELD}
                />
                <p className="mt-1 text-xs text-ink-muted">
                  {AUTH_COPY.displayNameHint}
                </p>
              </div>

              <div className="rounded-card bg-canvas px-4 py-3">
                <label className="flex items-start gap-3 text-sm leading-6">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 rounded border-line text-brand
                               focus:ring-2 focus:ring-brand/30"
                  />
                  <span>
                    {AUTH_COPY.consent}
                    <span className="mt-1 flex flex-wrap gap-x-4">
                      {[TERMS, PRIVACY].map((document) => (
                        <button
                          key={document.id}
                          type="button"
                          data-testid={`auth-read-${document.id}`}
                          onClick={() => setReading(document.id)}
                          className="text-xs text-brand-dark underline"
                        >
                          {document.title}
                        </button>
                      ))}
                    </span>
                  </span>
                </label>
                {fieldError("accept_terms") && (
                  <p className="mt-2 text-xs text-caution">{fieldError("accept_terms")}</p>
                )}
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={busy || (view === "signup" && !consent)}
            data-testid="auth-submit"
            className="min-h-[3rem] w-full rounded-cta bg-brand px-6 py-3 text-base
                       font-bold text-white shadow-raised transition hover:brightness-110
                       active:brightness-95 disabled:cursor-not-allowed
                       disabled:bg-none disabled:bg-line disabled:text-ink-muted
                       disabled:shadow-none"
          >
            {busy ? "送信中…" : submitLabel}
          </button>

          {view === "signup" && !consent && (
            <p className="text-center text-xs text-ink-muted">
              {AUTH_COPY.consentRequired}
            </p>
          )}
        </form>

        {/* 再設定の画面では出さない。ここでやることは1つだけにする */}
        {view !== "reset" && <SocialButtons disabled={busy} />}

        <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {view !== "signin" && (
            <button
              type="button"
              onClick={() => setView("signin")}
              className="text-brand-dark underline"
            >
              {AUTH_COPY.toSignIn}
            </button>
          )}
          {view !== "signup" && (
            <button
              type="button"
              onClick={() => setView("signup")}
              className="text-brand-dark underline"
            >
              {AUTH_COPY.toSignUp}
            </button>
          )}
          {view !== "reset" && (
            <button
              type="button"
              onClick={() => setView("reset")}
              className="text-brand-dark underline"
            >
              {AUTH_COPY.toReset}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-cta border border-line px-6 py-3 text-sm
                     text-ink-muted transition hover:bg-canvas"
        >
          {AUTH_COPY.cancel}
        </button>
        </>
        )}
      </div>
    </div>
  );
}

/**
 * 規約の本文を、このダイアログの中で読ませる。
 *
 * 入力中の内容は残したまま。戻ると、同意の欄からそのまま続けられる。
 */
function ReadingView({
  id,
  onBack,
  titleId,
}: {
  id: LegalDocument["id"];
  onBack: () => void;
  titleId: string;
}) {
  const document = findLegalDocument(id);
  if (!document) return null;

  return (
    <>
      <h2 id={titleId} className="text-lg font-bold">
        {document.title}
      </h2>
      <LegalView document={document} />
      <button
        type="button"
        data-testid="auth-read-back"
        onClick={onBack}
        className="mt-4 w-full rounded-cta border border-brand-line px-6 py-3
                   text-sm text-brand-dark transition hover:bg-brand-soft"
      >
        登録の画面へもどる
      </button>
    </>
  );
}
