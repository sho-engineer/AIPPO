/**
 * 答え終わってから、結果が出るまでの1枚。
 *
 * なぜ置くか
 * ----------
 * 5問目の「診断結果を見る」を押した次の瞬間に「あなたの現在地」が
 * 出ると、**答えと結果のあいだに何も無い**。5つ押しただけのものが
 * 判定として返ってくるので、読む前に「当たっているのか」を疑う側に
 * 回る。ここに1枚挟むのは、待たせるためではなく**何を見たのか**を
 * 言うため——4つの観点で振り返った、と先に言っておく。
 *
 * 読める長さにする
 * ----------------
 * 最初の版は 1.8 秒だった（実測）。4つの観点を目で追うには短く、
 * 「出た瞬間に消えた」と言われた。いまは **2.8 秒**。
 *
 *     0.4秒ごとに1つずつ強調   … 4つで 1.6 秒
 *     最後の1つのあとに余韻     … 残り 1.2 秒
 *
 * 待たせる画面ではないので、これ以上は伸ばさない。
 *
 * ひとまとまりにする
 * ------------------
 * 前は見出しと説明を画面の上（`StepShell` の見出し欄）に、ポーと
 * 4項目を中央に置いていた。あいだに**大きな白**が空き、上の文と下の
 * 項目が別のものに見える。いまはこの部品が画面まるごとを受け持ち、
 * ポー・見出し・説明・4項目を**中央のひとかたまり**として置く。
 *
 * 一度消した画面と、どこが違うか
 * ------------------------------
 * 前にも「分析しています」の画面があり、消した。理由は2つあって、
 * どちらもこの版では避けてある。
 *
 *   ・**やっていないことを言っていた**（「AIが分析しています」）。
 *     採点は端末の中の計算で、外のAIは通っていない。いまは
 *     「回答を整理しています」——実際にやることしか書かない。
 *     偽の進捗率も、架空の処理ステップも出さない。
 *
 *   ・**選択肢と見分けが付かなかった**。4つの観点を白い角丸カードに
 *     丸い印で縦に並べ、順に青くしていたので、直前まで答えていた
 *     札と同じ形をしていた——自分が押していない項目に勝手に
 *     チェックが付くように見える。いまは印も枠も地色も持たない
 *     字の行で、押せるものには見えない。
 *
 * 時間で進めない
 * --------------
 * **演出の時計と、結果ができたかどうかは別のもの。** 2.8 秒たっても
 * 結果が作れていなければ進まない（`ready`）。採点は同期の計算なので
 * ふつうは先に終わっているが、「時間が来たから次へ」にしておくと、
 * 失敗しているのに結果の画面へ進む形がいつでも作れてしまう。
 *
 * 離れたら、進めない
 * ------------------
 * 閉じた・戻った・別の画面を開いた——そのあとに時計だけが生き残って
 * 結果へ飛ばすことが無いようにする。消えるときに時計も止め
 * （`useEffect` の後始末）、一枚（確認のシート）が開いているあいだは
 * 進めない。
 */

import { useEffect, useRef, useState } from "react";

import { IconCheckCircle } from "../../Icons";
import { PoFace } from "../../../po/PoAvatar";
import { isSheetOpen } from "../MoreSheet";
import { resetRadarSpread } from "./RadarChart";
import { AXES, AXIS_LABELS, type Axis } from "../../../course/diagnosisScore";

/**
 * 観点の並び。**採点の軸そのもの**（`AXES`）から作る。
 *
 * ここに4つの名前を書き写すと、軸を足した日にこの画面だけが古い数を
 * 言う。「自分に合わせる」だけ `AXIS_LABELS`（「目的に合わせる」）と
 * 言い換えているので、その差分だけを持つ。
 */
const SAY: Partial<Record<Axis, string>> = {
  purpose: "自分に合わせる",
};

/** 1つ強調してから、次を強調するまで。 */
const STEP = 400;

/** 出してから、結果の画面へ移るまで。最後の項目のあとに余韻が残る。 */
const TOTAL = 2800;

export interface AnalyzingProps {
  /**
   * 結果ができているか。
   *
   * **これが false のあいだは、何秒たっても次へ行かない。**
   */
  ready: boolean;
  /** 見せ終わり、結果もできている。 */
  onDone: () => void;
  /** 動きを減らす設定か。順に点けず、最初から全部を出す。 */
  reduced: boolean;
}

