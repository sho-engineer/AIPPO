/**
 * 修了証への入り口。
 *
 * **1枚も無いときは何も描かない**（null を返す）。
 *
 * 「まだありません」の枠を置くと、教材一覧を開くたびに
 * 持っていないものを数えさせることになる。始めたばかりの人が
 * いちばん多いのだから、その人の画面に空の棚を並べない。
 * 1枚目を取ったときに初めて現れる——それで気づく。
 */

import { IconMark } from "../AppShell";
import { IconMedal } from "../Icons";

export function CertificateEntry({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) {
  if (count === 0) return null;

  return (
    <section className="mt-5" aria-labelledby="certificate-heading">
      <h2 id="certificate-heading" className="sr-only">
        修了証
      </h2>
      <button
        type="button"
        onClick={onOpen}
        data-testid="open-certificate"
        className="row row-tap items-center gap-2.5"
      >
        <IconMark icon={IconMedal} className="h-[1.125rem] w-[1.125rem]" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold leading-6">修了証を見る</span>
          <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
            終えたコース {count}件
          </span>
        </span>
      </button>
    </section>
  );
}
