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

import { ApiError } from "../../api/http";
import { needsAccount, saveArtifact } from "../../api/artifacts";
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

  async function keep() {
    if (state.kind === "busy" || state.kind === "kept") return;
    setState({ kind: "busy" });

    try {
      const result = await saveArtifact({ lessonId, output, conditions });
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
    </div>
  );
}
