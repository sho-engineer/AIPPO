/**
 * AI活用診断の結果。
 *
 * 出すのは4つだけ
 * ---------------
 *     いまの現在地
 *     できていること ×2
 *     次に覚えるAI技 ×1
 *     おすすめレッスン ×1
 *
 * 前はここに**おすすめが3本**並んでいた。選べるように見えて、
 * 「次に何をするか」をもう一度選ばせているだけだった。しかも3本ぶんの
 * カードで画面が縦に伸び、下の「はじめる」が送らないと押せなかった。
 *
 * この画面の役目は**次の1つを決めること**。ほかを見たい人には
 * コースの一覧がある。
 *
 * 点数を出さない
 * --------------
 * 68点・82点のような細かい数字は見せない。刻みが細かいほど正確に
 * 見えるが、5問から出した数字にその精度は無い。軸の段階（1〜5）も
 * ここには出さず、「理由を見る」の中へ回す。
 *
 * 長い話は一枚の中へ
 * ------------------
 * どの回答からそう判断したか・何を伸ばすとよいか・なぜこの1本なのかは
 * 「理由を見る」で開く。通常の画面に長文を置くと、読む画面になって
 * 次の一歩が遠くなる。開いた一枚の中だけは送ってよい。
 *
 * 1画面に収める
 * -------------
 * 縦に積むのは5つまで。増やしたくなったら、それは「理由を見る」の
 * 中身のはず。
 */

import { useState } from "react";

import { IconCheck, IconChevronRight } from "../Icons";
import { MoreSheet } from "./MoreSheet";
import {
  AXES,
  AXIS_LABELS,
  NEXT_SKILL,
  scoreDiagnosis,
} from "../../course/diagnosisScore";
import { recommendLesson, recommendReason } from "../../course/recommend";
import type { Lesson } from "../../course/types";

export interface DiagnosisResultProps {
  /** 診断の答え。 */
  values: Record<string, string>;
  /** おすすめの1本を引くための一覧。 */
  lessons: Lesson[];
  /** 「理由を見る」を開いたとき。分析へ送る。 */
  onOpenReason?: () => void;
}

