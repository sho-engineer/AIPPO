/**
 * 配色は「やわらかく、親しみやすく」。
 *
 * 対象はAIに不安がある初心者なので、硬い印象を避ける。
 * ただし読みやすさは落とさない。本文の色は必ず背景に対して
 * 4.5:1 以上のコントラストを保つ（e2e/a11y.spec.ts が検査する）。
 *
 * 色は必ずここに名前で定義し、コンポーネントに生の色コードを書かない。
 * ブランド色を変えたくなったとき、直す場所を1か所にするため。
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    /**
     * 文字の大きさと行間。
     *
     * 既定より一段大きく、行間も広くしてある。
     * 12px の文字が並ぶと「細かい注意書き」に見えて、それだけで身構えさせる。
     * 対象は年齢層も幅広いので、読みやすさを優先する。
     */
    fontSize: {
      xs: ["0.8125rem", { lineHeight: "1.7" }], // 13px
      sm: ["0.9375rem", { lineHeight: "1.8" }], // 15px
      base: ["1.0625rem", { lineHeight: "1.9" }], // 17px
      lg: ["1.1875rem", { lineHeight: "1.7" }],
      xl: ["1.375rem", { lineHeight: "1.6" }],
      "2xl": ["1.75rem", { lineHeight: "1.5" }],
      "3xl": ["2.125rem", { lineHeight: "1.45" }],
      "4xl": ["2.5rem", { lineHeight: "1.4" }],
    },
    extend: {
      fontFamily: {
        /**
         * 丸ゴシック。日本語で「親しみやすい」を出す一番の手段。
         *
         * 本体は分割してあり、ブラウザは画面に出た文字の分だけ取りに行く
         * （scripts/build-fonts.py）。
         * 読み込みが終わるまでは、端末にある丸ゴシックへ順に落とす。
         */
        sans: [
          "'Zen Maru Gothic'",
          "'Hiragino Maru Gothic ProN'", // Apple 製品にある丸ゴシック
          "'Yu Gothic'",
          "'Hiragino Kaku Gothic ProN'",
          "'Noto Sans JP'",
          "sans-serif",
        ],
      },
      colors: {
        /*
          画面の下地は「ごく薄い青みの灰」。カードは白。

          支給された6枚を実際に測ると、下地と面がはっきり分かれていた。
          下地 #F5F8FC ／ 面 #FFFFFF。差はわずかだが、白い面が
          「置かれている」ことがこれで分かる。

          前は下地をほぼ白（#FCFDFF）にして、境目を線だけで作っていた。
          線は1本ずつ数えないと構造が読めない。面の差なら、目を細めても
          どこが1かたまりかが分かる。
        */
        canvas: "#F5F8FC",
        surface: "#FFFFFF",

        /*
          主役の青。

          ロゴ画像の文字色を実際に調べると #0972CE → #2BB0EE の
          グラデーションだった。以前の #0079AC は青緑寄りで、ロゴから
          外れていた。支給デザインのボタンは #1771F7。

          DEFAULT は白文字を載せるので 4.5:1 が要る。#1771F7 は 4.43 で
          わずかに足りないため、見た目をほぼ保ったまま #1268E8（5.03）
          まで寄せている。
        */
        brand: {
          DEFAULT: "#1268E8",
          dark: "#0B5FD0",
          // ロゴの水色。文字には使わない（薄すぎる）。飾り専用
          bright: "#2BB0EE",
          soft: "#E8F1FE",
          line: "#C9DEFB",
        },

        /*
          添える色。用途ごとに絵を描き分けるための、飾り専用。

          薄い地の色は、支給デザインの設定行から実際に測って合わせている。
          （青 #E4F0FB / 水 #E6F6F9 / 桃 #FCF1EA / 乳 #FBF6E5 / 翠 #EDF8F6）
          濃いほうは、その地に載せて 4.5:1 を満たすところまで濃くしたもの。
          飾りの印だけに使い、本文の色には使わない。
        */
        /*
          分類の色。

          彩度を落としてある。6つ並べたときに鮮やかだと、色そのものが
          目に入って、肝心の文字より強くなる。ここは「文章」「要約」を
          読み分けるための目印で、色は添え物にすぎない。

          暗さは落とさない。線画アイコンに使うので、薄くすると
          コントラストが足りなくなる（axe で見ている）。
          彩度だけ下げ、明度はそのままにしてある。
        */
        accent: {
          sky: "#1F6485",
          "sky-soft": "#EAF2F6",
          teal: "#226F66",
          "teal-soft": "#EDF5F3",
          amber: "#7A6320",
          "amber-soft": "#F7F4E9",
          rose: "#9E4433",
          "rose-soft": "#F8F0ED",
          violet: "#514A94",
          "violet-soft": "#F0EFF7",
        },

        // できた・進んだ。ポーのほおの色を、文字に使える濃さにしたもの
        joy: {
          DEFAULT: "#B8425A",
          soft: "#FDEDF1",
        },

        // 気をつけて（赤ほど強くしない）
        caution: {
          DEFAULT: "#A8480A",
          soft: "#FEF6E7",
        },

        // 文字。ポーの輪郭と目の紺色から取っている
        ink: {
          DEFAULT: "#0A1E3A",
          muted: "#47657E",
        },

        line: "#E6EDF6",
      },
      /*
        版面の幅。

        見出しも、下タブも、本文も、同じ幅で中央に置く。1か所で決めて
        おかないと、ロゴと本文の左端が数 px ずれる（実際にずれていた）。
        広い画面では 736px で止める。1行が長くなりすぎると、
        日本語は行の始まりを見失いやすい。
      */
      maxWidth: {
        page: "46rem",
        /*
          章扉1枚ぶんの幅。**端末1台ぶん。**

          絵が画面そのものになる画面だけに使う。絵は縦長なので、
          広い画面では余白のほうが絵より大きくなり、背面をどう
          伸ばしても横の位置が合わなくなる（1280px で境目の色が
          84 飛んだ）。文字を読ませる画面の幅（`page`）とは別。
        */
        cover: "24rem",
      },
      /*
        角丸は「大きさ」ではなく「役割」で選ぶ。

        4つしか無いのは、迷う余地を残さないため。Tailwind 既定の
        rounded-lg / -xl / -2xl をその場で選ぶと、書く人ごとに一段ずつ
        違う値が入り、画面をまたぐと同じ役割の部品が違う丸みで並ぶ。
        「なんとなくAIが作ったUI」の正体は、たいていこれ。

        以前は card=20px / panel=24px / badge=12px で、加えて画面じゅうに
        rounded-full を撒いていた。役割の違う部品——一覧の行も、見出しも、
        タグも、ボタンも——が同じ形で並んでいた。
        大きさは支給された6枚から測り直したもの。

          badge  8px … 小さい印・タグ・入力欄・字だけのボタン・札
          card  14px … 一覧の行、囲って1かたまりだと示す面
          cta   16px … 押す先が1つしかない、特別なボタンだけ
          panel 18px … 面の中の面ではなく、**画面を占める**まとまり
                       （ダイアログ、今日の1本）

        CTA を card より小さくしてあるのは、支給デザインの CTA が
        完全な楕円ではないため。丸くしすぎると、面ではなく錠剤に見える。

        丸（rounded-full）は意味のある場所にだけ残す——進み具合の輪、
        順番を表す点、似顔絵、閉じるボタン。押せる四角を丸くしない。

        ここに無い丸みが要ると思ったら、たいてい役割の切り分けが
        できていない。増やす前に、どの役割かを決める。
      */
      borderRadius: {
        badge: "0.5rem",
        card: "0.875rem",
        panel: "1.125rem",
        cta: "1rem",
        /*
          画面の上に**浮く**面だけ（中央のモーダルと、その全画面版）。

          下から出る一枚（panel）より丸くする。下から出る面は画面の端に
          触れていて、そこが直線なので控えめな丸みでも面として立つ。
          宙に浮く面は、角が立っていると差し込まれた板に見える。
        */
        modal: "1.5rem",
      },
      boxShadow: {
        /*
          影は「浮いている」ことだけを伝える。持ち上げない。

          支給デザインの面は、白い紙が下地の上に**置かれている**程度に
          しか浮いていない。濃い影を付けると、面が並ぶほど画面が
          ガタガタして、どれが本題か分からなくなる。

          縦のずれ 4px・ぼかし 16px・濃さ 5%。これ以上は付けない。
        */
        card: "0 4px 16px rgba(15, 45, 90, 0.05)",
        raised: "0 2px 8px rgba(15, 45, 90, 0.08)",
        // 押す先が1つの CTA だけ。同じ青をうすく敷いて、置き場所を示す
        cta: "0 6px 16px -6px rgba(18, 104, 232, 0.45)",
        dialog: "0 8px 32px -12px rgba(10, 30, 58, 0.28)",
      },

      /**
       * 動き。
       *
       * 止まった絵は、それだけで「作り置き」に見える。
       * ただし動かす目的は賑やかしではなく、次の3つに限る。
       *
       *   1. 生きている感じを出す（ポーが呼吸するように浮く）
       *   2. 押せる場所を教える（ボタンから輪が広がる）
       *   3. 順番を教える（上から順に現れる）
       *
       * 動きが苦手な人のために、index.css で
       * prefers-reduced-motion のときは全部止めている。
       */
      keyframes: {
        /*
          レッスンを終えたときの紙。ごく短く、ごく少なく。
          散る向きは 1片ずつ --confetti-x で渡す。
        */
        confetti: {
          "0%": { transform: "translate(0, 0) rotate(0deg)", opacity: "1" },
          "100%": {
            transform:
              "translate(var(--confetti-x, 0), 96px) rotate(220deg)",
            opacity: "0",
          },
        },
        /*
          はんこが押される。**上から降りてきて、一度だけ沈む。**

          大きく始めて縮めるのは、判子を紙に近づける動きを真上から
          見た形。最後に 1.0 を少し超えてから戻すと、押した反動に
          見える——ここを等速で 1.0 に着けると、置いただけに見える。
        */
        "stamp-in": {
          /*
            始まりの倍率は 1.7。**2.1 は大きすぎた。**

            枠は 68px なので 2.1 倍で 143px になり、いちばん左の枠から
            降りてくると台紙の外へはみ出して、隣の枠と自分の名前を
            覆っていた（実機の途中の絵で見つけた）。1.7 なら 116px で
            枠1つぶんの中に収まり、降りてくる感じは残る。
          */
          "0%": { transform: "scale(1.7) rotate(-12deg)", opacity: "0" },
          "40%": { transform: "scale(1.7) rotate(-12deg)", opacity: "1" },
          "70%": { transform: "scale(0.94) rotate(2deg)", opacity: "1" },
          "85%": { transform: "scale(1.05) rotate(-1deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        /*
          インクのにじみ。押した場所から輪が1つ広がって消える。

          輪は**1本だけ**。何重にも広げると、水面の波紋になって
          「押した」から離れる。
        */
        "stamp-ink": {
          "0%": { transform: "scale(0.55)", opacity: "0" },
          "45%": { transform: "scale(0.55)", opacity: "0" },
          "60%": { transform: "scale(0.8)", opacity: "0.45" },
          "100%": { transform: "scale(1.7)", opacity: "0" },
        },
        // 押された台紙が、ひと跳ねする
        "stamp-bounce": {
          "0%, 52%, 100%": { transform: "translateY(0)" },
          "66%": { transform: "translateY(-6px)" },
          "82%": { transform: "translateY(0)" },
          "90%": { transform: "translateY(-2px)" },
        },
        // ふわりと浮く。上下だけだと機械的なので、わずかに傾ける
        float: {
          "0%, 100%": { transform: "translateY(0) rotate(-1.2deg)" },
          "50%": { transform: "translateY(-14px) rotate(1.2deg)" },
        },
        // 浮いた分だけ影は小さく薄くなる。浮いて見えるかは影で決まる
        "float-shadow": {
          "0%, 100%": { transform: "scaleX(1)", opacity: "0.22" },
          "50%": { transform: "scaleX(0.78)", opacity: "0.1" },
        },
        // 泡が下から上へ流れる。奥行きを出すための背景
        drift: {
          "0%": { transform: "translateY(0) scale(0.9)", opacity: "0" },
          "12%": { opacity: "1" },
          "88%": { opacity: "1" },
          "100%": { transform: "translateY(-78vh) scale(1.2)", opacity: "0" },
        },
        // 大きな面がゆっくり揺れる。気づかれない速さでよい
        sway: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(3%, -4%, 0) scale(1.08)" },
        },
        twinkle: {
          "0%, 100%": { transform: "scale(0.55)", opacity: "0.25" },
          "50%": { transform: "scale(1)", opacity: "1" },
        },
        // ボタンから広がる輪。ここが押せると伝える
        halo: {
          "0%": { transform: "scale(1)", opacity: "0.55" },
          "70%, 100%": { transform: "scale(1.35)", opacity: "0" },
        },
        // 上から落ちてくる。最後に少し行き過ぎて戻る
        "drop-in": {
          "0%": { transform: "translateY(-32px) scale(0.88)", opacity: "0" },
          "60%": { transform: "translateY(5px) scale(1.03)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "rise-in": {
          from: { transform: "translateY(18px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "pop-in": {
          "0%": { transform: "scale(0.72)", opacity: "0" },
          "70%": { transform: "scale(1.05)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        // 送信中の棒。左右に流して「動いている」ことだけを伝える
        "drift-x": {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(320%)" },
        },
        // 「この下にもある」と教える
        nudge: {
          "0%, 100%": { transform: "translateY(0)", opacity: "0.6" },
          "50%": { transform: "translateY(6px)", opacity: "1" },
        },
        /*
          画面が入れ替わったことを、ごく短く伝える。

          設定のように下位画面へ潜る作りでは、切り替わりが一瞬すぎると
          「押したのに同じ画面が出た」と読み違える。
          18px ぶん横から入れて 0.22 秒で止める。それ以上は待たされる。
        */
        "slide-in": {
          from: { transform: "translateX(16px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        // 一覧が上から順に現れる。1行ごとの遅れは 30ms ほどに留める
        "fade-up": {
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        /*
          選んだ札が、ひとつだけ跳ねる。

          押した「手ごたえ」を返すためだけの動き。色が変わるのは
          見れば分かるが、**押した瞬間**に何かが起きたことは、
          動きのほうが早く伝わる。

          縮んでから戻る。膨らませると、隣の札に重なって見える。
          0.24 秒で終える——これ以上伸ばすと、続けて選び直す人が
          次の札を押すまで待たされる。
        */
        "choice-pop": {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(0.94)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        float: "float 4.6s ease-in-out infinite",
        "float-shadow": "float-shadow 4.6s ease-in-out infinite",
        drift: "drift 15s linear infinite",
        sway: "sway 19s ease-in-out infinite",
        twinkle: "twinkle 2.6s ease-in-out infinite",
        halo: "halo 2.8s ease-out infinite",
        // both を付けて、始まる前と終わった後の姿を固定する。
        // 付けないと、遅れて出す要素が最初の一瞬だけ見えてしまう。
        "drop-in": "drop-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both",
        "rise-in": "rise-in 0.6s ease-out both",
        "pop-in": "pop-in 0.55s cubic-bezier(0.34, 1.4, 0.64, 1) both",
        nudge: "nudge 1.9s ease-in-out infinite",
        "drift-x": "drift-x 1.4s ease-in-out infinite",
        "slide-in": "slide-in 0.22s ease-out both",
        "fade-up": "fade-up 0.28s ease-out both",
        "choice-pop": "choice-pop 0.24s ease-out",
        /*
          紙吹雪。**この行が要る。**

          `keyframes` に書いただけでは、Tailwind は `@keyframes confetti`
          を出力しない——どのユーティリティからも使われていない定義は
          捨てられる。紙を出していた2か所（完了画面・Day完了）は
          `style={{ animation: "confetti ..." }}` と素で書いていたので、
          **定義そのものが CSS に存在せず**、紙は散らずに出た場所へ
          固まったままだった。画面を見て初めて気づいた。

          使う側は `animate-confetti` を付ける。1片ずつの遅れと向きは
          `animationDelay` と `--confetti-x` で渡す。
        */
        confetti: "confetti 800ms ease-out forwards",
        /*
          スタンプ。3つで1組の演出なので、**長さをそろえる**。

          900ms は「ポンッ」と鳴らすのにちょうどよい長さ。これより
          短いと降りてくるところが見えず、長いと待たされる。
          `both` を付けて、始まる前（透明）と終わった後の姿を固定する。
        */
        "stamp-in": "stamp-in 900ms cubic-bezier(0.3, 1.3, 0.5, 1) both",
        "stamp-ink": "stamp-ink 900ms ease-out both",
        "stamp-bounce": "stamp-bounce 900ms ease-out both",
      },
    },
  },
  plugins: [],
};
