/**
 * AI活用診断の結果。
 *
 * 図を先に、文をあとに
 * --------------------
 * 前はここが**文字だけ**だった。「いまの現在地」「できていること」
 * 「次の一歩」と見出しが縦に並び、その下に短い文がぶら下がる。読めば
 * 分かるが、読むまで何も分からない——診断の結果として、それでは遅い。
 *
 * いまは上から
 *
 *     道（5つの点）        … いまどこにいるか
 *     横棒（4つの力）      … 何が埋まっていて、何が空いているか
 *     次の一歩 ＋ おすすめ … で、何をするか
 *
 * の順。上2つは図で、開いた瞬間に伝わる。文はその補足として置く。
 *
 * 点数を出さない
 * --------------
 * 68点・82点のような細かい数字は見せない。刻みが細かいほど正確に
 * 見えるが、5問から出した数字にその精度は無い。段は5つまで。
 *
 * 長い話は一枚の中へ
 * ------------------
 * どの回答からそう判断したか・答えの直し・なぜこの1本なのかは
 * 「くわしく見る」で開く。通常の画面に長文を置くと、読む画面になって
 * 次の一歩が遠くなる。開いた一枚の中だけは送ってよい。
 */

import { useState } from "react";

import { IconCheck, IconChevronRight } from "../Icons";
import { MoreSheet } from "./MoreSheet";
import { AxisBars } from "./diagnosis/AxisBars";
import { GrowthTrack } from "./diagnosis/GrowthTrack";
import {
  AXIS_LABELS,
  NEXT_SKILL,
  scoreDiagnosis,
} from "../../course/diagnosisScore";
import { recommendPlan, recommendReason } from "../../course/recommend";
import type { Lesson } from "../../course/types";

export interface DiagnosisResultProps {
  /** 診断の答え。 */
  values: Record<string, string>;
  /** おすすめの1本を引くための一覧。 */
  lessons: Lesson[];
  /** 「くわしく見る」を開いたとき。分析へ送る。 */
  onOpenReason?: () => void;
  /**
   * 答えを直しに戻る。
   *
   * 前はこれを画面の上の折りたたみ（「ここまでに答えた内容（5件）」）で
   * 出していた。結果を見に来た画面のいちばん上に、答えの一覧が畳まれて
   * 場所を取っている状態で、**結果より先に自分の答えが目に入る**。
   * いまは「くわしく見る」の中へ移した。
   */
  onEditAnswer?: (stepId: string) => void;
}