export function Analyzing({ ready, onDone, reduced }: AnalyzingProps) {
  /*
    いくつ目まで強調したか。**見た目だけの数**で、採点とは関係が無い。
    動きを減らす設定では、最初から全部。
  */
  const [lit, setLit] = useState(reduced ? AXES.length : 0);

  /* 進むのは1度だけ。時計と `ready` の両方から呼ばれる */
  const went = useRef(false);

  /*
    この1枚が出た＝**新しく答え終わって、結果を作っている**。

    ひし形の「もう見せた」を、ここで忘れさせる。答えを直して同じ
    点数に戻った人にも、新しく答え終わった回はもう一度出すため
    （戻ってきただけの人には出さない、という決まりはあちらが持つ）。
  */
  useEffect(() => {
    resetRadarSpread();
  }, []);

  useEffect(() => {
    if (reduced) return;
    const timers = AXES.map((_, at) =>
      window.setTimeout(() => setLit(at + 1), STEP * (at + 1)),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reduced]);

  useEffect(() => {
    /*
      進む条件は3つそろったとき。**どれか1つでも欠けたら進まない。**

        1. 見せ終わった（2.8秒）
        2. 結果ができている（`ready`）
        3. 一枚が開いていない——確認のシートの後ろで画面が
           入れ替わると、閉じた先が思っていた場所と違う

      動きを減らす設定でも、**長さは変えない**。あれは動きを減らす
      設定であって、急ぐ設定ではない。読む時間は同じだけ要る。
    */
    const id = window.setTimeout(function settle() {
      if (went.current) return;
      if (!ready || isSheetOpen()) {
        /* まだ。少し置いてもう一度見る（時間切れで進めない） */
        window.setTimeout(settle, 200);
        return;
      }
      went.current = true;
      onDone();
    }, TOTAL);
    return () => window.clearTimeout(id);
  }, [ready, onDone]);

  return (
    /*
      画面まるごとを受け持つ。**中身は1つのかたまりとして中央に。**

      高さは帯（44px）の下いっぱい。`StepShell` と同じ式を使うのは、
      前後の画面と**帯の位置がそろう**ため——ここだけ数式が違うと、
      移った瞬間に上の帯が跳ねる。
    */
    <div
      className="mx-auto flex h-[calc(100dvh-2.75rem-env(safe-area-inset-top))] w-full
                 max-w-page flex-col items-center justify-center px-6
                 pb-[max(1rem,env(safe-area-inset-bottom))]"
      data-testid="diagnosis-analyzing"
      data-ready={ready ? "yes" : "no"}
    >
      {/*
        ポー。既存のものをそのまま使う（描き起こさない）。
        結果を待つ数秒なので、表情は考えごとのまま動かさない。
      */}
      <PoFace emotion="question" size="md" />

      <h1 className="mt-4 text-center text-lg font-bold leading-7">
        回答を整理しています
      </h1>

      {/*
        説明。**行の折れる場所を決めておく**（`<br>`）。
        成り行きに任せると、端末の幅で2行になったり3行になったりして、
        下の4項目の位置が端末ごとに変わる。
      */}
      <p className="mt-2 text-center text-sm leading-6 text-ink-muted">
        4つの観点から、
        <br />
        今のAIの使い方を確認しています。
      </p>

      {/*
        4つの観点。**最初から4行そろえて置く。**

        順に足していくと、行が増えるたびに下がずれる。順番に見せたいのは
        「1つずつ見ている」ことであって、増えていくことではない。

        強調は、色と太さと印の3つ。場所は動かさない——太字ぶんの幅は
        先に取ってあり（`bold-safe`）、印は最初から場所を取っている。
      */}
      <ul
        className="mt-5 w-full max-w-[15rem] space-y-2"
        role="list"
        data-testid="analyzing-axes"
      >
        {AXES.map((axis, at) => {
          const on = at < lit;
          const text = `${SAY[axis] ?? AXIS_LABELS[axis]}力`;
          return (
            <li
              key={axis}
              data-lit={on ? "yes" : "no"}
              className="flex items-center justify-center gap-1.5"
            >
              {/*
                印。**選ぶ札のチェックには見せない。**

                前の版は丸い塗りつぶしのチェックで、直前まで押していた
                選択肢と同じ形だった。ここは輪郭だけの印にして、
                場所は最初から空けておく（`opacity`）。
              */}
              <IconCheckCircle
                aria-hidden="true"
                className={`h-4 w-4 shrink-0 text-brand transition-opacity duration-300 ${
                  on ? "opacity-100" : "opacity-0"
                }`}
              />
              <span
                className={`bold-safe text-sm leading-6 transition-colors duration-300 ${
                  on ? "font-bold text-brand-dark" : "text-ink-muted/60"
                }`}
                data-label={text}
              >
                {text}
              </span>
            </li>
          );
        })}
      </ul>

      {/*
        読み上げには、点く順を渡さない。**途中の姿は結果ではない。**
        言うのは、いま何をしているかだけ。
      */}
      <p className="sr-only" role="status">
        回答を整理しています。
      </p>
    </div>
  );
}
