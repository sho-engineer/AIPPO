/**
 * 規約・ポリシーの本文。
 *
 * 別の場所へ飛ばさず、アプリの中で読ませる。登録の途中で外部の
 * ページへ飛ばすと、戻ってきたときに入力が消えている。
 *
 * 読みやすさを本文と同じ扱いにしてある。細かい字で詰めた規約は、
 * 読み飛ばされる。読み飛ばされた同意は、同意として弱い。
 */

import { SettingsList } from "../settings/Controls";
import { LEGAL_DOCUMENTS, type LegalDocument } from "../../content/legal";

export function LegalView({ document }: { document: LegalDocument }) {
  return (
    <article className="mt-6" data-testid={`legal-${document.id}`}>
      <p className="text-sm leading-7 text-ink-muted">{document.summary}</p>
      <p className="mt-1 text-xs text-ink-muted">{document.updatedAt} 現在</p>

      <div className="mt-5 space-y-6">
        {document.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-sm font-bold">{section.heading}</h2>
            <div className="mt-2 space-y-2">
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-7">
                  {emphasize(paragraph)}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

/**
 * `**…**` を太字にする。
 *
 * 見出しではなく本文の中で、1か所だけ強めたい語がある。
 * そこに Markdown の描画部品を持ち込むほどではない。
 */
function emphasize(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

/** 3つの入り口。設定と、登録の画面から使う。 */
export function LegalMenu({
  onOpen,
}: {
  onOpen: (id: LegalDocument["id"]) => void;
}) {
  return (
    <SettingsList>
      {LEGAL_DOCUMENTS.map((document) => (
        <li key={document.id} className="border-b border-line last:border-b-0">
          <button
            type="button"
            data-testid={`legal-open-${document.id}`}
            onClick={() => onOpen(document.id)}
            className="w-full px-5 py-3.5 text-left text-sm font-bold transition
                       hover:bg-brand-soft/40 active:bg-brand-soft"
          >
            {/*
              3つとも中身の違いが題名で分かる（利用規約／プライバシー
              ポリシー／AI利用上の注意）。要約を添えると、読むための
              一覧が、読む前に読むものになる。
            */}
            {document.title}
          </button>
        </li>
      ))}
    </SettingsList>
  );
}
