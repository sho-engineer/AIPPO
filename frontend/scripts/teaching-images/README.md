# 全体図（Lesson Overview）の絵

レッスンを開いた最初の画面で、「今日やることの全体図を見る」を押すと出る1枚。

## ずれるので、控えを取る

絵の中の文字は**焼き込み**で、あとから読めない。読めないものは、教材データと
食い違っても誰も気づけない。

実際そうなった。Day1 の絵は「学習時間の目安 約3分」と言い、教材データは
`estimatedMinutes: 8` だった。コース一覧・レッスン行・再開カード・ホームの
カードは全部データを読むので「8分」と出て、**同じレッスンに2つの数字が
出ていた**。しばらく誰も気づかなかった。

そこで、絵が何と言っているかを [`overviews.json`](./overviews.json) へ書き写して
おく。教材データと食い違うと `tests/teachingImageFacts.test.ts` が落ちる。

**文言・時間・教材内容を変えたら、必ず `overviews.json` も直す。**
直さずにデータだけ変えると、検査が落ちて気づける。

## 作り直す

```
node scripts/teaching-images/render.mjs day1_overview
python3 scripts/teaching-images/to-webp.py day1_overview
```

1行目が `out/day1_overview.png` を書き、2行目が
`public/assets/teaching/day1_overview.webp` へ可逆WebP で置く。
Pillow が要る（`python3 -m pip install Pillow`）。

最後に、実寸が変わっていれば `src/course/teachingImages.ts` の
`width` / `height` と `alt` を直す。`alt` は**絵が実際に見せているもの**を書く
——見えない人にとってはこれが絵そのものなので、飾りの言葉を足さない。

## 外で作った絵を置くとき

版下（`overview.html`）を通さない絵でもよい。その場合も

1. `to-webp.py --from <受け取った画像>` で可逆WebP に揃える
2. `overviews.json` に、**出来上がった絵を見て**書き写す（`source: "supplied"`）
3. `teachingImages.ts` の `width` / `height` / `alt` を合わせる

Day1 の絵はこの形。

`source: "supplied"` と書いた絵は、版下から作り直したもので**置き換えられない**
（`to-webp.py` が断る）。版下の試し刷りは本物とよく似ている——同じ文言を
読ませているので当然で、違うのはポーの構図だけ。取り違えて上書きすると
支給された絵が静かに消えるので、`--force` を付けない限り止まる。

## 守ること

- **ポーを描き直さない。** 版下は `public/assets/po/` の公式8枚から選んで置く。
  背丈は `PO_BOX`（`src/po/assets.ts` と同じ値）で揃える
- **1:1 で作る。** Day2〜8 も 1:1 なので、Day を移るたびに開いた一枚の高さが
  跳ねないようにする
- **可逆WebP（VP8L）。** 文字の縁が濁らないため。検査もそれしか読まない
- 色と書体はアプリと同じものを使う（`tailwind.config.js` / `fonts.css`）

## Day2〜8

まだ `overviews.json` に入っていない。各日の中身と所要時間を決めたときに、
絵と一緒に足す。それまでは `tests/teachingImageFacts.test.ts` の
`UNDECIDED` に置いてある——**足すか、まだ決めていないと書くか**のどちらかを
必ず通るようにしてあるので、黙って忘れることはできない。
