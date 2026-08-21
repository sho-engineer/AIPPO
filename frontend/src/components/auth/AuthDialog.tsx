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
 *
 * 登録の並べ方
 * ------------
 * 登録では、**どちらの道でも要るもの**を先に置く。
 * メールアドレス・呼ばれたい名前・同意の3つ。そのあとで
 * 「パスキーで登録」「パスワードで登録」を選ばせる。
 *
 * 前はパスキーの入口が一番上にあった。押せる条件（メールと同意）が
 * その下にあるので、開いた人はまず**押せないボタン**を見ることになり、
 * 何をすれば押せるのかはボタンの下の小さな字にしか書いていなかった。
 * 要るものを先に出せば、その説明は要らなくなる。
 *
 * パスワードの確認欄
 * ------------------
 * 登録のときだけ2回入れてもらう。打ち間違いは、登録した本人にしか
 * 直せない。次にログインしようとした日まで気づけず、そこからは
 * 再設定のメールを待つことになる。確認欄はサーバーへは送らない
 * （送っても、確かめられるのはこの画面だけ）。
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
  const [passwordConfirm, setPasswordConfirm] = useState("");
  /* 打った中身を目で確かめられるようにする。2つの欄で同じ挙動にする */
  const [revealPassword, setRevealPassword] = useState(false);
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
    // 別の話になっているので、確認欄も持ち越さない
    setPasswordConfirm("");
    setRevealPassword(false);
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

  /*
    確認欄が合っていないか。

    打っている途中を捕まえて「一致していません」と出さない。
    2文字目で赤くなる欄は、急かされているようにしか見えない。
    出すのは、確認欄に何か入っていて、かつ食い違っているときだけ。
  */
  const mismatch =
    view === "signup" && passwordConfirm.length > 0 && password !== passwordConfirm;

  /** 登録の押せない理由。押せる形のまま止めて、理由をその場に出す。 */
  const signUpBlocked =
    view === "signup" && (!consent || mismatch || passwordConfirm.length === 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setFailure(null);
    try {
      if (view === "signup") {
        /*
          画面側でも止めてあるが、ここでも見る。Enter での送信や、
          あとから条件を足したときに、素通りする道を残さない。
          確認欄はサーバーへは送らない（signUp の形は変えない）。
        */
        if (password !== passwordConfirm) {
          setFailure(
            new ApiError({
              status: 0,
              code: "PASSWORD_MISMATCH",
              detail: AUTH_COPY.passwordMismatch,
              fieldErrors: { password_confirm: AUTH_COPY.passwordMismatch },
            }),
          );
          return;
        }
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
          ログインでは、パスキーを一番上に置く。打つものが何も無いので、
          条件も前置きも要らない——押せばそれで終わる。

          登録では下（フォームの中）に置く。押せる条件（メールと同意）が
          先に要るためで、条件より先にボタンを見せると、
          最初に目に入るのが押せないボタンになる。
        */}
        {view === "signin" && (
          <PasskeyPanel
            mode="signin"
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

          {view === "signin" && (
            <PasswordField
              id={`${ids}-password`}
              label={AUTH_COPY.password}
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              revealed={revealPassword}
              onToggleReveal={() => setRevealPassword((on) => !on)}
              hint={fieldError("password") ?? ""}
              invalid={Boolean(fieldError("password"))}
            />
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

              {/*
                ここから下が「登録のしかた」。上の3つはどちらの道でも要る。
                2つの道があることと、その違いを、選ぶ前に見せる。
              */}
              <div className="pt-1">
                <h3 className="section-title" data-testid="auth-methods">
                  {AUTH_COPY.methodHeading}
                </h3>

                <p className="mt-2 text-sm font-bold">{AUTH_COPY.passkeyMethod}</p>
                <p className="mt-1 text-xs leading-6 text-ink-muted">
                  {AUTH_COPY.passkeyMethodLead}
                </p>

                <PasskeyPanel
                  mode="signup"
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

                <p className="mt-4 text-sm font-bold">{AUTH_COPY.passwordMethod}</p>
              </div>

              <PasswordField
                id={`${ids}-password`}
                label={AUTH_COPY.password}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                revealed={revealPassword}
                onToggleReveal={() => setRevealPassword((on) => !on)}
                hint={fieldError("password") ?? AUTH_COPY.passwordHint}
                invalid={Boolean(fieldError("password"))}
              />

              <PasswordField
                id={`${ids}-password-confirm`}
                label={AUTH_COPY.passwordConfirm}
                value={passwordConfirm}
                onChange={setPasswordConfirm}
                autoComplete="new-password"
                revealed={revealPassword}
                onToggleReveal={() => setRevealPassword((on) => !on)}
                testId="auth-password-confirm"
                error={mismatch ? AUTH_COPY.passwordMismatch : undefined}
                invalid={mismatch}
              />
            </>
          )}

          <button
            type="submit"
            disabled={busy || signUpBlocked}
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
 * パスワードの入力欄。
 *
 * 「表示」を付けてある。打ったものが1文字も見えないと、確認欄と
 * 食い違ったときに、どちらが違うのか探せない。表示は2つの欄で
 * まとめて切り替える——片方だけ見えても、見比べられない。
 *
 * 見えている間も、値はどこにも出さない。`type` を変えるだけで、
 * 画面の外へは何も渡さない。
 */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  revealed,
  onToggleReveal,
  hint,
  error,
  invalid,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  revealed: boolean;
  onToggleReveal: () => void;
  hint?: string;
  error?: string;
  invalid?: boolean;
  testId?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          data-testid={testId}
          type={revealed ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          required
          minLength={8}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD} pr-20`}
        />
        <button
          type="button"
          onClick={onToggleReveal}
          aria-pressed={revealed}
          className="absolute inset-y-0 right-0 mt-1 flex items-center px-4 text-xs
                     font-bold text-brand-dark"
        >
          {revealed ? AUTH_COPY.hidePassword : AUTH_COPY.showPassword}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-caution">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
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
