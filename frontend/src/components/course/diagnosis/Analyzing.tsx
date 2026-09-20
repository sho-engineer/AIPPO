/**
 * 答え終わってから、結果が出るまでの1枚。
 *
 * なぜ置くか
 * ----------
 * 5問目の「診断結果を見る」を押した次の瞬間に「あなたの現在地」が
 * 出ると、**答えと結果のあいだに何も無い**。5つ押しただけのものが
 * 判定として返ってくるので、読む前に「当たっているのか」を疑う側に
 * 回る。ここに1枚挟むのは、待たせるためではなく**何を見たのか**を
 * 言うため。
 *
 * 長さの決め方
 * ------------
 * 1.8秒 → 2.8秒 と伸ばしてきて、実機では**まだ短い**と言われた。
 * いまは初回 **5秒**。4つの段を1.5秒ずつ読ませ、最後に結果が
 * できたことを言う。
 *
 *     0.0〜1.5  回答を整理しています
 *     1.5〜3.0  AIの使い方を見ています
 *     3.0〜4.5  得意なところと、伸ばせるところを確かめています
 *     4.5〜5.0  診断結果ができました
 *
 * **直したときは 1.4 秒**（`mode="recalc"`）。1問だけ直した人に
 * 同じ5秒を見せると、直すたびに待たされる。初回は「診断を受けた」
 * 体験、直したときは「すぐ反映された」体験と、役割を分ける。
 *
 * 進み具合を出す
 * --------------
 * 帯が 0 から 100 まで進む。**これは演出そのものの進み具合**で、
 * 採点の進捗ではない——採点は端末の中の計算で、押した時点でほぼ
 * 終わっている。偽の数字を出しているのではなく、「あと どれくらいで
 * 結果が出るか」を目で分かるようにしているだけ。だから帯は必ず
 * 5秒で右端へ着き、途中で止まったり跳ねたりしない。
 *
 * やっていないことを言わない
 * --------------------------
 * 「AIが分析しています」とは書かない。採点は端末の中の計算で、外の
 * AI は通っていない。指示書の例は「回答を分析しています」だったが、
 * **分析という語はここでは嘘になる**ので「整理」「見ています」
 * 「確かめています」に置き換えてある。段の数も長さも指示どおり。
 *
 * 選択肢と見分けが付くようにする
 * ------------------------------
 * 前にこの画面を一度消したことがある。4つの観点を白い角丸カードに
 * 丸い印で縦に並べ、順に青くしていたので、直前まで答えていた札と
 * 同じ形に見えた——**自分が押していない項目に勝手にチェックが付く**。
 * いまは印も枠も地色も持たない字の行で、押せるものには見えない。
 *
 * 時間で進めない
 * --------------
 * **演出の時計と、結果ができたかどうかは別のもの。** 時間がたっても
 * 結果が作れていなければ進まない（`ready`）。「時間が来たから次へ」に
 * しておくと、失敗しているのに結果の画面へ進む形がいつでも作れて
 * しまう。
 *
 * 離れたら、進めない
 * ------------------
 * 閉じた・戻った・別の画面を開いた——そのあとに時計だけが生き残って
 * 結果へ飛ばすことが無いようにする。消えるときに時計も止め、
 * 一枚（確認のシート）が開いているあいだは進めない。
 */

import { useEffect, useRef, useState } from "react";

import { IconCheckCircle } from "../../Icons";
import { PoFace } from "../../../po/PoAvatar";
import { isSheetOpen } from "../MoreSheet";
import { resetRadarSpread } from "./RadarChart";

/** 初回。指示どおり5秒。 */
const FULL_MS = 5000;

/** 答えを直したあと。同じ5秒を見せない。 */
const RECALC_MS = 1400;

/**
 * 初回に出す4つの段。
 *
 * `at` は出し始める時刻。最後の1つだけ短い（0.5秒）のは、あれが
 * 「できました」の一言で、読ませる文ではないから。
 */
const STAGES = [
  { at: 0, title: "回答を整理しています" },
  { at: 1500, title: "AIの使い方を見ています" },
  { at: 3000, title: "得意なところと、伸ばせるところを確かめています" },
  { at: 4500, title: "診断結果ができました" },
] as const;

export interface AnalyzingProps {
  /**
   * 結果ができているか。
   *
   * **これが false のあいだは、何秒たっても次へ行かない。**
   */
  ready: boolean;
  /** 見せ終わり、結果もできている。 */
  onDone: () => void;
  /** 動きを減らす設定か。段を追わず、最初から最後の姿で出す。 */
  reduced: boolean;
  /**
   * 初回の診断か、答えを直したあとの作り直しか。
   *
   * 既定は初回。直したあとは短く、言うことも1つにする。
   */
  mode?: "full" | "recalc";
}

