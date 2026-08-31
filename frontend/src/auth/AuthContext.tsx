/**
 * ログイン状態を、アプリ全体で1か所に持つ。
 *
 * 置き場所はここだけ。localStorage にも sessionStorage にも書かない。
 * 本当の状態を持っているのはサーバーで、この画面はその写しを見ているだけ。
 * 写しを端末に貯めると、ログアウト済みなのにログイン中に見える、
 * 別端末で退会したのに残る、といったずれが必ず出る。
 *
 * 起動時に1回 `me` を聞く。それまでは `loading`。
 * `loading` のあいだにログイン前提の画面を出すと、一瞬だけ
 * 「ログインしてください」が見えてから中身が出る。それを避ける。
 *
 * 聞き直すとき
 * ------------
 * 起動時の1回だけでは足りない。ログインには期限があり
 * （`backend/config/settings.py` の SESSION_COOKIE_AGE と
 * SESSION_ABSOLUTE_MAX_AGE）、開いたままの画面ではその瞬間が来ても
 * 誰も気づかない。結果、**サーバーから見ればログアウトしているのに、
 * 画面だけログイン中のまま**という状態が続く。
 * その画面で登録した気になって進めても、記録はどこにも残らない。
 *
 * そこで、次のときに聞き直す。
 *
 *   - 画面が表に戻ったとき（別のタブやアプリから帰ってきた）
 *   - 窓に焦点が戻ったとき
 *   - 表に出ているあいだ、一定の間隔で
 *
 * 聞き直しは短い GET が1本。ただし戻ってくるたびに投げると、
 * タブを行き来するだけで何度も鳴るので、最短の間隔を空ける。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import * as api from "../api/accounts";
import type { AccountUser, MigrationResult, Progress } from "../api/accounts";

/**
 * 表に出ているあいだ、これだけ経ったら聞き直す。
 *
 * 5分。切れた瞬間に気づく必要は無いが、
 * 何時間も開いたままの画面が「ログイン中」を主張し続けるのは避けたい。
 */
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 聞き直しの最短の間隔。
 *
 * タブを行き来するたびに投げると、切り替えの回数だけ鳴る。
 * 30秒あれば、期限切れに気づくのは十分に速い。
 */
const RECHECK_THROTTLE_MS = 30 * 1000;

export interface AuthState {
  loading: boolean;
  user: AccountUser | null;
  progress: Progress | null;
  /** 直前の登録で、ゲストの記録を引き継げたか。祝いの言い方を変える。 */
  lastMigration: MigrationResult | null;
}

export interface AuthActions {
  signUp: (input: api.SignUpInput) => Promise<MigrationResult>;
  /**
   * ログイン。
   *
   * 2段階認証を入れている人には `mfa_required` が返る。**その時点では
   * まだ入っていない。** 呼んだ側がコードを聞き、`finishSignIn` を呼ぶ。
   */
  signIn: (email: string, password: string) => Promise<{ mfaRequired: boolean }>;
  /** 追加の確認が通ったあと。ログイン状態を取り直す。 */
  finishSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  /** サーバーへ聞き直す。進み具合の表示を更新したいときに使う。 */
  refresh: () => Promise<void>;
  dismissMigrationNotice: () => void;
}

export type Auth = AuthState & AuthActions;

const AuthContext = createContext<Auth | null>(null);

const INITIAL: AuthState = {
  loading: true,
  user: null,
  progress: null,
  lastMigration: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL);

  const apply = useCallback((me: api.MeResponse) => {
    setState((current) => ({
      ...current,
      loading: false,
      user: me.authenticated ? (me.user ?? null) : null,
      progress: me.authenticated ? (me.progress ?? null) : null,
    }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api.fetchMe());
    } catch {
      /*
        聞けなかった。ログインしていない扱いにする。

        ここで前の状態を残すと、通信が切れているあいだ
        「ログイン中なのに何もできない」画面になる。
      */
      setState((current) => ({ ...current, loading: false, user: null, progress: null }));
    }
  }, [apply]);

  useEffect(() => {
    let alive = true;
    void api
      .fetchMe()
      .then((me) => alive && apply(me))
      .catch(() => {
        if (alive) setState((current) => ({ ...current, loading: false }));
      });
    return () => {
      alive = false;
    };
  }, [apply]);

  /*
    ログインが切れていないか、ときどき聞き直す。

    聞くのはサーバーだけ。ここで自前に期限を数えて切ると、
    端末の時計がずれているだけでログアウトさせてしまうし、
    サーバー側が先に切った場合には気づけない。
    期限を決めるのも数えるのもサーバーの仕事で、
    画面はその答えに従うだけにする。
  */
  const lastCheckedAt = useRef(0);

  useEffect(() => {
    // ログインしていない人には聞かない。聞いても答えは変わらないので、
    // ゲストのまま学んでいる人に無駄な通信をさせないため
    if (!state.user) return;

    let alive = true;

    const recheck = (force = false) => {
      const now = Date.now();
      if (!force && now - lastCheckedAt.current < RECHECK_THROTTLE_MS) return;
      lastCheckedAt.current = now;
      if (alive) void refresh();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = window.setInterval(() => {
      // 裏に回っているあいだは鳴らさない。戻ってきたときに聞けば足りる
      if (document.visibilityState === "visible") recheck(true);
    }, RECHECK_INTERVAL_MS);

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(timer);
    };
  }, [state.user, refresh]);

  const actions = useMemo<AuthActions>(
    () => ({
      async signUp(input) {
        const { user, migration } = await api.signUp(input);
        setState({ loading: false, user, progress: null, lastMigration: migration });
        // 進み具合はサーバーが数える。引き継いだ直後は特に。
        await refresh();
        return migration;
      },

      async signIn(email, password) {
        const result = await api.signIn(email, password);
        if (result.mfa_required) {
          // まだ入っていない。コードが通るまで、状態は変えない
          return { mfaRequired: true };
        }
        setState({
          loading: false,
          user: result.user ?? null,
          progress: null,
          lastMigration: null,
        });
        await refresh();
        return { mfaRequired: false };
      },

      async finishSignIn() {
        await refresh();
      },

      async signOut() {
        try {
          await api.signOut();
        } finally {
          // 通信に失敗しても、この端末の表示はログアウトにする。
          // 押したのに残っていると、共用の端末で次の人に見えてしまう
          setState({ ...INITIAL, loading: false });
        }
      },

      async setDisplayName(name) {
        const { user } = await api.updateDisplayName(name);
        setState((current) => ({ ...current, user }));
      },

      refresh,

      dismissMigrationNotice() {
        setState((current) => ({ ...current, lastMigration: null }));
      },
    }),
    [refresh],
  );

  const value = useMemo<Auth>(() => ({ ...state, ...actions }), [state, actions]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * ログイン状態を読む。
 *
 * Provider の外で呼ばれたときは、ゲストとして動く値を返す。
 * 例外にすると、テストや一部だけ切り出した描画で落ちる。
 * このアプリは登録なしでも最後まで使えるので、それが自然な既定値でもある。
 */
export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (value) return value;

  return {
    loading: false,
    user: null,
    progress: null,
    lastMigration: null,
    signUp: async () => {
      throw new Error("AuthProvider がありません");
    },
    signIn: async () => {
      throw new Error("AuthProvider がありません");
    },
    finishSignIn: async () => {},
    signOut: async () => {},
    setDisplayName: async () => {},
    refresh: async () => {},
    dismissMigrationNotice: () => {},
  };
}
