/**
 * 作ったものを取っておくボタン。
 *
 * コピーとの違い
 * --------------
 *     コピー   … いま貼り付ける。この画面を離れると手元にしか残らない
 *     取っておく … あとで探して出す。名前が付き、消えない
 *
 * 両方を並べて置く。仕事にすぐ使う人と、あとでまた使う人がいる。
 *
 * 押せない人にも理由を出す
 * ------------------------
 * 取っておけるのは登録した人だけ（ゲストの鍵は7日で切れるので、
 * 取っておいたものが黙って消える）。ボタン自体は出しておき、
 * 押したときにその場で理由を返す。**先に消してしまうと、
 * そういう機能があること自体が伝わらない。**
 *
 * 二度押しても失敗にしない
 * ------------------------
 * 同じものは増えない（サーバーが出力のハッシュで弾く）。
 * 押し直しただけの人に赤い字を出さず、「取ってあります」と伝える。
 */

import { useState } from "react";

import { AuthDialog } from "../auth/AuthDialog";
import { AUTH_COPY } from "../../content/ui";
import { ApiError } from "../../api/http";
import { needsAccount, saveArtifact } from "../../api/artifacts";
import { EVENTS, track } from "../../lib/analytics";
import { IconBookmark, IconCheck } from "../Icons";

export interface KeepArtifactButtonProps {
  lessonId: string;
  output: string;
  conditions?: Record<string, string>;
  /** 取っておけたとき。呼び出し側が一覧を取り直す。 */
  onKept?: () => void;
}

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "kept"; already: boolean }
  | { kind: "failed"; message: string; requiresAccount: boolean };

export function KeepArtifactButton({
  lessonId,
  output,
  conditions,
  onKept,
}: KeepArtifactButtonProps) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [signingUp, setSigningUp] = useState(false);

  async function keep() {
    if (state.kind === "busy" || state.kind === "kept") return;
    setState({ kind: "busy" });

    try {
      const result = await saveArtifact({ lessonId, output, conditions });
      // 二度目は数えない。同じ物が増えていないので、保存でもない
      if (!result.already_saved) track(EVENTS.artifactSaved, { lessonId });
      setState({ kind: "kept", already: result.already_saved });
      onKept?.();
    } catch (error) {
      setState({
        kind: "failed",
        message: needsAccount(error)
          ? "登録すると、ここに取っておけます。"
          : error instanceof ApiError
            ? error.detail
            : "うまく取っておけませんでした。もう一度お試しください。",
        requiresAccount: needsAccount(error),
      });
    }
  }

  const kept = state.kind === "kept";

  return (
    <div>
      <button
        type="button"
        onClick={keep}
        disabled={state.kind === "busy" || kept}
        data-testid="keep-artifact"
        className="flex min-h-[2.75rem] items-center gap-1.5 rounded-badge border
                   border-line px-3 py-1.5 text-xs text-ink-muted transition
                   hover:border-brand hover:text-brand-dark
                   disabled:cursor-default disabled:border-brand-line
                   disabled:text-brand-dark"
      >
        {kept ? (
          <IconCheck className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <IconBookmark className="h-3.5 w-3.5 shrink-0" />
        )}
        {state.kind === "busy"
          ? "取っておいています…"
          : kept
            ? state.already
              ? "取ってあります"
              : "取っておきました"
            : "取っておく"}
      </button>

      {state.kind === "failed" && (
        <p
          role="status"
          data-testid="keep-artifact-note"
          className={`mt-1.5 text-xs leading-6 ${
            state.requiresAccount ? "text-ink-muted" : "text-caution"
          }`}
        >
          {state.message}
        </p>
      )}

      {/*
        断ったあとに、行き先を置く。

        前は「取っておくには登録が要ります」で終わっていた。理由は
        伝わるが、**そこから先が無い**——押した人は自分で設定を探しに
        行くことになる。押したのは「取っておきたい」という意思表示
        なので、そのまま進める口をその場に置く。
      */}
      {state.kind === "failed" && state.requiresAccount && (
        <button
          type="button"
          data-testid="keep-artifact-signup"
          onClick={() => setSigningUp(true)}
          className="mt-1.5 text-xs font-bold text-brand underline
                     transition hover:text-brand-dark"
        >
          {AUTH_COPY.submitSignUp}
        </button>
      )}

      {signingUp && (
        <AuthDialog
          mode="signup"
          onClose={() => setSigningUp(false)}
          /*
            登録できたら、押したかった操作をこちらでやり直す。
            もう一度「取っておく」を探させない。
          */
          onDone={() => {
            setSigningUp(false);
            void keep();
          }}
        />
      )}
    </div>
  );
}