export function DiagnosisResult({
  values,
  lessons,
  onOpenReason,
  onEditAnswer,
}: DiagnosisResultProps) {
  const [open, setOpen] = useState(false);
  const result = scoreDiagnosis(values);
  const plan = recommendPlan(values);
  const skill = NEXT_SKILL[result.weakest];
  const find = (id: string) => lessons.find((one) => one.id === id);
  const first = find(plan.first);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="completion-view">
      {/* ── いまどこにいるか。道の上の点で示す ── */}
      <GrowthTrack stage={result.stage.number} />

      {/*
        できていること。**言葉は2つまで、札にする。**

        以前は「✓ ＋ 1行」を2つ、縦に積んでいた。見出しを入れて 3行
        ぶんの高さを取っていて、いちばん低い持ち方ではそれが下の
        おすすめを押し出していた。札にすれば1行に収まる。
      */}
      <ul
        className="mt-1.5 flex flex-wrap gap-1.5"
        role="list"
        data-testid="diagnosis-strengths"
      >
        {result.strengths.map((line) => (
          <li
            key={line}
            className="flex items-center gap-1 rounded-badge bg-brand-soft px-2 py-1
                       text-[0.6875rem] font-bold leading-4 text-brand-dark"
          >
            <IconCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
            {line}
          </li>
        ))}
      </ul>

      {/* ── 4つの力。どこが空いているかが、次にやることそのもの ── */}
      <div className="mt-1.5 border-t border-line pt-2">
        <AxisBars axes={result.axes} focus={result.weakest} />
      </div>

      {/*
        次の一歩。**技とレッスンを1つの札にまとめる。**

        技（プロンプト）とレッスン（Day1）を別の節にすると、見出しが
        2つ増えるぶん縦に 40px 伸びる。そもそもこの2つは同じことの
        言いかえ——その技を渡すのがそのレッスンなので、離す理由が無い。
      */}
      <div className="mt-1.5 border-t border-line pt-2">
        <div
          className="rounded-card border border-brand-line bg-brand-soft px-3 py-2"
          data-testid="diagnosis-next-skill"
        >
          {/*
            見出しと技の名前を**同じ行に**置く。

            別の行にすると、それだけで 16px。結果の画面は
            402×660 で余りが無く、ここと下の2枚で 31px 削らないと
            「くわしく見る」が入れ物からあふれる。
          */}
          <p className="leading-6">
            <span className="text-[0.6875rem] font-bold text-ink-muted">次の一歩</span>{" "}
            <span className="text-[0.9375rem] font-bold text-brand-dark">
              {skill.name}
            </span>
          </p>
          {first && (
            <p
              className="text-[0.8125rem] leading-5 text-ink-muted"
              data-testid="diagnosis-lesson"
            >
              Day {first.number}・{first.title}
            </p>
          )}
        </div>

        {/*
          2本目・3本目。**1本目とは大きさを変える。**

          同じ大きさで3枚並べると、どれを選ぶかをもう一度考えることに
          なる。決めるのは上の1本で、ここは「そこが違ったとき」の
          行き先として置く。押せるようには**しない**——押す先は画面の
          下の1つだけ、という決まりをここで崩さない（憲章 原則 I）。
        */}
        {plan.rest.length > 0 && (
          <ul
            className="mt-1.5 flex gap-1.5"
            role="list"
            data-testid="diagnosis-also"
          >
            {plan.rest.map((id) => {
              const one = find(id);
              if (!one) return null;
              return (
                <li
                  key={id}
                  className="flex min-w-0 flex-1 items-baseline gap-1 rounded-badge
                             border border-line bg-surface px-2 py-1"
                >
                  <span className="shrink-0 text-[0.625rem] font-bold text-ink-muted">
                    Day {one.number}
                  </span>
                  <span className="min-w-0 truncate text-[0.6875rem] leading-5">
                    {one.title}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/*
        なぜこの1本かを1行だけ。**「くわしく見る」は同じ段落の続きに。**

        別の行にすると、それだけで 30px 取る。結果画面はいちばん低い
        持ち方（402×660）で余りが無く、その 30px が入れ物からあふれる
        ぶんそのものだった。文の続きとして読めるので、離す理由も無い。
      */}
      <p
        className="mt-2.5 text-[0.8125rem] leading-5 text-ink-muted"
        data-testid="diagnosis-reason-line"
      >
        {recommendReason(values)}{" "}
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            onOpenReason?.();
          }}
          data-testid="diagnosis-reason-open"
          className="whitespace-nowrap font-bold text-brand-dark underline"
        >
          くわしく見る
          <IconChevronRight
            className="ml-0.5 inline h-3 w-3 shrink-0 align-[-0.1em]"
            aria-hidden="true"
          />
        </button>
      </p>

      {open && (
        <MoreSheet
          placement="center"
          testId="diagnosis-reason-sheet"
          title="この結果になったわけ"
          onClose={() => setOpen(false)}
        >
          <section>
            <h3 className="text-xs font-bold text-ink-muted">いまの段階</h3>
            <p className="mt-1 text-sm font-bold leading-6">{result.stage.name}</p>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              {result.stage.summary}
            </p>
          </section>

          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">次に伸ばすとよいところ</h3>
            <p className="mt-1 text-sm leading-6">
              {AXIS_LABELS[result.weakest]}。{skill.name}（{skill.summary}）を
              覚えると、ここが動きます。
            </p>
            {first && (
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                「{first.title}」をすすめているのは、{first.goal}回だからです。
              </p>
            )}
          </section>

          {/*
            答えた内容と、直す道。

            結果を見てから「そこは違う」と気づく人がいる。気づいたのに
            直せないと、出た結果を信じるしかなくなる。ここに置くのは、
            **結果より先に自分の答えが目に入らない**ようにするため。
          */}
          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">答えた内容</h3>
            <ul className="mt-2 space-y-2" role="list">
              {answerLines(values).map((entry) => (
                <li
                  key={entry.stepId}
                  className="flex items-start justify-between gap-3 text-sm leading-6"
                >
                  <span className="min-w-0">{entry.text}</span>
                  {onEditAnswer && (
                    <button
                      type="button"
                      onClick={() => onEditAnswer(entry.stepId)}
                      className="shrink-0 rounded-badge border border-line px-3 py-1
                                 text-xs text-brand-dark transition hover:bg-brand-soft"
                    >
                      なおす
                    </button>
                  )}
                </li>
              ))}
            </ul>
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
 *
 * どの問いの答えかも一緒に返す。「なおす」でその問いへ戻すのに要る。
 */
export function answerLines(
  values: Record<string, string>,
): { stepId: string; text: string }[] {
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

  const lines: { stepId: string; text: string }[] = [];
  if (usage[values.ai_usage ?? ""]) {
    lines.push({ stepId: "ai_usage", text: usage[values.ai_usage] });
  }
  if (style[values.ask_style ?? ""]) {
    lines.push({ stepId: "ask_style", text: style[values.ask_style] });
  }

  const built = (values.build_prompt ?? "").split("|").filter(Boolean);
  if (built.length === 3) {
    lines.push({
      stepId: "build_prompt",
      text: "お願いを、3つの枠で組み立てた（何をしてほしい・誰向け・言い方）",
    });
  }

  const matched = (values.match_purpose ?? "").split("|");
  const answer = ["organize", "compare", "ideas"];
  const hits = answer.filter((one, index) => matched[index] === one).length;
  if (matched.filter(Boolean).length === 3) {
    lines.push({
      stepId: "match_purpose",
      text: `3つの場面のうち、${hits}つで場面に合う使い方を選んだ`,
    });
  }

  return lines;
}
