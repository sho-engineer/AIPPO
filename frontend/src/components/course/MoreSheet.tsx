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

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  /**
   * 絵を1枚だけ見せる一枚。左右と上の余白を捨てて、**画面の幅いっぱい**に出す。
   *
   * なぜ「高さを8割で固定」ではないか
   * ---------------------------------
   * 一度そう作って、実際に測ってから戻した。全体図はほぼ正方形
   * （1254×1254）で、スマホでは**幅が上限**になる。393px の画面なら
   * どうやっても 393×393 より大きくならない。
   *
   * 高さだけ 8 割（581px）に決めると、絵は 397px のままで、
   * 余った 135px が白いまま上下に残る——**絵は大きくならず、
   * 余白だけが増える。** 画面写真で見て分かった。
   *
   * なので 8 割は**上限**として置き、絵には幅を全部渡す。
   * 左右の余白（`px-5`）をやめるだけで 353px → 393px になる（面積で 1.2 倍）。
   * 縦長の絵に差し替えれば、そのぶん自動で 8 割まで伸びる。
   */
  bleed?: boolean;
  /**
   * 出る場所。
   *
   *   sheet  … 画面の下から。**読み物**を開くとき（既定）。
   *            指の届く側から出るので、閉じるのも近い
   *   center … 画面の中央に浮かべる。**1つのことを見て、次へ進む**とき。
   *            レッスンの導入、全体図、「AIに送る文章」
   *   full   … 画面いっぱいに近い大きさ。**読み込む**とき。
   *            「詳しく見る」の中身はここ。中は縦に送れる
   *
   * 分けているのは、下から出る形が**続きがある**ことを匂わせるため。
   * 送れば次が出てくる読み物ならそれでよいが、ひとつ見て閉じる場面では
   * 開発中の仮画面のように見える。中央に浮かべると、「これを見て次へ」が
   * ひと目で分かる。
   */
  placement?: "sheet" | "center" | "full";
  /**
   * 検査の手がかり。
   *
   * 既定は `more-sheet`。同じ画面で2枚以上開くところ（レッスンの導入と
   * 全体図）は、**どちらを指しているのか決められる**ように別の名前を
   * 付ける。付けないと「複数見つかった」で検査が止まる。
   *
   * ×と背景の目印も、ここから作る（`-sheet` を落として `-close` /
   * `-scrim`）。`lesson-intro-sheet` なら `lesson-intro-close`。
   */
  testId?: string;
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

/**
 * 開いているあいだ、後ろのページを動かさない。
 *
 * 一枚は body の上に `fixed` で浮いている。指が一枚の外へ出ると、
 * そのまま**後ろのページ**が送られる——読んでいた場所が動き、閉じた
 * 先が別のところになる。ホームや設定のように長いページで目に付く。
 *
 * 元の値へ戻す。`""` で上書きすると、`overflow` を自分で指定している
 * ページ（レッスンは `hidden` を敷いている）の設定を消してしまう。
 *
 * 重なっているときは、いちばん外側の一枚が閉じるまで戻さない。
 * 数えるのは `stack` の長さで足りる。
 */
let unlockedOverflow = "";
function lockPage(): void {
  if (typeof document === "undefined") return;
  if (stack.length !== 1) return;
  unlockedOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
}
function unlockPage(): void {
  if (typeof document === "undefined") return;
  if (stack.length !== 0) return;
  document.body.style.overflow = unlockedOverflow;
}

