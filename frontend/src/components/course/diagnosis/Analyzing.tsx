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
 * 一度消した画面と、どこが違うか
 * ------------------------------
 * 前にも「分析しています」の1.8秒があり、消した。理由は2つあって、
 * どちらもこの版では避けてある。
 *
 *   ・**やっていないことを言っていた**（「AIが分析しています」）。
 *     採点は端末の中の計算で、外のAIは通っていない。いまは
 *     「回答から、今の使い方を整理しています」——実際にやること
 *     しか書かない。偽の進捗率も、架空の処理ステップも出さない。
 *
 *   ・**選択肢と見分けが付かなかった**。4つの観点を白い角丸カードに
 *     丸い印で縦に並べ、順に青くしていたので、直前まで答えていた
 *     札と同じ形をしていた——自分が押していない項目に勝手に
 *     チェックが付くように見える。いまは印を持たない字の行で、
 *     枠も地色も付けない。押せるものには見えない。
 *
 * 時間で進めない
 * --------------
 * **演出の時計と、結果ができたかどうかは別のもの。** 1.2秒たっても
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

/** ぜんぶ点くまでの長さ。1つあたりの間はここから割って出す。 */
const SPAN = 1200;

export interface AnalyzingProps {
  /**
   * 結果ができているか。
   *
   * **これが false のあいだは、何秒たっても次へ行かない。**
   */
  ready: boolean;
  /** 4つとも点き終わり、結果もできている。 */
  onDone: () => void;
  /** 動きを減らす設定か。点く順を出さず、最後の姿で置く。 */
  reduced: boolean;
}

export function Analyzing({ ready, onDone, reduced }: AnalyzingProps) {
  /*
    いくつ目まで点いたか。**見た目だけの数**で、採点とは関係が無い。
    動きを減らす設定では最初から全部点いた姿にする。
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
    const step = SPAN / AXES.length;
    const timers = AXES.map((_, at) =>
      window.setTimeout(() => setLit(at + 1), step * (at + 1)),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reduced]);

  useEffect(() => {
    /*
      進む条件は3つそろったとき。**どれか1つでも欠けたら進まない。**

        1. 見せ終わった（動きを減らす設定なら、短い一拍だけ）
        2. 結果ができている（`ready`）
        3. 一枚が開いていない——確認のシートの後ろで画面が
           入れ替わると、閉じた先が思っていた場所と違う
    */
    const wait = reduced ? 200 : SPAN + 150;
    const id = window.setTimeout(function settle() {
      if (went.current) return;
      if (!ready || isSheetOpen()) {
        /* まだ。少し置いてもう一度見る（時間切れで進めない） */
        window.setTimeout(settle, 200);
        return;
      }
      went.current = true;
      onDone();
    }, wait);
    return () => window.clearTimeout(id);
  }, [ready, reduced, onDone]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center"
      data-testid="diagnosis-analyzing"
      data-ready={ready ? "yes" : "no"}
    >
      {/*
        ポー。既存のものをそのまま使う（描き起こさない）。
        ここは結果を待つ数秒なので、表情は考えごとのまま動かさない。
      */}
      <PoFace emotion="question" size="md" />

      {/*
        4つの観点。**最初から4行そろえて置く。**

        順に足していくと、行が増えるたびに下がずれる。点く順で見せたい
        のは「順番に見ている」ことであって、増えていくことではない。

        点いている行は、色と太さで出す。場所は動かさない——太字ぶんの
        幅は先に取ってある（`bold-safe`）。
      */}
      <ul
        className="mt-5 w-full max-w-[16rem] space-y-1.5"
        role="list"
        data-testid="analyzing-axes"
      >
        {AXES.map((axis, at) => {
          const on = at < lit;
          const text = SAY[axis] ?? AXIS_LABELS[axis];
          return (
            <li
              key={axis}
              data-lit={on ? "yes" : "no"}
              className={`bold-safe text-center text-sm leading-6 transition-colors
                          duration-300 ${
                            on ? "font-bold text-brand-dark" : "text-ink-muted/60"
                          }`}
              data-label={text}
            >
              {text}
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
