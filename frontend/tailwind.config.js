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
          画面の下地は「ほぼ白」。

          以前は はっきりした水色（#F2FAFE）を敷いていたが、支給された
          デザインは違った。下地を白に近づけ、白いカードを影で浮かせて
          奥行きを出している。下地に色を持たせると、その上のカードが
          沈んで見え、情報の階層が1段つぶれる。
        */
        canvas: "#FCFDFF",
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
        accent: {
          sky: "#0B6F9F",
          "sky-soft": "#E6F6F9",
          teal: "#087A6E",
          "teal-soft": "#EDF8F6",
          amber: "#8A6200",
          "amber-soft": "#FBF6E5",
          rose: "#C2371C",
          "rose-soft": "#FCF1EA",
          violet: "#5B46E0",
          "violet-soft": "#EFEEFD",
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
        角の丸み。

        以前は card=20px / panel=24px / badge=12px、加えて画面じゅうに
        rounded-full を撒いていた。結果、役割の違う部品——一覧の行も、
        見出しも、タグも、ボタンも——が同じ形で並び、
        「テンプレートから起こした画面」に見えていた。

        丸みは**強さの順位**として使う。何でも丸くしない。

          badge  8px … 小さな要素（印、入力欄、小ボタン）
          card  10px … 一覧の行、区切られた面
          panel 14px … 独立した操作単位（ダイアログ、主要な面）
          cta   20px … 押す先が1つしかない、特別なボタンだけ

        rounded-full は意味のある場所にだけ残す
        （進み具合の点、似顔絵、閉じるボタン）。
      */
      borderRadius: {
        badge: "0.5rem",
        card: "0.625rem",
        panel: "0.875rem",
        cta: "1.25rem",
      },
      boxShadow: {
        /*
          影はほぼ使わない。

          以前は白いカードを影で浮かせて階層を作っていたが、
          浮いた面が並ぶほど画面は「カードの集合」に見え、
          どれが本題か分からなくなる。

          階層は border / 背景差 / 余白 で作る。影を使うのは
          「本当に手前に出てくるもの」——ダイアログと、
          押している最中のボタン——だけに限る。
        */
        card: "none",
        raised: "0 1px 2px rgba(10, 30, 58, 0.05), 0 4px 12px -6px rgba(10, 30, 58, 0.12)",
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
      },
    },
  },
  plugins: [],
};
