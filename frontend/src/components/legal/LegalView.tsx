/**
 * 規約・ポリシーの本文。
 *
 * 別の場所へ飛ばさず、アプリの中で読ませる。登録の途中で外部の
 * ページへ飛ばすと、戻ってきたときに入力が消えている。
 *
 * 読みやすさを本文と同じ扱いにしてある。細かい字で詰めた規約は、
 * 読み飛ばされる。読み飛ばされた同意は、同意として弱い。
 */

import { Card } from "../AppShell";
import { LEGAL_DOCUMENTS, type LegalDocument } from "../../content/legal";

export function LegalView({ document }: { document: LegalDocument }) {
  return (
    <Card className="mt-5" testId={`legal-${document.id}`}>
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
    </Card>
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
    <Card className="mt-5" padded={false}>
      <ul role="list">
        {LEGAL_DOCUMENTS.map((document) => (
          <li key={document.id} className="border-b border-line last:border-b-0">
            <button
              type="button"
              data-testid={`legal-open-${document.id}`}
              onClick={() => onOpen(document.id)}
              className="w-full px-4 py-3.5 text-left transition
                         hover:bg-brand-soft/50 active:bg-brand-soft"
            >
              <span className="block text-sm font-bold">{document.title}</span>
              <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
                {document.summary}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
