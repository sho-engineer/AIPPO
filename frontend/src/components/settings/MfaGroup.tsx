/**
 * 設定の「2段階認証（認証アプリ）」。
 *
 * 入れたい人だけが入れる。登録の時点では求めない——一般向けの
 * 学習サービスで全員に強いると、そこで止まる人のほうが多い。
 *
 * 3手で入れる
 * -----------
 * 1. 秘密を作る（この時点ではまだ効いていない）
 * 2. 認証アプリに入れて、出たコードを1回通す
 * 3. 予備の合言葉を10個受け取る
 *
 * 2で1回通させるのは、アプリに入れ損ねた人が**次のログインで
 * 締め出される**のを防ぐため。入れた気になったまま有効にしない。
 *
 * 予備の合言葉は1回しか出ない
 * ---------------------------
 * サーバーは合言葉を照合できる形でしか持っていないので、後から
 * 読み出せない。だからこの画面では、受け取った直後に**写すまで
 * 閉じられない**形にする。閉じたあとで「もう一度見せて」は無い。
 *
 * 秘密を端末に残さない
 * --------------------
 * 画面が持っているあいだだけ。保存すると、閉じたあとにも
 * 取り出せる場所が増える。
 *
 * QRの画像は出さない
 * ------------------
 * 画像を作るためだけに部品を増やさない。代わりに、
 * 携帯でそのままアプリが開くリンクと、手で入れられる形の
 * 秘密（4文字ずつ空けたもの）の両方を置く。
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../../api/http";
import {
  confirmMfa,
  disableMfa,
  fetchMfaState,
  startMfaSetup,
  type MfaSetup,
  type MfaState,
} from "../../api/mfa";
import { IconCaution, IconCheck, IconLock } from "../Icons";
import { SettingsGroup } from "./Controls";

export interface MfaGroupProps {
  onNotice: (message: string) => void;
}

const FIELD =
  "mt-1 w-full rounded-card border border-line bg-surface px-4 py-3 text-base " +
  "transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

const PLAIN =
  "min-h-[2.75rem] rounded-cta border border-brand-line px-5 py-2 text-sm " +
  "text-brand-dark transition hover:bg-brand-soft disabled:cursor-not-allowed " +
  "disabled:border-line disabled:text-ink-muted";

const DANGER =
  "min-h-[2.75rem] rounded-cta border border-caution px-5 py-2 text-sm " +
  "text-caution transition hover:bg-caution-soft disabled:cursor-not-allowed " +
  "disabled:border-line disabled:text-ink-muted";

/** いま画面のどこにいるか。 */
type Stage =
  /** 状態を聞いている */
  | "loading"
  /** 入れていない */
  | "off"
  /** 秘密を出して、コード待ち */
  | "setup"
  /** 予備の合言葉を渡したところ。写すまでここから動かさない */
  | "codes"
  /** 入っている */
  | "on"
  /** やめる確認 */
  | "disabling";

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.detail : fallback;
}

