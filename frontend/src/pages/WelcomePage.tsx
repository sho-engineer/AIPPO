/**
 * はじめて来た人の、1枚目。
 *
 * 前のタイトル画面と何が違うか
 * ----------------------------
 * 前は「はじめる」1つだけだった。押す先が1つなので迷いはしないが、
 * **登録もログインもこの画面には無かった**——別の端末で続きをやりたい
 * 人は、いったんゲストで入って、設定を開いて、そこで初めてログインの
 * 入口に出会うことになる。すでに持っているものへ戻る道が、いちばん
 * 遠いところに置かれていた。
 *
 * だから入口を3つ並べる。順番は**その人が次にすること**の順。
 *
 *     アカウントを作る … これから始める人の、続けられる形
 *     ログイン        … もう持っている人
 *     ゲストではじめる … 決める前に中を見たい人
 *
 * 3つとも同じ強さにしない。並べただけだと「どれでもいい3つ」に見え、
 * 決められない人はいちばん軽いものを選ぶ。面・枠・文字の3段にして、
 * 勧めている順を形で出す。
 *
 * 説明を置かない
 * --------------
 * 手順3つ（前のタイトル画面にあった「5つの質問に答える／AIに実際に
 * お願いする／自分の文章で試す」）は外した。**始める前に読む物では
 * なく、始めれば分かること**で、置くと1画面に収まらなくなる。
 * 名乗りに要るのは、ロゴと、ポーと、何をするアプリかの1行だけ。
 *
 * 1画面に収める
 * --------------
 * 320×568 でも送らずに全部見える。低い持ち方ではポーと余白から先に
 * 詰める——**文字は縮めない**（読めなくなったら名乗りの用を成さない）。
 */

import { useState } from "react";

import { BrandLogo } from "../components/BrandLogo";
import { AuthDialog } from "../components/auth/AuthDialog";
import { PrimaryButton } from "../components/aippo/PrimaryButton";
import { PO_ALT, PO_WAVE } from "../po/assets";

export interface WelcomePageProps {
  /** 「ゲストではじめる」。登録なしで使える範囲へ。 */
  onStartGuest: () => void;
  /**
   * 登録・ログインが済んだ。
   *
   * **押した直後ではなく、済んだときに呼ぶ。** 押した時点で進めると、
   * 途中でやめた人や、確認コードで止まっている人まで中へ入る。
   */
  onAuthenticated: () => void;
}

export function WelcomePage({ onStartGuest, onAuthenticated }: WelcomePageProps) {
  /* 開いている認証の一枚。`null` なら閉じている */
  const [auth, setAuth] = useState<"signup" | "signin" | null>(null);

  return (
    /*
      画面の高さいっぱいを使って、中身を縦に散らす。

      `min-h-[100dvh]` にしてあるのは、スマホのブラウザで上下の帯が
      出入りするたびに高さが変わるため。`vh` は帯のぶんを数えないので、
      帯が出た瞬間だけ下の「ゲストではじめる」が画面の外へ出る。

      下タブは出さない（`App.tsx` の `NO_TAB_BAR`）。まだ「アプリの中」
      ではないので、行き先を5つ並べても選びようがない。
    */
    <main
      data-testid="welcome-page"
      className="mx-auto flex min-h-[100dvh] w-full max-w-page flex-col
                 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]
                 pt-[max(1.5rem,env(safe-area-inset-top))]"
    >
      {/*
        名乗りのまとまり。ロゴ・ポー・一行を1つの塊として中央に置く。

        `flex-1` ＋ `justify-center` なので、画面が高いぶんは**この塊の
        上下**へ回る。3つの入口は下に固定されたまま動かない。
      */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        {/* 普段どおりのロゴ。ここで描き起こさない */}
        <BrandLogo variant="horizontal" className="h-9 shrink-0" />

        {/*
          ポー。**この画面でいちばん大きく出す。**

          枠を先に決めてから絵を入れる（`aspect-square` ＋ 幅）。
          読み込みを待つあいだに高さが 0 だと、絵が届いた瞬間に下の
          ボタンが押し下げられる——押そうとした指が別の場所に当たる。

          低い持ち方では一回り小さくする。ここで詰めれば、文字を
          縮めずに1画面へ収まる。
        */}
        <div
          /*
            低い持ち方から順に、**ポーと余白を先に詰める**（文字は縮めない）。

            320×568 の実測で、`w-40`（160px）のままだと 13px あふれた。
            いちばん低い段を `w-32` にすると、合計 549px で収まる。
          */
          className="mt-5 aspect-square w-32 shrink-0
                     [@media(min-height:600px)]:mt-6 [@media(min-height:600px)]:w-40
                     [@media(min-height:700px)]:mt-8 [@media(min-height:700px)]:w-52
                     [@media(min-height:800px)]:w-60"
        >
          <img
            src={PO_WAVE}
            alt={PO_ALT}
            width={512}
            height={512}
            data-testid="welcome-po"
            className="h-full w-full object-contain"
          />
        </div>

        {/*
          何をするアプリか。**1行だけ。**

          「触って学ぶ」が先に来る。このアプリの中身は読み物ではなく
          手を動かすことで、そこが他の学習アプリとの違いそのもの。
        */}
        <h1 className="mt-5 text-center text-[1.375rem] font-bold leading-9">
          触って学ぶ、AIの使い方。
        </h1>
      </div>

      {/* ── 始め方3つ ── */}
      <div className="mt-6 flex shrink-0 flex-col gap-2.5">
        <PrimaryButton
          testId="welcome-signup"
          onClick={() => setAuth("signup")}
          className="w-full"
        >
          アカウントを作る
        </PrimaryButton>

        <PrimaryButton
          secondary
          testId="welcome-signin"
          onClick={() => setAuth("signin")}
          className="w-full"
        >
          ログイン
        </PrimaryButton>

        {/*
          3つ目は文字だけ。**軽くするが、小さくはしない。**

          当たり判定は 44px を確保する。ここは「決める前に中を見たい」
          人の道で、いちばん押される見込みが高い——軽く見せるために
          押しにくくしては本末転倒になる。
        */}
        <button
          type="button"
          onClick={onStartGuest}
          data-testid="welcome-guest"
          className="min-h-[2.75rem] w-full rounded-cta px-4 text-sm font-bold
                     text-brand-dark transition hover:bg-brand-soft"
        >
          ゲストではじめる
        </button>
      </div>

      {auth && (
        /*
          登録とログインは、いまある一枚をそのまま開く。

          ここで別の入力欄を組まない。同意の取り方・パスキー・外部連携・
          2段階の確認が全部あちらに入っていて、**作り直すと、そのうち
          どれかが抜ける**。

          `onDone` は成功したときにだけ呼ばれる（`AuthDialog`）。
          2段階の確認で止まっている人は、まだ呼ばれない。
        */
        <AuthDialog
          mode={auth}
          onClose={() => setAuth(null)}
          onDone={() => {
            setAuth(null);
            onAuthenticated();
          }}
        />
      )}
    </main>
  );
}
