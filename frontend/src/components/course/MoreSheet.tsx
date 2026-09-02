/**
 * 「くわしく見る」で開く一枚。
 *
 * なぜ要るか
 * ----------
 * レッスンは1画面＝1アクションに収める。ところが比べる画面には、
 * 本題（2つを見比べる）のほかに**確かめたい人だけが要るもの**が
 * 積まれていた——1文ずつの差分、元の文章からの道のり、これまでの結果。
 * 畳んで（`<details>`）置いてはいたが、畳んだ見出しの行そのものが
 * 場所を取るうえ、開けばその場でページが伸びる。
 *
 * ここへ移す。本題の画面は短いまま、確かめたい人は1回押せば全部読める。
 *
 * 中で送るのは構わない
 * --------------------
 * 開いた一枚の中は縦に送れる。**画面が送れないこと**が守りたい形で、
 * 自分で開いた一枚まで1画面に収める必要はない。
 *
 * 閉じ方は3つ
 * -----------
 * ×・背景・Esc。1つしか無いと、開いた人が閉じ方を探すことになる。
 *
 * body へ出す（portal）
 * --------------------
 * `position: fixed` は、**先祖に `transform` があるとそこに閉じ込め
 * られる**。レッスンの中身は `StepTransition` が包んでいて、そこには
 * 画面の入れ替わりを見せるための `transform` が常に入っている。
 * つまり画面の中で開くと、一枚は「その回の中身の枠」の中に収まって
 * しまう——背景も暗くならず、見出しも切れる（実際そうなった）。
 *
 * `fixed` を使う以上、置き場所は body でなければならない。
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface MoreSheetProps {
  title: string;
  onClose: () => void;
  /**
   * 一枚の上に、もう一枚。
   *
   * 「変わったところ」の中の文章をタップして全文を出すときに使う。
   * 下の一枚を閉じずに重ねるので、閉じれば元の続きから読める。
   */
  elevated?: boolean;
  children: ReactNode;
}

/**
 * いま開いている一枚の重なり順。
 *
 * Esc は**いちばん上の一枚だけ**を閉じる。全部が同じ `keydown` を
 * 聞いていると、全文を閉じたつもりで下の一枚まで消える——押した人
 * から見れば「元の続きが読めない」（実際そうなった）。
 *
 * 番号だけの配列にしてある。中身を持たせる必要は無く、
 * **自分がいちばん後ろか**だけ分かればよい。
 */
const stack: symbol[] = [];

export function MoreSheet({
  title,
  onClose,
  elevated = false,
  children,
}: MoreSheetProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const me = Symbol("more-sheet");
    stack.push(me);
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 上に別の一枚が開いていれば、そちらが閉じる番
      if (stack[stack.length - 1] !== me) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const at = stack.indexOf(me);
      if (at >= 0) stack.splice(at, 1);
    };
  }, [onClose]);

  const sheet = (
    <div
      className={`fixed inset-0 flex items-end justify-center sm:items-center ${
        elevated ? "z-40" : "z-30"
      }`}
      data-testid={elevated ? "full-text-sheet" : "more-sheet"}
    >
      {/*
        下の画面を沈める。**消さない。**
        何の上に開いているのかが見えていないと、閉じた先が分からない。
      */}
      <button
        type="button"
        aria-label="閉じる"
        data-testid={elevated ? "full-text-scrim" : "more-sheet-scrim"}
        onClick={onClose}
        className="absolute inset-0 bg-ink/45"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={elevated ? "full-text-title" : "more-sheet-title"}
        tabIndex={-1}
        /*
          スマホでは下から。指の届く側から出るほうが、閉じるのも近い。
          高さは画面の 8 割まで。**残り 2 割で下が見えている**ことが、
          「上に開いている」と分かる手がかりになる。
        */
        className="animate-slide-in relative flex max-h-[80dvh] w-full max-w-md flex-col
                   rounded-t-panel bg-surface shadow-dialog outline-none
                   sm:max-h-[80vh] sm:rounded-panel"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3.5">
          <h2
            id={elevated ? "full-text-title" : "more-sheet-title"}
            className="min-w-0 flex-1 text-sm font-bold"
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="閉じる"
            data-testid={elevated ? "full-text-close" : "more-sheet-close"}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                       text-ink-muted transition hover:bg-brand-soft"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* ここだけ送れる。`min-h-0` が無いと縦に伸びて画面から出る */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );

  /*
    描く場所は body。理由は冒頭に書いた。

    `document.body` はブラウザにしか無い。サーバー側で組み立てる作りに
    なったときのために、無ければそのまま返す（そこでは重ならないが、
    中身は読める）。
  */
  return typeof document === "undefined"
    ? sheet
    : createPortal(sheet, document.body);
}

/**
 * その一枚をひらくボタン。
 *
 * 畳んだ見出し（`<details>` の三角）と見分けが付くようにする。
 * 三角は「その場で開く」の印で、押すと別の一枚が出るここには合わない。
 */
export function MoreButton({
  children,
  onClick,
  testId,
}: {
  children: ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex min-h-[2.5rem] w-full items-center justify-center gap-1.5
                 rounded-cta border border-brand-line bg-surface px-4 text-xs
                 font-bold text-brand-dark transition hover:bg-brand-soft"
    >
      {children}
    </button>
  );
}

/**
 * 文章そのものを押せるようにする。
 *
 * なぜ要るか
 * ----------
 * 「変わったところ」の一枚に並ぶ文章は、長い日には途中で切れる。
 * 切れた先を読むために画面を送らせると、比べるために開いた一枚が
 * また「読む場所」になる。**押せば全文**にしておけば、一覧は
 * 短いまま保てる。
 *
 * 押せることが分かる形にする
 * --------------------------
 * ただの段落を押せるようにしても、押せると気づかれない。囲いを付け、
 * 右下に「全文を見る」を添える。`<button>` にしてあるので、
 * キーボードでも読み上げでも同じように届く。
 */
export function FullText({
  label,
  text,
  testId,
}: {
  /** 何の文章か。「元の文章」「AIの結果」など。 */
  label: string;
  text: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const body = text || "（入力なし）";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testId}
        aria-label={`${label}の全文を見る`}
        className="block w-full rounded-card border border-line bg-surface p-3.5
                   text-left transition hover:border-brand-line hover:bg-brand-soft/40"
      >
        {/*
          3行で切る。**切れていることが見える**ようにする——
          省略記号が出ないと、そこで終わっている文章に見える。
        */}
        <span className="line-clamp-3 block whitespace-pre-wrap break-words text-sm leading-7">
          {body}
        </span>
        <span className="mt-2 block text-right text-xs font-bold text-brand-dark">
          全文を見る
        </span>
      </button>

      {open && (
        <MoreSheet elevated title={label} onClose={() => setOpen(false)}>
          <p className="whitespace-pre-wrap break-words text-sm leading-7">{body}</p>
        </MoreSheet>
      )}
    </>
  );
}
