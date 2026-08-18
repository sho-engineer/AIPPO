/**
 * 設定 > アカウント。
 *
 * ログインしていない人には「登録すると何ができるか」を、
 * ログイン済みの人には「いまどうなっているか」を出す。
 *
 * 出さないもの
 * ------------
 * - パスワード。表示も、伏せ字での表示もしない
 * - 内部の識別子（learner_key、ユーザーID）。見せる意味がなく、
 *   問い合わせのときに貼り付けられると、そこから他人が名乗れる
 *
 * 退会は取り消せない。押した瞬間に消えないよう、文字で打ち直させる。
 */

import { useState } from "react";

import { Card } from "../AppShell";
import { SettingsGroup } from "./Controls";
import { changePassword, deleteAccount } from "../../api/accounts";
import { ApiError } from "../../api/http";
import { useAuth } from "../../auth/AuthContext";
import { AUTH_COPY } from "../../content/ui";

const FIELD =
  "mt-1 w-full rounded-card border border-line bg-surface px-4 py-3 text-base " +
  "transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

const DANGER =
  "min-h-[2.75rem] rounded-cta border border-caution px-5 py-2 text-sm " +
  "text-caution transition hover:bg-caution-soft disabled:cursor-not-allowed " +
  "disabled:border-line disabled:text-ink-muted";

const PLAIN =
  "min-h-[2.75rem] rounded-cta border border-brand-line px-5 py-2 text-sm " +
  "text-brand-dark transition hover:bg-brand-soft disabled:cursor-not-allowed " +
  "disabled:border-line disabled:text-ink-muted";

/** 退会のときに打ち直してもらう言葉。押し間違いを止めるためだけのもの。 */
const CONFIRM_WORD = "退会します";

export interface AccountPanelProps {
  /** 未登録の人が「登録する」を押したとき。 */
  onOpenAuth: () => void;
  onNotice: (message: string) => void;
}

export function AccountPanel({ onOpenAuth, onNotice }: AccountPanelProps) {
  const auth = useAuth();

  if (auth.loading) {
    return (
      <Card className="mt-5">
        <p className="text-sm text-ink-muted">読み込んでいます…</p>
      </Card>
    );
  }

  if (!auth.user) return <GuestView onOpenAuth={onOpenAuth} />;

  return (
    <>
      <Card className="mt-5" padded={false}>
        <SettingsGroup title="ログイン中のアカウント">
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="text-xs text-ink-muted">メールアドレス</dt>
              <dd data-testid="account-email">{auth.user.email}</dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="text-xs text-ink-muted">メールの確認</dt>
              <dd>{auth.user.email_verified ? "確認済み" : "未確認"}</dd>
            </div>
            {auth.progress && (
              <div className="flex flex-wrap items-baseline gap-x-3">
                <dt className="text-xs text-ink-muted">記録</dt>
                <dd>
                  終わったレッスン {auth.progress.completed}件／
                  途中のもの {auth.progress.in_progress}件
                  {auth.progress.devices > 1 && `／${auth.progress.devices}台の端末`}
                </dd>
              </div>
            )}
          </dl>

          {!auth.user.email_verified && (
            <p className="mt-3 rounded-card bg-caution-soft px-4 py-3 text-xs leading-6 text-caution">
              {AUTH_COPY.verifyPending}
            </p>
          )}
        </SettingsGroup>

        <NameGroup />
        <PasswordGroup onNotice={onNotice} />

        <SettingsGroup
          title="ログアウト"
          description="この端末での表示を、登録なしの状態へ戻します。記録は消えません。"
        >
          <button
            type="button"
            className={PLAIN}
            onClick={async () => {
              await auth.signOut();
              onNotice(AUTH_COPY.signOutDone);
            }}
          >
            {AUTH_COPY.signOut}
          </button>
        </SettingsGroup>
      </Card>

      <DeleteGroup onNotice={onNotice} />
    </>
  );
}

// ------------------------------------------------------------------ 未登録

