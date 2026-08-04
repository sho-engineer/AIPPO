/**
 * ログイン状態を、アプリ全体で1か所に持つ。
 *
 * 置き場所はここだけ。localStorage にも sessionStorage にも書かない。
 * 本当の状態を持っているのはサーバーで、この画面はその写しを見ているだけ。
 * 写しを端末に貯めると、ログアウト済みなのにログイン中に見える、
 * 別端末で退会したのに残る、といったずれが必ず出る。
 *
 * 起動時に1回だけ `me` を聞く。それまでは `loading`。
 * `loading` のあいだにログイン前提の画面を出すと、一瞬だけ
 * 「ログインしてください」が見えてから中身が出る。それを避ける。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import * as api from "../api/accounts";
import type { AccountUser, MigrationResult, Progress } from "../api/accounts";

export interface AuthState {
  loading: boolean;
  user: AccountUser | null;
  progress: Progress | null;
  /** 直前の登録で、ゲストの記録を引き継げたか。祝いの言い方を変える。 */
  lastMigration: MigrationResult | null;
}

export interface AuthActions {
  signUp: (input: api.SignUpInput) => Promise<MigrationResult>;
  signIn: (email: string, password: string) => Promise<void>;
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
        const { user } = await api.signIn(email, password);
        setState({ loading: false, user, progress: null, lastMigration: null });
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
    signOut: async () => {},
    setDisplayName: async () => {},
    refresh: async () => {},
    dismissMigrationNotice: () => {},
  };
}
