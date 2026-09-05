/**
 * AI活用診断の結果。
 *
 * 出すのは、まず概要だけ
 * ----------------------
 * 一度に全部見せない。開いた直後に見えるのは
 *
 *     図（切り替え） … いまどこにいるか／どこが薄いか
 *     現在地と、できていること
 *     次の一歩 ＋ おすすめ
 *     くわしく見る
 *
 * の4つ。判断の理由・回答の反映・軸ごとの内訳・答えの直しは、
 * ぜんぶ「くわしく見る」の一枚の中へ回す。
 *
 * なぜ逃がすのか
 * --------------
 * 結果の画面でしてほしいのは「次の1本を決めること」で、読むことでは
 * ない。同じ場所に理由まで並べると、読む画面になって次の一歩が遠くなる
 * ——そのうえ、いちばん低い持ち方（402×660）では下のボタンまで届かない。
 *
 * 図は2通りから選べる
 * -------------------
 * 道（`GrowthTrack`）と、ひし形（`RadarChart`）。同じ4つの答えでも
 * 知りたいことは人によって違う。両方を同時に出すと縦に伸びるうえ、
 * どちらを読めばよいのか決められなくなるので、片方ずつ出す。
 *
 * 点数を出さない
 * --------------
 * 68点・82点のような細かい数字は見せない。刻みが細かいほど正確に
 * 見えるが、5問から出した数字にその精度は無い。段は5つまで。
 */

import { useState } from "react";

import { IconCheck, IconChevronRight } from "../Icons";
import { MoreSheet } from "./MoreSheet";
import { AxisBars } from "./diagnosis/AxisBars";
import { ChartSwitch, type ChartKind } from "./diagnosis/ChartSwitch";
import { GrowthTrack } from "./diagnosis/GrowthTrack";
import { RadarChart } from "./diagnosis/RadarChart";
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
  /**
   * 添えたレッスンを、その場から始める。
   *
   * 2本目・3本目は「1本目が違ったとき」の行き先。押せる形にしてあるのに
   * 押せないと、見えているだけで届かない道になる。渡されなければ
   * 押せない見た目にする（`button` を出さない）。
   */
  onPickLesson?: (lessonId: string) => void;
}

