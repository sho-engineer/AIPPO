/**
 * 結果の「詳しく」を開く一枚。
 *
 * なぜ要るか
 * ----------
 * 結果の画面に、判定と根拠と学ぶ内容を全部積んでいた。答えの
 * 組み合わせによって文章の量が変わるので、**人によって画面が縦に
 * 伸びる**——実測で、375×667 のおすすめが 21px、390×844 の現在地が
 * 42px、320×568 では現在地が最大 148px あふれていた。
 *
 * 隠して収めない
 * --------------
 * `overflow: hidden` で切るのは、読めなくするだけで解決ではない。
 * 消すのでもない。**表示の単位を分ける**——主画面には判断と次の一手を
 * 置き、その根拠はここで開く。
 *
 * 長いときは、めくる
 * ------------------
 * 1枚に全部入れると、こんどは一枚の中が長い送りになる。中身を
 * 「判定の理由」「回答の振り返り」のように分けて、前へ／次へで
 * 1つずつ出す。**情報は減らさない。出す単位を小さくする。**
 *
 * 土台は作らない
 * --------------
 * 開き方・背景の暗さ・背景の送り止め・焦点の閉じ込め・閉じたあとの
 * 焦点の戻し・「戻る」で閉じる——**全部 `MoreSheet` が持っている**。
 * ここでやるのは、中身をめくる部分だけ。
 */

import { useState, type ReactNode } from "react";

import { IconChevronRight } from "../../Icons";
import { MoreSheet } from "../MoreSheet";

export interface DetailPage {
  /** めくりの見出し。1枚だけのときは出さない。 */
  label: string;
  body: ReactNode;
}

export interface DetailSheetProps {
  /** 一枚の題。読み上げが最初に読む。 */
  title: string;
  pages: DetailPage[];
  onClose: () => void;
}

export function DetailSheet({ title, pages, onClose }: DetailSheetProps) {
  const [at, setAt] = useState(0);
  const many = pages.length > 1;
  const page = pages[Math.min(at, pages.length - 1)];

  return (
    <MoreSheet
      placement="center"
      title={title}
      onClose={onClose}
      testId="diagnosis-detail-sheet"
    >
      {/*
        いま何枚目か。**めくれることが、開いた時点で分かるように。**
        1枚しか無いときは出さない——めくれない目盛りは飾りになる。
      */}
      {many && (
        <p
          className="mb-2 text-xs font-bold leading-5 text-brand-dark"
          data-testid="detail-label"
        >
          {page.label}
          <span className="ml-1.5 font-normal text-ink-muted">
            {at + 1} / {pages.length}
          </span>
        </p>
      )}

      <div data-testid="detail-body">{page.body}</div>

      {many && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setAt((now) => Math.max(0, now - 1))}
            disabled={at === 0}
            data-testid="detail-prev"
            className="min-h-[2.75rem] rounded-cta px-3 text-sm font-bold
                       text-brand-dark transition hover:bg-brand-soft
                       disabled:cursor-not-allowed disabled:opacity-40"
          >
            前へ
          </button>
          <button
            type="button"
            onClick={() => setAt((now) => Math.min(pages.length - 1, now + 1))}
            disabled={at >= pages.length - 1}
            data-testid="detail-next"
            className="flex min-h-[2.75rem] items-center gap-1 rounded-cta px-3
                       text-sm font-bold text-brand-dark transition
                       hover:bg-brand-soft disabled:cursor-not-allowed
                       disabled:opacity-40"
          >
            次へ
            <IconChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </MoreSheet>
  );
}
