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
 * **先に道を選ばせ、そのあとで、その道に要るものだけを聞く。**
 *
 *     登録して、続きを別の端末でも
 *     [ Google で続ける ]
 *     [ パスキーで続ける ]
 *     ──────── または ────────
 *     メールアドレス
 *     [                    ]
 *     [ メールで続ける ]
 *
 * 前は1枚だった。メール・呼ばれたい名前・同意・パスワード2つ・
 * パスキーのボタン・Google のボタンが同時に見えていて、
 * **Google で登録する人にもパスワード欄が見えていた**。
 * 自分に要らないものを数えてから始めることになる。
 *
 * いまは押した道の分だけを次で聞く。
 *
 *   - Google … 何も聞かない（メールも名前もあちらから来る）
 *   - パスキー … メールアドレスだけ
 *   - メール … パスワードと、その確認
 *
 * 同意の取り方
 * ------------
 * **どの道でも同じにする。** 前は Google だけ「押したら同意」で、
 * パスキーとパスワードにはチェック欄があった。同じ登録なのに
 * 求められるものが違い、しかもチェック欄は Google のボタンを
 * 素通りしていた——厳しく見えて、実際には守っていない形だった。
 *
 * いまはどの道でも、押す前に同じ一文が見えるところにある。
 * 規約とポリシーはこの画面の中で読める（外へ飛ばすと入力が消える）。
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
import { EVENTS, track } from "../../lib/analytics";
import { AUTH_COPY } from "../../content/ui";
import { PRIVACY, TERMS, findLegalDocument, type LegalDocument } from "../../content/legal";
import { LegalView } from "../legal/LegalView";
import { PasskeyPanel, usePasskeyAvailable } from "./PasskeyPanel";
import { ResendCountdown } from "./ResendCountdown";
import { SocialButtons } from "./SocialButtons";
import { IconCaution, IconKey } from "../Icons";

export type AuthMode = "signup" | "signin" | "reset";

/**
 * 登録の何枚目か。
 *
 * `method` で道を選び、選んだ道に要るものだけを次で聞く。
 * ログインと再設定は1枚のままなので、ここは登録のときだけ動く。
 */