export function DiagnosisResult({
  values,
  lessons,
  onOpenReason,
}: DiagnosisResultProps) {
  const [reason, setReason] = useState(false);
  const result = scoreDiagnosis(values);
  const lessonId = recommendLesson(values);
  const lesson = lessons.find((one) => one.id === lessonId);
  const skill = NEXT_SKILL[result.weakest];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1" data-testid="completion-view">
      {/* ── いまの現在地。**番号ではなく、できることで言う** ── */}
      <section data-testid="diagnosis-stage">
        <h2 className="text-xs font-bold text-ink-muted">いまの現在地</h2>
        <p className="mt-0.5 text-lg font-bold leading-7 text-brand-dark">
          {result.stage.name}
        </p>
      </section>

      {/* ── できていること。2つだけ ── */}
      <section data-testid="diagnosis-strengths">
        <h2 className="text-xs font-bold text-ink-muted">できていること</h2>
        <ul className="mt-1 space-y-0.5" role="list">
          {result.strengths.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-sm leading-5">
              <IconCheck
                className="mt-1 h-3.5 w-3.5 shrink-0 text-accent-teal"
                aria-hidden="true"
              />
              {line}
            </li>
          ))}
        </ul>
      </section>

      {/*
        次の一歩。**技もレッスンも1つずつ。**

        前は「次に覚えるAI技」と「おすすめレッスン」を別の節にして
        いた。見出しが2つ増えるぶん縦に 40px 伸びて、いちばん低い
        持ち方で下の「理由を見る」が入れ物からあふれていた。
        どちらも「次にやること」なので、1つにまとめる。
      */}
      <section data-testid="diagnosis-next-skill">
        <h2 className="text-xs font-bold text-ink-muted">次の一歩</h2>
        <p className="mt-0.5 text-base font-bold leading-6">{skill.name}</p>
        <p className="text-sm leading-5 text-ink-muted">{skill.summary}</p>
        {lesson && (
          <p
            className="mt-1 text-sm font-bold leading-6"
            data-testid="diagnosis-lesson"
          >
            Day {lesson.number}・{lesson.title}
          </p>
        )}
      </section>

      {/*
        なぜこの1本かを1行だけ。**「理由を見る」は同じ段落の続きに置く。**

        別の行にすると、それだけで 30px 取る。結果画面はいちばん低い
        持ち方（402×660）で余りが無く、その 30px が入れ物からあふれる
        ぶんそのものだった。文の続きとして読めるので、離す理由も無い。
      */}
      <p className="text-sm leading-5 text-ink-muted" data-testid="diagnosis-reason-line">
        {recommendReason(values)}{" "}
        <button
          type="button"
          onClick={() => {
            setReason(true);
            onOpenReason?.();
          }}
          data-testid="diagnosis-reason-open"
          className="whitespace-nowrap font-bold text-brand-dark underline"
        >
          理由を見る
          <IconChevronRight
            className="ml-0.5 inline h-3 w-3 shrink-0 align-[-0.1em]"
            aria-hidden="true"
          />
        </button>
      </p>

      {reason && (
        <MoreSheet
          placement="center"
          testId="diagnosis-reason-sheet"
          title="この結果になった理由"
          onClose={() => setReason(false)}
        >
          <section>
            <h3 className="text-xs font-bold text-ink-muted">いまの段階</h3>
            <p className="mt-1 text-sm font-bold leading-6">{result.stage.name}</p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              {result.stage.summary}
            </p>
          </section>

          {/*
            軸ごとの段階。**ここでだけ数字を出す。**

            通常の画面に出すと、点数を上げる遊びに見える。理由を
            知りたい人が開いた一枚の中なら、判断の材料として読める。
          */}
          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">いまの4つの力</h3>
            <ul className="mt-2 space-y-2" role="list">
              {AXES.map((axis) => (
                <li key={axis} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0">{AXIS_LABELS[axis]}</span>
                  <span
                    className="flex gap-1"
                    aria-label={`${AXIS_LABELS[axis]} 5段階のうち ${result.axes[axis]}`}
                  >
                    {[1, 2, 3, 4, 5].map((step) => (
                      <span
                        key={step}
                        aria-hidden="true"
                        className={`h-2 w-5 rounded-full ${
                          step <= result.axes[axis] ? "bg-brand" : "bg-brand-line"
                        }`}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">どの回答から判断したか</h3>
            <ul className="mt-2 space-y-1.5 text-sm leading-6" role="list">
              {answerLines(values).map((line) => (
                <li key={line}>・{line}</li>
              ))}
            </ul>
          </section>

          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">次に伸ばすとよいところ</h3>
            <p className="mt-1 text-sm leading-6">
              {AXIS_LABELS[result.weakest]}。{skill.name}（{skill.summary}）を
              覚えると、ここが動きます。
            </p>
            {lesson && (
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                「{lesson.title}」をすすめているのは、{lesson.goal}回だからです。
              </p>
            )}
          </section>
        </MoreSheet>
      )}
    </div>
  );
}

/**
 * どの回答から判断したかを、人の言葉で並べる。
 *
 * 記号（`tried` `first_time`）のままでは、読んでも自分の答えだと
 * 分からない。**選んだ札に書いてあった言葉**で返す。
 */
function answerLines(values: Record<string, string>): string[] {
  const usage: Record<string, string> = {
    never: "AIはまだ使ったことがない",
    tried: "AIを試したことはある",
    sometimes: "困ったときにAIを使う",
    work: "仕事でAIをよく使う",
    daily: "ほぼ毎日、いろいろな用途でAIを使う",
  };
  const style: Record<string, string> = {
    lost: "何を書けばいいか迷う、と答えた",
    short: "とりあえず短くお願いする、と答えた",
    condition: "条件を足して頼むことがある、と答えた",
    adapt: "相手や目的に合わせて頼み方を変える、と答えた",
    design: "仕事の流れに合わせて頼み方を組み立てる、と答えた",
  };

  const lines: string[] = [];
  if (usage[values.ai_usage ?? ""]) lines.push(usage[values.ai_usage]);
  if (style[values.ask_style ?? ""]) lines.push(style[values.ask_style]);

  const built = (values.build_prompt ?? "").split("|").filter(Boolean);
  if (built.length === 3) {
    lines.push("お願いを、3つの枠で組み立てた（何をしてほしい・誰向け・言い方）");
  }

  const matched = (values.match_purpose ?? "").split("|");
  const answer = ["organize", "compare", "ideas"];
  const hits = answer.filter((one, index) => matched[index] === one).length;
  if (matched.filter(Boolean).length === 3) {
    lines.push(`3つの場面のうち、${hits}つで場面に合う使い方を選んだ`);
  }

  return lines;
}
