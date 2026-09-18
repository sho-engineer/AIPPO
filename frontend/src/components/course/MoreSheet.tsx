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

import { useCloseOnBack } from "./BackStack";

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
   * 背景を押したら閉じるか。既定は閉じる。
   *
   * `false` にするのは、**閉じたつもりのない取りこぼし**を作りたくない
   * 場面だけ。ホームの診断の案内がそれで、指が少し外れただけで消える
   * と、読む前に無くなった人には二度と出ない（1人に1度の案内なので）。
   *
   * 閉じ方が減るわけではない。×・「あとで」・Esc の3つは残っている。
   */
  dismissOnScrim?: boolean;
  /**
   * 上の帯（見出しの行）を出すか。
   *
   * `false` にすると、見出しは読み上げにだけ残り、×は中身の右上へ
   * 浮かぶ。**見出しを中身の側でデザインしたい一枚**のため——帯に
   * 出すと、同じ言葉が帯と中身で2回並ぶ。
   */
  chromeless?: boolean;
  /**
   * 説明文の id。読み上げが、名前のあとに続けて読む。
   *
   * 名前（見出し）だけだと、開いた瞬間に読まれるのは一枚の題だけ。
   * 何を聞かれているのかは中身を辿らないと分からない。判断に要る1文が
   * あるなら、開いた時点で一緒に読めるようにする。
   */
  describedBy?: string;
  /**
   * 「戻る」で閉じるために、履歴を1つ持つか。既定は持つ。
   *
   * false にするのは、**入る前に立ちはだかる一枚**だけ。あれは
   * 「開いて入った場所」ではないので、そこでの「戻る」は1つ外側
   * （教材の外）へ抜けるのが素直になる。
   */
  holdsBack?: boolean;
  /**
   * 見出しの id。**画面に出ている見出しを、そのまま名前にする。**
   *
   * `chromeless` の一枚は見出しを中身の側でデザインする。そこへ
   * 読み上げ用の見出しをもう1つ足すと、**同じ言葉の見出しが2つ**並ぶ
   * ——目で読む人には1つ、読み上げには2つ、という形になる。
   *
   * 渡されたときは、こちらが見出しを作らない。`title` は読み上げには
   * 出ず、検査や記録のための名前として残る。
   */
  labelledBy?: string;
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
 * Tab で止まれるもの。
 *
 * `tabindex="-1"`（枠そのもの）は入れない。焦点を置くことはできるが、
 * Tab の順番には並ばないので、折り返しの端として数えると1つずれる。
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
  ' textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

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

/** いま、一枚が開いているか。**重ねて出さない**ための問い合わせ口。 */
export function isSheetOpen(): boolean {
  return stack.length > 0;
}