type SignUpStep = "method" | "password" | "passkey";

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
  const [step, setStep] = useState<SignUpStep>("method");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  /* 打った中身を目で確かめられるようにする。2つの欄で同じ挙動にする */
  const [revealPassword, setRevealPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  /*
    上に出せた外部ログインの数。0 なら「または」の線を出さない。
    出すと、何も無いところに区切りだけが残る。
  */
  const [socialCount, setSocialCount] = useState(0);
  const passkeyReady = usePasskeyAvailable();
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [sent, setSent] = useState(false);
  /*
    次に送れるまでの残り秒数。0なら押せる。
    秒数はサーバーが決める（送れたときは retry_after、
    断られたときは Retry-After）。ここには書き写さない。
  */
  const [resendIn, setResendIn] = useState(0);
  /*
    規約を読んでいる最中。外部のページへ飛ばさない。
    飛ばすと、戻ってきたときに入力が消えている。
  */
  const [reading, setReading] = useState<LegalDocument["id"] | null>(null);

  /*
    開いたら、その画面で最初に打つ欄に焦点を置く。指を1回減らす。
    パスワードの画面だけは、メールをもう一度打たせないので
    パスワード欄が最初になる。
  */
  useEffect(() => {
    const target =
      view === "signup" && step === "password"
        ? window.document.getElementById(`${ids}-password`)
        : first.current;
    target?.focus();
  }, [view, step, ids]);

  // 画面を切り替えたら、前の指摘は消す。別の話になっているため
  useEffect(() => {
    setFailure(null);
    setSent(false);
    // 別の話になっているので、確認欄も持ち越さない
    setPasswordConfirm("");
    setRevealPassword(false);
    // 登録は必ず「どれで登録するか」から始める
    setStep("method");
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
    view === "signup" &&
    step === "password" &&
    passwordConfirm.length > 0 &&
    password !== passwordConfirm;

  /** いま出ている一番下のボタンを押せない理由。押せる形のまま止めない。 */
  const blocked =
    view === "signup"
      ? step === "method"
        ? email.trim().length === 0
        : mismatch || passwordConfirm.length === 0
      : view === "reset" && resendIn > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    /*
      1枚目は送信ではなく、次の画面へ進むだけ。
      Enter でも同じように進めるよう、ここに置いてある。
    */
    if (view === "signup" && step === "method") {
      if (email.trim().length === 0) return;
      setFailure(null);
      // ここから先が登録の道。どこで落ちたかを見るための起点
      track(EVENTS.signUpStarted);
      setStep("password");
      return;
    }
    // パスキーの画面に送信は無い（PasskeyPanel が自分で持っている）
    if (view === "signup" && step === "passkey") return;

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
              retryAfter: 0,
            }),
          );
          return;
        }
        /*
          同意は、ここまで来た時点で取れている。1枚目の
          「メールで続ける」の上に、同じ一文が出ている。
        */
        const migration = await auth.signUp({
          email,
          password,
          displayName,
          acceptTerms: true,
          acceptPrivacy: true,
        });
        track(EVENTS.signUpCompleted);
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
        // 押した回。サーバー側の password_reset_sent（送れた回）と対にする
        track(EVENTS.passwordResetRequested);
        const result = await requestPasswordReset(email);
        // 登録の有無にかかわらず同じ文にする
        setSent(true);
        setResendIn(result.retry_after ?? 0);
      }
    } catch (error) {
      if (error instanceof ApiError && error.retryAfter > 0) {
        // 待つ時間が分かっているなら、押し直させずに数える
        setResendIn(error.retryAfter);
      }
      /*
        メールアドレスへの指摘（「すでに使われています」など）は、
        その欄が見えている画面へ戻して出す。パスワードの画面のまま
        出すと、直せない指摘だけが画面に残る。
      */
      if (error instanceof ApiError && error.fieldErrors.email && view === "signup") {
        setStep("method");
      }
      setFailure(
        error instanceof ApiError
          ? error
          : new ApiError({
              status: 0,
              code: "UNKNOWN",
              detail: "うまくいきませんでした。もう一度お試しください。",
              fieldErrors: {},
              retryAfter: 0,
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

  /* 登録は画面ごとに前置きが変わる。いま何を聞かれているかを毎回書く */
  const lead =
    view === "signup"
      ? {
          method: AUTH_COPY.signUpLead,
          password: AUTH_COPY.passwordStepLead,
          passkey: AUTH_COPY.passkeyStepLead,
        }[step]
      : { signin: AUTH_COPY.signInLead, reset: AUTH_COPY.resetLead }[view];

  const submitLabel =
    view === "signup"
      ? step === "method"
        ? AUTH_COPY.continueWithEmail
        : AUTH_COPY.submitSignUp
      : { signin: AUTH_COPY.submitSignIn, reset: AUTH_COPY.submitReset }[view];

  /** 登録が済んだときの後始末。3つの道で同じことをする。 */
  async function finish(message: string) {
    await auth.refresh();
    onDone?.(message);
    onClose();
  }

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
          次に送れるまでの残り。押せなくするのは親切のためで、
          守りではない（実際に止めているのはサーバー）。
        */}
        {view === "reset" && (
          <ResendCountdown seconds={resendIn} onFinished={() => setResendIn(0)} />
        )}

        {/*
          ログインでは、パスキーを一番上に置く。打つものが何も無いので、
          条件も前置きも要らない——押せばそれで終わる。
        */}
        {view === "signin" && <PasskeyPanel mode="signin" disabled={busy} onDone={finish} />}

        {/*
          登録の1枚目。ここで道を選ぶ。

          押せるボタンだけを出す。Google は押した先で全部済むので
          一番上、パスキーはメールアドレスだけ次で聞く。
          メールでの登録は、この下の欄から。
        */}
        {view === "signup" && step === "method" && (
          <>
            <div className="mt-5 space-y-2" data-testid="auth-methods">
              <SocialButtons bare disabled={busy} onCount={setSocialCount} />

              {passkeyReady && (
                <button
                  type="button"
                  data-testid="auth-to-passkey"
                  disabled={busy}
                  onClick={() => setStep("passkey")}
                  className="flex min-h-[3rem] w-full items-center justify-center gap-2
                             rounded-cta border border-brand bg-surface px-6 py-3 text-base
                             font-bold text-brand-dark transition hover:bg-brand-soft
                             disabled:cursor-not-allowed disabled:border-line
                             disabled:text-ink-muted"
                >
                  <IconKey className="h-5 w-5 shrink-0" />
                  {AUTH_COPY.continueWithPasskey}
                </button>
              )}
            </div>

            {/* 上に何も出せなかった環境では、区切りの線だけを残さない */}
            {(socialCount > 0 || passkeyReady) && (
              <div className="mt-5 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs text-ink-muted">{AUTH_COPY.methodDivider}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            )}
          </>
        )}

        {/*
          2枚目では、打ったメールアドレスをそのまま出す。
          もう一度打たせない。違っていたら「変更する」で1枚目へ戻る。
        */}
        {view === "signup" && step === "password" && (
          <div
            data-testid="auth-chosen-email"
            className="mt-4 flex items-center justify-between gap-3 rounded-card
                       bg-canvas px-4 py-3 text-sm"
          >
            <span className="min-w-0 break-all">{email}</span>
            <button
              type="button"
              data-testid="auth-change-email"
              onClick={() => setStep("method")}
              className="shrink-0 text-brand-dark underline"
            >
              {AUTH_COPY.changeEmail}
            </button>
          </div>
        )}

        <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
          {/* パスワードの画面だけは、メールアドレスを上に出してある */}
          {!(view === "signup" && step === "password") && (
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
          )}

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

          {/* 呼ばれたい名前は任意。Google なら向こうから来るので聞かない */}
          {view === "signup" && step !== "method" && (
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
              <p className="mt-1 text-xs text-ink-muted">{AUTH_COPY.displayNameHint}</p>
            </div>
          )}

          {view === "signup" && step === "password" && (
            <>
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

          {/* パスキーの画面には送信が無い。下の PasskeyPanel が持っている */}
          {!(view === "signup" && step === "passkey") && (
            <button
              type="submit"
              disabled={busy || blocked}
              data-testid="auth-submit"
              className="min-h-[3rem] w-full rounded-cta bg-brand px-6 py-3 text-base
                         font-bold text-white shadow-raised transition hover:brightness-110
                         active:brightness-95 disabled:cursor-not-allowed
                         disabled:bg-none disabled:bg-line disabled:text-ink-muted
                         disabled:shadow-none"
            >
              {busy ? "送信中…" : submitLabel}
            </button>
          )}
        </form>

        {view === "signup" && step === "passkey" && (
          <PasskeyPanel
            mode="signup"
            bare
            email={email}
            displayName={displayName}
            /* 同意はここへ来るまでに取れている（1枚目の一文） */
            consent
            disabled={busy}
            onDone={finish}
          />
        )}

        {/*
          同意の一文。**どの登録方式でも同じものを、押す前に出す。**
          置き場所を1つにしてあるので、Google だけ扱いが違う、
          ということが起きない。
        */}
        {view === "signup" && (
          <div data-testid="auth-consent" className="mt-4">
            <p className="text-center text-xs leading-6 text-ink-muted">
              {AUTH_COPY.consentNotice}
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-x-4">
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
            </div>
            {fieldError("accept_terms") && (
              <p className="mt-2 text-center text-xs text-caution">
                {fieldError("accept_terms")}
              </p>
            )}
          </div>
        )}

        {/* ログインでは今までどおり下に置く。再設定では出さない */}
        {view === "signin" && <SocialButtons disabled={busy} />}

        {/* 2枚目からは、まず戻り道を出す。行き止まりを作らない */}
        {view === "signup" && step !== "method" && (
          <button
            type="button"
            data-testid="auth-step-back"
            onClick={() => setStep("method")}
            className="mt-5 w-full rounded-cta border border-line px-6 py-3 text-sm
                       text-ink-muted transition hover:bg-canvas"
          >
            {AUTH_COPY.back}
          </button>
        )}

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