export function DiagnosisResult({
  values,
  lessons,
  onOpenReason,
  onEditAnswer,
  onPickLesson,
}: DiagnosisResultProps) {
  const [open, setOpen] = useState(false);
  /*
    どちらの図を出しているか。**画面の中に持つ。**

    端末に覚えさせない。診断は基本1回で、次に開くのはずっと先。
    そのとき前回どちらを見たかは、本人ももう覚えていない。
  */
  const [chart, setChart] = useState<ChartKind>("stage");

  const result = scoreDiagnosis(values);
  const plan = recommendPlan(values);
  const skill = NEXT_SKILL[result.weakest];
  const find = (id: string) => lessons.find((one) => one.id === id);
  const first = find(plan.first);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="completion-view">
      {/*
        図。押すと、同じものが一枚の中で大きく開く。

        ここに置ける大きさは、いちばん低い持ち方（402×660）で送らずに
        収まる上限まで——ひし形は 92px 角しかなく、**読むには小さい**。
        収める都合と読める大きさは両立しないので、読みたい人には
        開いた一枚のほうで応える。
      */}
      <ChartSwitch
        value={chart}
        onChange={setChart}
        onExpand={() => {
          setOpen(true);
          onOpenReason?.();
        }}
      >
        {chart === "stage" ? (
          <GrowthTrack stage={result.stage.number} />
        ) : (
          <RadarChart axes={result.axes} focus={result.weakest} />
        )}
      </ChartSwitch>

      {/*
        できていること。**図の外に置く。**

        中に入れていたころは、「スキルバランス」へ切り替えると
        消えていた。切り替えるのは図の見せ方であって、できている
        ことは切り替えの対象ではない。

        言葉は2つまで、札にする。「✓ ＋ 1行」を2つ縦に積むと
        見出しを入れて3行ぶんの高さを取るが、札なら1行に収まる。
      */}
      <ul
        className="mt-2 flex flex-wrap gap-1.5"
        role="list"
        data-testid="diagnosis-strengths"
      >
        {result.strengths.map((line) => (
          <li
            key={line}
            className="flex items-center gap-1 rounded-badge bg-brand-soft px-2 py-0.5
                       text-[0.6875rem] font-bold leading-4 text-brand-dark"
          >
            <IconCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
            {line}
          </li>
        ))}
      </ul>

      {/*
        次の一歩。**技とレッスンを1つの札にまとめる。**

        技（プロンプト）とレッスン（Day1）を別の節にすると、見出しが
        2つ増えるぶん縦に 40px 伸びる。そもそもこの2つは同じことの
        言いかえ——その技を渡すのがそのレッスンなので、離す理由が無い。

        どちらも同じ軸（`weakest`）から引いてある。前はここだけ
        しきい値がずれていて、「次の一歩 プロンプト ／ Day 5・選択肢を
        比較する」のように**技と行き先が食い違う**ことがあった。
      */}
      <div className="mt-2 rounded-card border border-brand-line bg-brand-soft px-3 py-2"
           data-testid="diagnosis-next-skill">
        <p className="leading-5">
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
        行き先。小さくしてあるのは、選び直しを勧めていないため。
      */}
      {plan.rest.length > 0 && (
        <ul className="mt-1.5 flex gap-1.5" role="list" data-testid="diagnosis-also">
          {plan.rest.map((id) => {
            const one = find(id);
            if (!one) return null;
            const inside = (
              <>
                <span className="shrink-0 text-[0.625rem] font-bold text-ink-muted">
                  Day {one.number}
                </span>
                <span className="min-w-0 truncate text-[0.6875rem] leading-5">
                  {one.title}
                </span>
              </>
            );
            const shape = `flex w-full min-w-0 items-baseline gap-1 rounded-badge
                           border border-line bg-surface px-2 py-1 text-left`;
            return (
              <li key={id} className="min-w-0 flex-1">
                {onPickLesson ? (
                  <button
                    type="button"
                    onClick={() => onPickLesson(id)}
                    data-testid="diagnosis-also-open"
                    className={`${shape} transition hover:border-brand-line`}
                  >
                    {inside}
                  </button>
                ) : (
                  <span className={shape}>{inside}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/*
        なぜこの1本かを1行だけ。**「くわしく見る」は同じ段落の続きに。**

        別の行にすると、それだけで 30px 取る。結果画面はいちばん低い
        持ち方（402×660）で余りが無く、その 30px が入れ物からあふれる
        ぶんそのものだった。文の続きとして読めるので、離す理由も無い。
      */}
      <p
        className="mt-2 text-[0.8125rem] leading-5 text-ink-muted"
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
          title="診断の見かた"
          onClose={() => setOpen(false)}
        >
          {/*
            図を、大きく。**一枚のいちばん上に置く。**

            ここは読むために開いた場所なので、1画面に収める都合から
            外れてよい。切り替えは結果の画面と同じものを使い、
            状態も共有する——開いてから切り替えて閉じたのに、後ろの
            小さい図だけ元のまま、では何を見ていたのか分からなくなる。
          */}
          <ChartSwitch value={chart} onChange={setChart}>
            {chart === "stage" ? (
              <GrowthTrack stage={result.stage.number} size="lg" />
            ) : (
              <RadarChart axes={result.axes} focus={result.weakest} size="lg" />
            )}
          </ChartSwitch>

          {/*
            軸ごとの内訳。**通常の画面から、ここへ移した。**

            結果の画面に横棒4本を置くと 85px を取り、そのぶん
            おすすめと「くわしく見る」が下のボタンに隠れていた。
            内訳は「なぜそう出たか」を知りたい人のもので、
            次の1本を決めるのに要るものではない。
          */}
          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">4つの力の内訳</h3>
            <div className="mt-2">
              <AxisBars axes={result.axes} focus={result.weakest} />
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              5段階で出しています。細かい点数は出しません——5つの質問から
              出した数字に、そこまでの精度は無いためです。
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
