/**
 * 送信前の確認（要件 §7）。
 *
 * 即座に禁止しない。「確認してください」と伝えて、選ばせる。
 * ただしパスワード・APIキー・カード番号は、取り消せない実害が
 * 出るので、初期状態では送信できないようにする。
 *
 * 見つけた文字列そのものは画面に出さない。
 * 「メールアドレスが含まれています」で足りるし、
 * 出すと、それはそれで危ない。
 */

import { useEffect, useRef } from "react";

import { IconBlocked, IconCaution } from "../Icons";
import {
  isBlocking,
  PRIVACY_COPY,
  type PrivacyFinding,
} from "../../lib/privacy";

export interface PrivacyDialogProps {
  findings: PrivacyFinding[];
  onEdit: () => void;
  onSend: () => void;
}

export function PrivacyDialog({ findings, onEdit, onSend }: PrivacyDialogProps) {
  const blocked = isBlocking(findings);
  const editButton = useRef<HTMLButtonElement>(null);

  // 開いたら「修正する」に焦点を置く。
  // 危ないほうを既定にしない。
  useEffect(() => editButton.current?.focus(), []);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="privacy-title"
      data-testid="privacy-dialog"
      className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-card bg-surface p-5 shadow-pop">
        <h2
          id="privacy-title"
          className="flex items-center gap-2 text-lg font-bold text-caution"
        >
          <IconCaution className="h-5 w-5 shrink-0" />
          {PRIVACY_COPY.title}
        </h2>

        <p className="mt-3 text-sm leading-7">
          {blocked ? PRIVACY_COPY.blockedBody : PRIVACY_COPY.body}
        </p>

        <ul className="mt-4 space-y-1 text-sm" role="list">
          {findings.map((finding) => (
            <li key={finding.id} className="flex items-start gap-2">
              {finding.level === "block" ? (
                <IconBlocked className="mt-1.5 h-4 w-4 shrink-0 text-caution" />
              ) : (
                <span aria-hidden="true">・</span>
              )}
              <span>
                {finding.label}
                {finding.level === "block" && (
                  <span className="ml-1 font-bold text-caution">（消してください）</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            ref={editButton}
            type="button"
            onClick={onEdit}
            className="min-h-[3rem] flex-1 rounded-full bg-brand-grad px-6 py-3 text-base
                       font-bold text-white shadow-pop transition
                       hover:brightness-110 active:brightness-95"
          >
            {PRIVACY_COPY.edit}
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={blocked}
            data-testid="privacy-send-anyway"
            className="min-h-[3rem] flex-1 rounded-full border border-brand-line px-6 py-3
                       text-sm text-brand-dark transition hover:bg-brand-soft
                       disabled:cursor-not-allowed disabled:border-line
                       disabled:text-ink-muted"
          >
            {PRIVACY_COPY.send}
          </button>
        </div>

        {blocked && (
          <p className="mt-3 text-xs leading-6 text-ink-muted">
            消してから、もう一度お試しください。
          </p>
        )}
      </div>
    </div>
  );
}