export function MfaGroup({ onNotice }: MfaGroupProps) {
  const [stage, setStage] = useState<Stage>("loading");
  const [state, setState] = useState<MfaState | null>(null);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [recovery, setRecovery] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await fetchMfaState(signal);
      setState(next);
      /*
        途中で離れた人は「入れていない」に戻す。

        秘密はもう画面に無いので、続きから、とは言えない。
        もう一度押せば作り直される（サーバー側も上書きする）。
      */
      setStage(next.enabled ? "on" : "off");
    } catch {
      // 聞けなくても、押す道は残す
      setStage("off");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  if (stage === "loading") {
    return (
      <SettingsGroup title="2段階認証">
        <p className="text-sm text-ink-muted">読み込んでいます…</p>
      </SettingsGroup>
    );
  }

  async function begin() {
    setBusy(true);
    setFailure(null);
    try {
      setSetup(await startMfaSetup());
      setCode("");
      setStage("setup");
    } catch (error) {
      setFailure(message(error, "始められませんでした。もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setFailure(null);
    try {
      const done = await confirmMfa(code);
      setRecovery(done.recovery_codes);
      // 秘密はここで手放す。もう画面に置いておく理由が無い
      setSetup(null);
      setCode("");
      setStage("codes");
    } catch (error) {
      setFailure(message(error, "コードが違います。もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    setFailure(null);
    try {
      await disableMfa(code);
      setCode("");
      await reload();
      onNotice("2段階認証をやめました。");
    } catch (error) {
      setFailure(message(error, "コードが違います。もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsGroup
      title="2段階認証（認証アプリ）"
      description="パスワードに加えて、認証アプリの6桁を使います。入れるかどうかは自由です。"
    >
      {failure && (
        <p
          role="alert"
          data-testid="mfa-error"
          className="mb-3 flex items-start gap-2 rounded-card bg-caution-soft px-4 py-3
                     text-sm leading-6 text-caution"
        >
          <IconCaution className="mt-0.5 h-4 w-4 shrink-0" />
          {failure}
        </p>
      )}

      {/* ------------------------------------------------ 入れていない */}
      {stage === "off" && (
        <div data-testid="mfa-off">
          <p className="text-sm leading-7 text-ink-muted">
            まだ入れていません。入れると、パスワードが漏れても、
            認証アプリを持っている人以外は入れなくなります。
          </p>
          {/*
            毎回聞かれるわけではないことを、押す前に書く。
            「入れたら毎日面倒になる」と思われると、そこで止まる。
          */}
          <p className="mt-2 text-xs leading-6 text-ink-muted">
            一度通した端末は30日おぼえます。新しい端末で入るときだけ聞かれます。
          </p>
          <button
            type="button"
            data-testid="mfa-start"
            className={`${PLAIN} mt-4 flex items-center gap-2`}
            disabled={busy}
            onClick={begin}
          >
            <IconLock className="h-4 w-4 shrink-0" />
            {busy ? "準備しています…" : "2段階認証を入れる"}
          </button>
        </div>
      )}

      {/* -------------------------------------------------- コード待ち */}
      {stage === "setup" && setup && (
        <div data-testid="mfa-setup">
          <p className="text-sm leading-7">
            認証アプリ（Google Authenticator など）に、次のどちらかで登録してください。
          </p>

          <ol className="mt-3 space-y-3 text-sm leading-7" role="list">
            <li>
              <a
                href={setup.uri}
                data-testid="mfa-uri"
                className="font-bold text-brand-dark underline transition hover:text-brand"
              >
                この端末の認証アプリで開く
              </a>
              <span className="block text-xs text-ink-muted">
                携帯で見ているときは、これがいちばん早いです
              </span>
            </li>
            <li>
              手で入れる:
              {/*
                4文字ずつ空けてある（サーバー側で整形）。
                続けて出すと、打ち間違いも読み飛ばしも増える。
              */}
              <code
                data-testid="mfa-secret"
                className="mt-1 block break-all rounded-card bg-brand-soft px-4 py-3
                           font-mono text-sm tracking-wider text-brand-dark"
              >
                {setup.secret}
              </code>
            </li>
          </ol>

          <label htmlFor="mfa-confirm-code" className="mt-4 block text-xs text-ink-muted">
            アプリに出た6桁
          </label>
          <input
            id="mfa-confirm-code"
            data-testid="mfa-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={FIELD}
          />

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="mfa-confirm"
              className={PLAIN}
              disabled={busy || code.trim().length < 6}
              onClick={confirm}
            >
              確認して入れる
            </button>
            <button
              type="button"
              className={PLAIN}
              disabled={busy}
              onClick={() => {
                setSetup(null);
                setCode("");
                setFailure(null);
                setStage("off");
              }}
            >
              やめる
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------ 予備の合言葉（1回だけ） */}
      {stage === "codes" && (
        <div data-testid="mfa-recovery">
          <p className="flex items-start gap-2 rounded-card bg-brand-soft px-4 py-3
                        text-sm leading-6 text-brand-dark">
            <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
            2段階認証を入れました。
          </p>

          <h4 className="mt-4 text-sm font-bold">予備の合言葉</h4>
          {/*
            ここが最後の逃げ道。

            携帯を無くした・機種を変えた人は、これが無いと自分の
            アカウントから締め出される。「見せて終わり」にせず、
            写したことを押してもらってから閉じる。
          */}
          <p className="mt-1 text-xs leading-6 text-caution">
            この10個は<strong>いま1回だけ</strong>出ます。
            認証アプリが使えなくなったとき、これでログインできます。
            紙に書くか、パスワード管理アプリに入れてください。
          </p>

          <ul
            role="list"
            data-testid="mfa-recovery-codes"
            className="mt-3 grid grid-cols-2 gap-2 rounded-card bg-brand-soft p-4"
          >
            {recovery.map((one) => (
              <li key={one} className="font-mono text-sm tracking-wider text-brand-dark">
                {one}
              </li>
            ))}
          </ul>

          <button
            type="button"
            data-testid="mfa-recovery-done"
            className={`${PLAIN} mt-4`}
            onClick={() => {
              setRecovery([]);
              void reload();
              onNotice("2段階認証を入れました。");
            }}
          >
            控えました
          </button>
        </div>
      )}

      {/* ---------------------------------------------------- 入っている */}
      {stage === "on" && (
        <div data-testid="mfa-on">
          <p className="flex items-start gap-2 text-sm leading-7">
            <IconCheck className="mt-1 h-4 w-4 shrink-0 text-brand" />
            <span>
              入っています。新しい端末で入るときに、認証アプリの6桁を聞きます。
            </span>
          </p>

          {/*
            残りを出す。気づかないうちに使い切ると、次に本当に困る。
            少なくなった人には、入れ直しの道も示す。
          */}
          <p
            data-testid="mfa-recovery-left"
            className={`mt-2 text-xs leading-6 ${
              state && state.recovery_codes_left <= 2 ? "text-caution" : "text-ink-muted"
            }`}
          >
            予備の合言葉の残り {state?.recovery_codes_left ?? 0}個
            {state && state.recovery_codes_left <= 2 &&
              "。少なくなっています。いったんやめて入れ直すと、10個に戻せます"}
          </p>

          <button
            type="button"
            data-testid="mfa-stop"
            className={`${DANGER} mt-4`}
            onClick={() => {
              setCode("");
              setFailure(null);
              setStage("disabling");
            }}
          >
            2段階認証をやめる
          </button>
        </div>
      )}

      {/* ------------------------------------------------------ やめる */}
      {stage === "disabling" && (
        <div data-testid="mfa-disabling">
          {/*
            やめるときにも確認を求める。求めないと、開けたままの端末を
            借りた人が黙って外せる（サーバー側でも同じことを見ている）。
          */}
          <p className="text-sm leading-7">
            やめるには、いまの6桁か、予備の合言葉を1つ入れてください。
          </p>
          <label htmlFor="mfa-stop-code" className="mt-3 block text-xs text-ink-muted">
            6桁、または予備の合言葉
          </label>
          <input
            id="mfa-stop-code"
            data-testid="mfa-stop-code"
            type="text"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={FIELD}
          />

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="mfa-stop-confirm"
              className={DANGER}
              disabled={busy || code.trim().length === 0}
              onClick={stop}
            >
              やめる
            </button>
            <button
              type="button"
              className={PLAIN}
              disabled={busy}
              onClick={() => {
                setCode("");
                setFailure(null);
                setStage("on");
              }}
            >
              続ける
            </button>
          </div>
        </div>
      )}
    </SettingsGroup>
  );
}
