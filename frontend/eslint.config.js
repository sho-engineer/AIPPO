/**
 * lint の設定。
 *
 * 何を見るか
 * ----------
 * 型は `tsc --noEmit` が見る。ここで見たいのは、型では捕まらないのに
 * 実際に壊れるものだけ。数を増やすと、直す価値の低い指摘に埋もれて
 * 誰も読まなくなる。
 *
 *   - React のフックの決まり（順番・依存）
 *   - 使っていない変数（消し忘れ・書きかけの取り違え）
 *   - await し忘れ（結果を捨てている）
 *
 * 見ないもの
 * ----------
 * 書き方の好み（引用符、セミコロン、並び順）は入れない。
 * 直しても動きが変わらない指摘は、レビューの邪魔にしかならない。
 */

import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // 生成物と依存は見ない
    ignores: ["dist/**", "node_modules/**", "coverage/**", "playwright-report/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      /*
        使っていない変数。

        `_` で始まるものは「受け取るが使わない」と分かっているものなので
        見逃す（イベント引数や、分割代入で捨てる分）。
      */
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],

      /*
        `any` は警告どまり。

        外から来る JSON を受けるところで、いったん `unknown` を経由せずに
        書いている箇所がある。直す価値はあるが、いま赤にすると
        他の指摘が埋もれる。
      */
      "@typescript-eslint/no-explicit-any": "warn",

      // 結果を捨てている非同期処理。意図して捨てるときは void を付ける
      "no-void": "off",
    },
  },
  {
    // 手元で回す道具（a11y 検査など）は Node で動く。ブラウザの顔で見ない
    files: ["**/*.mjs", "scripts/**"],
    languageOptions: { globals: globals.node },
  },
  {
    // テストと道具は少しゆるめる。落ちる条件を作るために変な書き方をする
    files: ["tests/**/*.{ts,tsx}", "e2e/**/*.ts", "**/*.mjs", "scripts/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