export function Analyzing({
  ready,
  onDone,
  reduced,
  mode = "full",
}: AnalyzingProps) {
  const recalc = mode === "recalc";
  const total = recalc ? RECALC_MS : FULL_MS;

  /*
    いま何段目か。**見た目だけの数**で、採点とは関係が無い。
    動きを減らす設定では、最初から最後の段。
  */
  const [stage, setStage] = useState(reduced ? STAGES.length - 1 : 0);

  /*
    帯の進み。最初の描画では 0 で、次の描画で 100 にする——同じ描画の
    中で 0 → 100 にすると、移り変わりが起きずに一瞬で右端へ飛ぶ。
  */
  const [running, setRunning] = useState(false);

  /* 進むのは1度だけ。時計と `ready` の両方から呼ばれる */
  const went = useRef(false);

  /*
    この1枚が出た＝**結果を作っている**。

    ひし形の「もう見せた」を、ここで忘れさせる。答えを直して同じ
    点数に戻った人にも、作り直した回はもう一度出すため。
  */
  useEffect(() => {
    resetRadarSpread();
  }, []);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setRunning(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (reduced || recalc) return;
    const timers = STAGES.slice(1).map((step, at) =>
      window.setTimeout(() => setStage(at + 1), step.at),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reduced, recalc]);

  useEffect(() => {
    /*
      進む条件は3つそろったとき。**どれか1つでも欠けたら進まない。**

        1. 見せ終わった
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
    }, total);
    return () => window.clearTimeout(id);
  }, [ready, onDone, total]);

  const title = recalc ? "結果を更新しています" : STAGES[stage].title;

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
      data-mode={mode}
    >
      {/*
        ポー。既存のものをそのまま使う（描き起こさない）。
        結果を待つ数秒なので、表情は考えごとのまま動かさない。
      */}
      <PoFace emotion="question" size="md" />

      {/*
        段の文。**高さを先に取っておく。**

        4つの文は長さが違い、いちばん長い「得意なところと、伸ばせる
        ところを確かめています」は狭い画面で2行になる。成り行きに
        任せると段が変わるたびに下の帯と項目が動くので、2行ぶんの
        高さを最初から空けておく。
      */}
      <div className="mt-4 flex min-h-[3.5rem] items-center">
        <h1
          className="text-center text-lg font-bold leading-7"
          data-testid="analyzing-title"
        >
          {title}
        </h1>
      </div>

      {/*
        進み具合。**演出そのものの進み具合**で、採点の進捗ではない。

        時間は CSS に任せる（`transition`）。1フレームずつ JavaScript で
        書き換えると、込み合った端末で飛び飛びになる。
      */}
      <div
        className="mt-3 h-1.5 w-full max-w-[15rem] overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-label="診断の進み具合"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={running ? 100 : 0}
        data-testid="analyzing-progress"
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{
            width: running ? "100%" : "0%",
            transition: `width ${total}ms linear`,
          }}
        />
      </div>

      {/*
        4つの段を、そのまま並べる。**最初から4行そろえて置く。**

        順に足していくと、行が増えるたびに下がずれる。順番に見せたいのは
        「1つずつ見ている」ことであって、増えていくことではない。

        直したあと（`recalc`）は出さない。1.4秒で4行を追わせても読めず、
        読めないものを置くと画面が重くなるだけ。
      */}
      {!recalc && (
        <ul
          className="mt-5 w-full max-w-[16rem] space-y-2"
          role="list"
          data-testid="analyzing-axes"
        >
          {STAGES.map((step, at) => {
            const on = at <= stage;
            return (
              <li
                key={step.at}
                data-lit={on ? "yes" : "no"}
                className="flex items-center gap-1.5"
              >
                {/*
                  印。**選ぶ札のチェックには見せない。**

                  輪郭だけの印にして、場所は最初から空けておく
                  （`opacity` で出し入れする。要素は消さない）。
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
                  data-label={step.title}
                >
                  {step.title}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        読み上げには、段が変わるたびの文を渡さない。1.5秒ごとに
        割り込むと、読み上げている途中で次に上書きされる。
        言うのは、いま何が起きているかだけ。
      */}
      <p className="sr-only" role="status">
        {recalc ? "結果を更新しています。" : "回答を整理しています。"}
      </p>
    </div>
  );
}
