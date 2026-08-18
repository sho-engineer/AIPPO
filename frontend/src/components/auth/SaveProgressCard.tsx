/**
 * 「いま作ったものを残しませんか」の誘い。
 *
 * 出す場所は、レッスンを1本終えた直後だけ。
 * 始める前に登録を求めると、まだ何も良いことが起きていないので、
 * ほとんどの人はそこで閉じる。作ったものが目の前にあるときに聞く。
 *
 * ログイン済みの人には出さない。断った人にも、その回はもう出さない。
 * 同じ誘いを繰り返すのは、締め出しと同じくらい嫌われる。
 */

import { useState } from "react";

import { AuthDialog } from "./AuthDialog";
import { Card, CardHeading } from "../AppShell";
import { IconCheckCircle, IconStar } from "../Icons";
import { useAuth } from "../../auth/AuthContext";
import { AUTH_COPY } from "../../content/ui";

const REASONS = [
  "別の端末からでも、続きから始められます",
  "作ったものと進み具合が残ります",
  "端末を変えても、やり直しになりません",
];

export function SaveProgressCard() {
  const auth = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (notice) {
    return (
      <Card testId="save-progress-done">
        <p role="status" className="flex items-start gap-2.5 text-sm leading-7">
          <IconCheckCircle className="mt-1.5 h-4 w-4 shrink-0 text-brand" />
          {notice}
        </p>
      </Card>
    );
  }

  // 読み込み中に出すと、ログイン済みの人にも一瞬見えてしまう
  if (auth.loading || auth.user || dismissed) return null;

  return (
    <>
      <Card testId="save-progress">
        <CardHeading icon={IconStar} tone="plain">
          {AUTH_COPY.signUpTitle}
        </CardHeading>

        <ul className="mt-3 space-y-2" role="list">
          {REASONS.map((reason) => (
            <li key={reason} className="flex items-start gap-2.5 text-sm leading-7">
              <IconCheckCircle className="mt-1.5 h-4 w-4 shrink-0 text-brand" />
              {reason}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            data-testid="save-progress-open"
            onClick={() => setOpen(true)}
            className="min-h-[3rem] flex-1 rounded-cta bg-brand px-6 py-3 text-base
                       font-bold text-white shadow-raised transition hover:brightness-110
                       active:brightness-95"
          >
            {AUTH_COPY.submitSignUp}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="min-h-[3rem] flex-1 rounded-cta border border-line px-6 py-3
                       text-sm text-ink-muted transition hover:bg-canvas"
          >
            {AUTH_COPY.cancel}
          </button>
        </div>

        <p className="mt-3 text-xs leading-6 text-ink-muted">
          {AUTH_COPY.guestNotice}
        </p>
      </Card>

      {open && (
        <AuthDialog onClose={() => setOpen(false)} onDone={setNotice} />
      )}
    </>
  );
}
