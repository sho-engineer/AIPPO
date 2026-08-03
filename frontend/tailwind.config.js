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
        // 画面の下地。ポーの白い体になじむ、ほんのり青い白
        canvas: "#F2FAFE",
        surface: "#FFFFFF",

        // 主役の色。ポーの青から取っている。
        // DEFAULT は白文字を載せるので、明るい水色そのままでは薄すぎる。
        // 白文字とのコントラストが 4.5 以上になるところまで濃くしてある。
        brand: {
          DEFAULT: "#0079AC",
          dark: "#005C82",
          //: ポーのアンテナの水色。文字には使わない（薄すぎる）。飾り専用。
          bright: "#18E4FC",
          soft: "#E4F5FD",
          line: "#A9DDF3",
        },

        // できた・進んだ。ポーのほおの色を、文字に使える濃さにしたもの
        joy: {
          DEFAULT: "#B8425A",
          soft: "#FDEDF1",
        },

        // 気をつけて（赤ほど強くしない）
        caution: {
          DEFAULT: "#A8480A",
          soft: "#FDF1E7",
        },

        // 文字。ポーの輪郭と目の紺色から取っている
        ink: {
          DEFAULT: "#0A1E3A",
          muted: "#47657E",
        },

        line: "#D2EBF8",
      },
      borderRadius: {
        card: "1.25rem",
      },
      boxShadow: {
        card: "0 2px 12px rgba(10, 30, 58, 0.08)",
        pop: "0 6px 20px rgba(0, 121, 172, 0.22)",
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
        // 「この下にもある」と教える
        nudge: {
          "0%, 100%": { transform: "translateY(0)", opacity: "0.6" },
          "50%": { transform: "translateY(6px)", opacity: "1" },
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
      },
    },
  },
  plugins: [],
};