export function MoreSheet({
  title,
  onClose,
  elevated = false,
  bleed = false,
  placement = "sheet",
  dismissOnScrim = true,
  chromeless = false,
  describedBy,
  labelledBy,
  holdsBack = true,
  testId,
  children,
}: MoreSheetProps) {
  /*
    開いているあいだは、帯の「←」で**この一枚が閉じる**。

    前は「←」が教材のステップを直に戻していたので、一枚を開いた
    まま押すと、閉じたいだけなのに背面ごと前の問いへ移っていた。
    入れ子で重ねたときも、後から積んだ奥のほうから閉じる。
  */
  /*
    `holdsBack` が false の一枚は、履歴を積まない。入口の関所
    （`ResumeDialog`）のため——詳しくは `useCloseOnBack` の側に書いた。
  */
  useCloseOnBack(onClose, holdsBack);

  const centered = placement !== "sheet";
  const full = placement === "full";
  const panel = useRef<HTMLDivElement>(null);
  /*
    見出しの id は**この一枚だけのもの**にする。

    導入の上に「詳しく見る」を重ねると、同じ id の見出しが画面に2つ
    並ぶ。`aria-labelledby` は最初の1つを拾うので、上に開いた一枚が
    下の一枚の名前で読み上げられる。
  */
  const ownTitleId = useId();
  /* 画面に出ている見出しを名前にできるなら、そちらを指す */
  const titleId = labelledBy ?? ownTitleId;
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
    /*
      開く前に焦点があった場所を控える。閉じたらそこへ返す。

      返さないと、閉じたあとの焦点は body に落ちる。キーボードだけで
      使っている人は、**押したボタンの続きからではなく、ページの頭から**
      たどり直すことになる。読み上げでも同じで、閉じた瞬間に現在地が
      分からなくなる。
    */
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      // 上に別の一枚が開いていれば、そちらの番
      if (stack[stack.length - 1] !== me) return;

      if (event.key === "Escape") {
        latestClose.current();
        return;
      }

      /*
        Tab を、この一枚の中で回す。

        一枚は body の上に浮いているだけで、**後ろのページも同じ順番の
        中に居る**。閉じずに Tab を押し続けると、見えていない後ろの
        ボタンへ焦点が移っていく——押した本人からは、焦点がどこかへ
        消えたようにしか見えない（そのまま Enter を押せば、見えない
        ボタンが動く）。

        端で折り返すだけにしてある。中の並び順そのものは触らない。
      */
      if (event.key !== "Tab") return;
      const box = panel.current;
      if (!box) return;
      const stops = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (one) => one.offsetParent !== null || one === box,
      );
      if (stops.length === 0) {
        // 止まれる場所が無い一枚（読み物だけ）。枠そのものに留める
        event.preventDefault();
        box.focus();
        return;
      }
      const first = stops[0];
      const last = stops[stops.length - 1];
      const here = document.activeElement;
      if (!event.shiftKey && here === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (here === first || here === box)) {
        event.preventDefault();
        last.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      const at = stack.indexOf(me);
      if (at >= 0) stack.splice(at, 1);
      unlockPage();
      /*
        まだ画面に残っているときだけ返す。開いているあいだに元のボタンが
        消えることがある（一枚を閉じると同時に下の画面が入れ替わる）。
        消えた要素へ `focus()` しても何も起きず、焦点は body に落ちる。
      */
      if (opener && document.contains(opener)) opener.focus();
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
      {/*
        中央に浮かべるときは、少し濃くする。下から出る一枚は画面の
        端に触れていて「上に載っている」ことが形で分かるが、中央に
        浮かぶ面は、地が薄いと**元の画面と同じ層**に見える。

        `dismissOnScrim` が false のときは、押せない面にする。
        **見た目は同じで、押しても何も起きない。** 「閉じる」という
        名前を持ったまま押せなくすると、読み上げでは押せるものとして
        読まれて、押しても閉じない場所になる。
      */}
      {dismissOnScrim ? (
        <button
          type="button"
          aria-label="閉じる"
          data-testid={`${hook}-scrim`}
          onClick={onClose}
          className={`absolute inset-0 ${centered ? "bg-ink/55" : "bg-ink/45"}`}
        />
      ) : (
        <div
          aria-hidden="true"
          data-testid={`${hook}-scrim`}
          className={`absolute inset-0 ${centered ? "bg-ink/55" : "bg-ink/45"}`}
        />
      )}

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
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
        {chromeless ? (
          /*
            帯を出さない一枚。見出しは読み上げにだけ残し、×を中身の
            右上へ浮かべる。

            当たり判定は 44px。見た目の丸（36px）より大きく取る——
            画面のいちばん端に近いボタンなので、小さいと指が外れる。
          */
          <>
            {!labelledBy && (
              <h2 id={titleId} className="sr-only">
                {title}
              </h2>
            )}
            <button
              type="button"
              aria-label="閉じる"
              data-testid={`${hook}-close`}
              onClick={onClose}
              className="absolute right-1.5 top-1.5 z-10 flex h-11 w-11 items-center
                         justify-center rounded-full text-ink-muted transition
                         hover:bg-brand-soft"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </>
        ) : (
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
        )}

        {/*
          ここだけ送れる。`min-h-0` が無いと縦に伸びて画面から出る。

          下の余白は `max(1rem, safe-area)`。一枚は画面の下辺から出る
          ので、iPhone ではホームバーが最後の一行に重なる。ふだんの
          画面（1rem）は変えずに、重なる端末でだけ広がる。

          `bleed` のときは左右と上の余白を捨てる。絵1枚だけを出す一枚で、
          そこに読む文字は無い。余白は絵を小さくするだけの働きしかしない。

          `tabIndex` を置くのは、**指を使わない人が送れるようにする**ため。
          「詳しく見る」の中は読み物だけで、押せるものが1つも無い。
          送れる枠に止まれないと、キーボードだけの人は最初の画面ぶんしか
          読めない（axe の `scrollable-region-focusable` で見つかった）。
          止まれば矢印キーで送れる。
        */}
        <div
          tabIndex={0}
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
/**
 * 行数と、Tailwind のクラス名の対応。
 *
 * 表にしてあるのは、**書いてあるクラス名しか CSS が作られない**ため。
 * `line-clamp-${lines}` と組み立てると、その名前は出力に無く、
 * 切れずに全文が出る（気づけるのは画面がはみ出したとき）。
 */
const CLAMP = {
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
} as const;

/**
 * 低い持ち方（700px 未満）でだけ、1行減らすための組。
 *
 * iPhone の Safari で上下の帯が出ていると、見える高さは 660px ほど。
 * そこでは1行（28px）が下のボタンの位置を決めるので、**読める下限を
 * 保ったまま**1行だけ譲る。高さのある持ち方では元の行数に戻る。
 *
 * ここも表にしてある。組み立てた名前は CSS に出てこない（上と同じ理由）。
 */
const CLAMP_SHORT = {
  2: "line-clamp-2",
  3: "line-clamp-2 [@media(min-height:700px)]:line-clamp-3",
  4: "line-clamp-3 [@media(min-height:700px)]:line-clamp-4",
} as const;

export function FullText({
  label,
  text,
  testId,
  lines = 3,
  tight = false,
  peek = true,
  showLabel = false,
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
   * AIの結果だけは4行。**1〜2行では、返ってきたものが読めない。**
   * 読めないまま「分かりやすくなった？」を聞かれると、答えようが
   * ないので勘で押すことになる（実際にそうなっていた）。
   *
   * 値は決め打ちの3つだけ。Tailwind は書いてあるクラス名しか
   * 作らないので、`line-clamp-${n}` のような組み立て方だと
   * **CSS が出てこない**（切れずに全文が出る）。
   */
  lines?: 2 | 3 | 4;
  /**
   * 低い持ち方で1行減らすか。
   *
   * レッスンの画面に**直接置く**ときだけ true にする。開いた一枚の
   * 中は送れるので、減らす理由が無い。
   */
  tight?: boolean;
  /**
   * 抜粋そのものを出すか。
   *
   * `false` にすると、名札と「全文を見る」だけの1行になる。抜粋を
   * 置く高さが無い画面のため（`StepRenderer` の条件を選ぶ回）。
   * 押した先は同じ一枚なので、**届く先は変わらない**。
   */
  peek?: boolean;
  /**
   * 名札を、**画面にも出すか**。
   *
   * ふだんは出さない。名札は読み上げ（`aria-label`）だけが持ち、
   * 画面には抜粋そのものを置く——「元の文章」と書かなくても、
   * その場に置いてあれば何の文章かは分かる。
   *
   * 出すのは、**名札そのものが中身の一部**のとき。Day2 の題材は
   * Lesson 用に作った架空の調査資料で、実在の調査と読み違えられると
   * この数字を仕事で引用する人が出る。読み上げにしか無い名札は、
   * 目で読む人を止められない。
   */
  showLabel?: boolean;
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
        {peek ? (
          <>
            {showLabel && (
              /* 名札。地色を変えて、本文と地続きに読まれないようにする */
              <span
                className="mb-1.5 inline-block rounded-full bg-brand-soft px-2 py-0.5
                           text-[0.6875rem] font-bold leading-4 text-brand-dark"
                data-testid="source-badge"
              >
                {label}
              </span>
            )}
            <span
              className={`${(tight ? CLAMP_SHORT : CLAMP)[lines]}
                          whitespace-pre-wrap break-words text-sm leading-7`}
            >
              {body}
            </span>
            <span className="mt-2 block text-right text-xs font-bold text-brand-dark">
              全文を見る
            </span>
          </>
        ) : (
          /* 抜粋を置かないときは、名札と行き先を1行に並べる */
          <span className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm leading-6">{label}</span>
            <span className="shrink-0 text-xs font-bold text-brand-dark">
              全文を見る
            </span>
          </span>
        )}
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