function GuestView({ onOpenAuth }: { onOpenAuth: () => void }) {
  return (
    <Card className="mt-5">
      <h2 className="text-base font-bold">{AUTH_COPY.signUpTitle}</h2>
      <p className="mt-2 text-sm leading-7 text-ink-muted">{AUTH_COPY.signUpLead}</p>

      <p className="mt-4 rounded-card bg-brand-soft px-4 py-3 text-xs leading-6 text-brand-dark">
        {AUTH_COPY.guestNotice}
      </p>

      <button
        type="button"
        data-testid="account-open-auth"
        onClick={onOpenAuth}
        className="mt-5 min-h-[3rem] w-full rounded-cta bg-brand px-6 py-3
                   text-base font-bold text-white shadow-raised transition
                   hover:brightness-110 active:brightness-95"
      >
        {AUTH_COPY.submitSignUp}
      </button>
    </Card>
  );
}

// ------------------------------------------------------------------ 表示名

function NameGroup() {
  const auth = useAuth();
  const [name, setName] = useState(auth.user?.display_name ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const changed = name !== (auth.user?.display_name ?? "");

  return (
    <SettingsGroup title="呼ばれたい名前" description="ポーが呼びかけるときに使います。">
      <label htmlFor="account-name" className="sr-only">
        呼ばれたい名前
      </label>
      <input
        id="account-name"
        type="text"
        value={name}
        maxLength={60}
        onChange={(event) => {
          setName(event.target.value);
          setDone(false);
        }}
        className={FIELD}
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className={PLAIN}
          disabled={busy || !changed}
          onClick={async () => {
            setBusy(true);
            try {
              await auth.setDisplayName(name);
              setDone(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          変更する
        </button>
        {done && (
          <span role="status" className="text-xs text-brand-dark">
            変えました
          </span>
        )}
      </div>
    </SettingsGroup>
  );
}

// ------------------------------------------------------------------ パスワード

function PasswordGroup({ onNotice }: { onNotice: (message: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <SettingsGroup
      title="パスワードの変更"
      description="変えたあとも、この端末のログインは続きます。"
    >
      <label htmlFor="account-password-current" className="text-xs text-ink-muted">
        いまのパスワード
      </label>
      <input
        id="account-password-current"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
        className={FIELD}
      />

      <label
        htmlFor="account-password-next"
        className="mt-3 block text-xs text-ink-muted"
      >
        新しいパスワード
      </label>
      <input
        id="account-password-next"
        type="password"
        autoComplete="new-password"
        minLength={8}
        value={next}
        onChange={(event) => setNext(event.target.value)}
        className={FIELD}
      />
      <p className="mt-1 text-xs text-ink-muted">{AUTH_COPY.passwordHint}</p>

      {error && (
        <p role="alert" className="mt-2 text-xs text-caution">
          {error}
        </p>
      )}

      <button
        type="button"
        className={`${PLAIN} mt-3`}
        disabled={busy || !current || next.length < 8}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await changePassword(current, next);
            setCurrent("");
            setNext("");
            onNotice("パスワードを変えました。");
          } catch (failure) {
            setError(
              failure instanceof ApiError
                ? failure.detail
                : "うまくいきませんでした。もう一度お試しください。",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        パスワードを変える
      </button>
    </SettingsGroup>
  );
}

// ------------------------------------------------------------------ 退会

function DeleteGroup({ onNotice }: { onNotice: (message: string) => void }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Card className="mt-5">
      <h2 className="text-base font-bold text-caution">退会する</h2>
      <p className="mt-2 text-sm leading-7 text-ink-muted">
        アカウントと、これまでの学習の記録をすべて消します。
        <strong className="text-caution">取り消せません。</strong>
        記録だけ消したいときは「学習データ・プライバシー」から消せます。
      </p>

      {!open ? (
        <button type="button" className={`${DANGER} mt-4`} onClick={() => setOpen(true)}>
          退会の手続きへ
        </button>
      ) : (
        <div className="mt-4">
          <label htmlFor="account-delete-word" className="text-sm">
            確認のため <strong>{CONFIRM_WORD}</strong> と入力してください。
          </label>
          <input
            id="account-delete-word"
            type="text"
            value={word}
            onChange={(event) => setWord(event.target.value)}
            className={FIELD}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="account-delete-confirm"
              className={DANGER}
              disabled={busy || word !== CONFIRM_WORD}
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteAccount();
                  await auth.refresh();
                  onNotice("退会しました。ご利用ありがとうございました。");
                } finally {
                  setBusy(false);
                  setOpen(false);
                  setWord("");
                }
              }}
            >
              退会する
            </button>
            <button
              type="button"
              className={PLAIN}
              onClick={() => {
                setOpen(false);
                setWord("");
              }}
            >
              やめる
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
