/**
 * AIへ送る前の、依頼内容の確認。
 *
 * 何を頼むのかを、送る前に自分の言葉で見返せるようにする。
 * ここだけ「入力」でも「結果」でもない——その手前の一拍なので、
 * 独立させてある。
 */

import { Card } from "../../AppShell";

// ------------------------------------------------------- 依頼内容の確認

interface PreviewProps {
  /** かんたん表示に出すカード。 */
  cards: {
    label: string;
    value: string;
    /** 利用者が自分で選んだ条件か。ここだけ薄く塗って繋がりを見せる。 */
    added?: boolean;
  }[];
  /** 詳細表示に出す、実際に送る文章。 */
  detail: string;
  onOpenDetail?: () => void;
}

/**
 * AI にどう伝わるかを、送る前に見せる（要件 §6.5）。
 *
 * 初心者に文面そのものを編集させない。
 * 編集を必須にすると、そこで手が止まる。
 * 直したい人だけが「詳細表示」を開けばよい。
 */
export function PromptPreview({ cards, detail, onOpenDetail }: PreviewProps) {
  return (
    /*
      縦の flex。項目の並びにだけ「残りの高さ」を渡す。
      条件が増えても、下の「くわしく見る」と「次へ」は動かない。
    */
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        面の中に見出しを置かない。

        前はここに「✨ AIにはこう伝えます」を置いていた。画面の見出し
        （`StepShell` が出す `step.title`）と**同じ言葉が上下に2つ**並び、
        しかも面の中の1行ぶん（38px）を取っていた。実機ではそのぶん
        4項目目（読む相手）が枠から切れていた。

        印のキラキラも外す。ここは「送る前に確かめる」場面で、
        魔法の記号が要る場面ではない。
      */}
      <Card className="flex min-h-0 flex-1 flex-col">
        {/*
          項目名と中身を左右に並べる。
          カードを縦に積むより、何を何に決めたのかが一覧で追える。
        */}
        <dl
          className="min-h-0 flex-1 divide-y divide-line overflow-y-auto
                     rounded-card bg-canvas px-4"
          data-testid="prompt-cards"
        >
          {cards.map((card) => (
            <div key={card.label} className="flex gap-4 py-3">
              <dt className="w-20 shrink-0 text-xs text-ink-muted">{card.label}</dt>
              <dd className="min-w-0 flex-1 break-words text-sm font-bold">
                {/*
                  自分が足した分だけ、薄く塗る。

                  項目を並べるだけだと「AIへ渡す一覧」にしか見えず、
                  **さっき自分が選んだことが効いている**という繋がりが
                  切れる。ここが繋がらないと、条件を足す意味が体で分からない。

                  色だけにしない。塗りが見えない人にも分かるよう、
                  読み上げ用の言葉を添える。
                */}
                {card.added ? (
                  <mark
                    data-testid="prompt-added"
                    className="rounded-badge bg-brand-soft px-1.5 py-0.5 text-brand-dark"
                  >
                    <span className="sr-only">あなたが足した条件: </span>
                    {card.value}
                  </mark>
                ) : (
                  card.value
                )}
              </dd>
            </div>
          ))}
        </dl>

        {cards.some((card) => card.added) && (
          <p className="mt-3 shrink-0 text-xs leading-6 text-ink-muted">
            色が付いているところが、さっき選んだ条件です。
          </p>
        )}
      </Card>

      <details
        className="mt-4 shrink-0 rounded-card bg-surface px-4 py-3 shadow-card"
        onToggle={(event) => {
          if ((event.currentTarget as HTMLDetailsElement).open) onOpenDetail?.();
        }}
      >
        <summary className="cursor-pointer text-xs font-bold text-ink-muted">
          くわしく見る（実際に送る内容）
        </summary>
        <pre
          data-testid="prompt-detail"
          className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-ink-muted"
        >
          {detail}
        </pre>
      </details>
    </div>
  );
}
