/**
 * 画面が壊れたときの受け皿。
 *
 * これが無いと、どこか1か所で例外が出ただけで**真っ白な画面**になる。
 * 初心者向けのアプリでは、それは「自分が壊した」と受け取られて
 * そこで離脱してしまう。ポーを出して、次にやることだけを伝える。
 *
 * React には関数コンポーネント版のエラー境界が無いため、
 * ここだけクラスで書いている。
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

import { CRASH } from "../content/ui";
import { PoeAvatar } from "./PoeAvatar";

interface Props {
  children: ReactNode;
  /** テストや計測から差し込む。既定では console に出す。 */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.props.onError) {
      this.props.onError(error, info);
      return;
    }
    // 学習者には見せないが、原因を追えるようには残す
    console.error("画面が壊れました", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        data-testid="crash-view"
        className="mx-auto max-w-2xl px-6 py-16 pb-48 sm:pb-16"
      >
        <h1 className="text-xl font-bold">{CRASH.title}</h1>
        <p className="mt-3 text-sm leading-7">{CRASH.body}</p>

        <button
          type="button"
          data-testid="crash-retry"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-xl bg-neutral-900 px-6 py-3 text-sm text-white"
        >
          {CRASH.retry}
        </button>

        <PoeAvatar
          tutor={{ message: CRASH.poe, emotion: "warning", action: "retry" }}
        />
      </main>
    );
  }
}