export function MoreSheet({
  title,
  onClose,
  elevated = false,
  bleed = false,
  placement = "sheet",
  testId,
  children,
}: MoreSheetProps) {
  const centered = placement !== "sheet";
  const full = placement === "full";
  const panel = useRef<HTMLDivElement>(null);
  /*
    見出しの id は**この一枚だけのもの**にする。

    導入の上に「詳しく見る」を重ねると、同じ id の見出しが画面に2つ
    並ぶ。`aria-labelledby` は最初の1つを拾うので、上に開いた一枚が
    下の一枚の名前で読み上げられる。
  */
  const titleId = useId();
  /*
    ×と背景の目印も、一枚ごとに変える。2枚開いているときに
    「閉じるを押す」と書けなくなるため（どちらの×か決められない）。
  */
  const hook = testId
    ? testId.replace(/-sheet$/, "")
    : elevated
      ? "full-text"
      : "more-sheet";

  /*
    閉じ方は毎回作り直される（呼ぶ側が `onClose={() => setOpen(false)}`
    と書くため）。それを下の `useEffect` の見張りに入れると、**親が描き
    直されるたびに開き直した扱いになる**。

    重ねているときに効いてくる。導入の上に「詳しく見る」を開くと親が
    描き直り、下に居る導入が並びの**いちばん後ろへ付け直される**。
    その状態で Esc を押すと、上の一枚ではなく導入が閉じる。ついでに
    `focus()` もやり直されるので、開いたばかりの一枚から下の一枚へ
    焦点が戻る——読み上げでは、開いた覚えのない場所から読み始める。

    並びへの出入りは**開いた時と閉じた時の2回だけ**。だから見張りは
    空にして、閉じ方は箱越しに読む。
  */
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const me = Symbol("more-sheet");
    stack.push(me);
    lockPage();
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 上に別の一枚が開いていれば、そちらが閉じる番
      if (stack[stack.length - 1] !== me) return;
      latestClose.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const at = stack.indexOf(me);
      if (at >= 0) stack.splice(at, 1);
      unlockPage();
    };
  }, []);

  const sheet = (
    <div
      className={`fixed inset-0 flex justify-center ${
        centered ? "items-center p-3 sm:p-5" : "items-end sm:items-center"
      } ${elevated ? "z-40" : "z-30"}`}
      data-testid={testId ?? (elevated ? "full-text-sheet" : "more-sheet")}
      data-placement={placement}
    >
      {/*
        下の画面を沈める。**消さない。**
        何の上に開いているのかが見えていないと、閉じた先が分からない。
      */}
      <button
        type="button"
        aria-label="閉じる"
        data-testid={`${hook}-scrim`}
        onClick={onClose}
        /*
          中央に浮かべるときは、少し濃くする。下から出る一枚は画面の
          端に触れていて「上に載っている」ことが形で分かるが、中央に
          浮かぶ面は、地が薄いと**元の画面と同じ層**に見える。
        */
        className={`absolute inset-0 ${centered ? "bg-ink/55" : "bg-ink/45"}`}
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        /*
          スマホでは下から。指の届く側から出るほうが、閉じるのも近い。
          高さは画面の 8 割まで。**残り 2 割で下が見えている**ことが、
          「上に開いている」と分かる手がかりになる。

          `dvh` にしてあるのは、スマホのブラウザで上下の帯が出入りする
          たびに画面の高さが変わるため。`vh` は帯が出ている分を数えない
          ので、帯が出た瞬間だけ一枚が画面からはみ出す。
        */
        /*
          中央に浮かべるほうは幅を画面なりにする（`w-full` ＋ 外側の
          `p-3`）。読み込む用（`full`）だけ、上下も画面いっぱいに近づける
          ——中身が長いので、見える窓が広いほうが送る回数が減る。
        */
        className={`relative flex w-full flex-col overflow-hidden bg-surface
                    shadow-dialog outline-none ${
                      full
                        ? "animate-pop-in h-[94dvh] max-w-lg rounded-modal"
                        : centered
                          ? "animate-pop-in max-h-[80dvh] max-w-md rounded-modal sm:max-h-[80vh]"
                          : "animate-slide-in max-h-[80dvh] max-w-md rounded-t-panel sm:max-h-[80vh] sm:rounded-panel"
                    }`}
      >
        <div
          className={`flex shrink-0 items-center gap-3 border-b border-line px-5 ${
            centered ? "py-4" : "py-3.5"
          }`}
        >
          <h2
            id={titleId}
            /*
              見出しと本文の段差を付ける。中央に浮かべる一枚は、本文
              （17px）と見出し（15px）が近すぎると、見出しが本文の
              1行目に見える。
            */
            className={`min-w-0 flex-1 font-bold ${centered ? "text-base" : "text-sm"}`}
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="閉じる"
            data-testid={`${hook}-close`}
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

        {/*
          ここだけ送れる。`min-h-0` が無いと縦に伸びて画面から出る。

          下の余白は `max(1rem, safe-area)`。一枚は画面の下辺から出る
          ので、iPhone ではホームバーが最後の一行に重なる。ふだんの
          画面（1rem）は変えずに、重なる端末でだけ広がる。

          `bleed` のときは左右と上の余白を捨てる。絵1枚だけを出す一枚で、
          そこに読む文字は無い。余白は絵を小さくするだけの働きしかしない。
        */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))] ${
            bleed ? "px-0 pt-0" : "px-5 pt-4"
          }`}
        >
          {children}
        </div>
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
  lines = 3,
}: {
  /** 何の文章か。「元の文章」「AIの結果」など。 */
  label: string;
  text: string;
  testId?: string;
  /**
   * 何行で切るか。
   *
   * 既定は3行。開いた一枚の中はそれで収まるが、レッスンの画面に
   * 直接置くときは2行にする——1行ぶん（28px）で画面がはみ出す
   * ことがある（iPhone の Safari で実際に起きた）。
   *
   * 値は決め打ちの2つだけ。Tailwind は書いてあるクラス名しか
   * 作らないので、`line-clamp-${n}` のような組み立て方だと
   * **CSS が出てこない**（切れずに全文が出る）。
   */
  lines?: 2 | 3;
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

          `block` を付けてはいけない。`line-clamp-3` は
          `display: -webkit-box` を敷いて効くもので、`block` は同じ
          `display` を後から上書きする。しかも Tailwind の出力順では
          `.block` が `.line-clamp-3` より後ろに来るので、
          **クラスの並び順に関係なく `block` が勝つ**。

          実際そうなっていて、3行のはずの文章が全文出ていた
          （お試し画面の例文が 312px になり、そこだけ 126px はみ出して
          e2e/stepFits.spec.ts が捕まえた）。`<span>` は `line-clamp` が
          敷く `-webkit-box` で塊として並ぶので、`block` は要らない。
        */}
        <span
          className={`${lines === 2 ? "line-clamp-2" : "line-clamp-3"}
                      whitespace-pre-wrap break-words text-sm leading-7`}
        >
          {body}
        </span>
        <span className="mt-2 block text-right text-xs font-bold text-brand-dark">
          全文を見る
        </span>
      </button>

      {open && (
        /*
          中央に浮かべる。ここは**1つの文章を確かめて閉じる**場面で、
          下から出る形だと「送れば続きがある読み物」に見える。

          本文は一段大きく、行間も広くする。読ませるために開いた一枚
          なので、一覧の中の抜粋と同じ大きさで出す理由が無い。
        */
        <MoreSheet
          elevated
          placement="center"
          title={label}
          onClose={() => setOpen(false)}
        >
          <p className="whitespace-pre-wrap break-words pb-1 text-base leading-8">
            {body}
          </p>
        </MoreSheet>
      )}
    </>
  );
}
