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
  /* もう一段奥（答えと理由）。上の一枚を閉じずに重ねる */
  const [deep, setDeep] = useState(false);
  /* ほかの候補。通常の画面では名前も出さない */
  const [also, setAlso] = useState(false);
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
    /*
      余りは、**全部の切れ目へ等しく配る**（`justify-between`）。

      1か所にまとめて置くと、そこだけぽっかり空く。伸びる仕切りを
      1つ置いて上限を付けたときは、縦の長い端末で下に 380px の
      空白が残った——「上半分に詰まって下半分が空く」と言われた形が、
      場所を変えて出ただけだった。

      余りが無いとき（402×660）は上詰めと同じ振る舞いになる。
      足りないときに上が切れることも無いので、送れる入れ物の中でも
      安全に使える。
    */
    <div
      className="flex min-h-0 flex-1 flex-col justify-between"
      data-testid="completion-view"
    >
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
        grow
        onExpand={() => {
          setOpen(true);
          onOpenReason?.();
        }}
        /*
          「くわしく見る」は**図の札の中**に置く。

          独立した1行にしていたころは、何の詳細なのかが置き場から
          読めなかった——現在地の話なのか、おすすめの話なのか。
          図と同じ札の中にあれば、図の続きだと分かる。
        */
        footer={
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              onOpenReason?.();
            }}
            data-testid="diagnosis-reason-open"
            className="flex items-center gap-0.5 rounded-badge px-1 py-0.5
                       text-[0.6875rem] font-bold text-brand-dark
                       transition hover:bg-brand-soft"
          >
            くわしく見る
            <IconChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
          </button>
        }
      >
        {chart === "stage" ? (
          /*
            道のときは、段階の説明も添える。

            道は横に伸びる図なので、札を伸ばしても中の余白が増える
            だけ——空の白い箱の真ん中に細い線が1本、という姿に
            なっていた（390×844 で実測）。空くところは、**読んで
            意味のあるもの**で埋める。低い持ち方では2行で切る。
          */
          <GrowthTrack stage={result.stage.number} summary />
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
        className="mt-2 shrink-0 flex flex-wrap gap-1.5"
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
      {/*
        ここが切れ目。**上は「いまの話」、下は「次の話」。**
        ほかの切れ目より一段広く取って、読む向きを切り替えてもらう。
      */}
      <div className="mt-5 rounded-card border border-brand-line bg-brand-soft px-3 py-2.5"
           data-testid="diagnosis-next-skill">
        {/*
          技の名前を、この画面でいちばん大きく出す。

          前は「次の一歩 トーン指定」と1行に並べていて、見出しと
          同じ大きさに埋もれていた。診断のあとにすることは**この技を
          覚えること**なので、そこだけ字を上げる。行数は増やさない。
        */}
        <p className="text-[0.625rem] font-bold leading-4 text-ink-muted">次の一歩</p>
        <p className="text-lg font-bold leading-7 text-brand-dark">{skill.name}</p>
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
      {/*
        ほかの候補。**通常の画面では、名前も出さない。**

        前は Day2 と Day5 を横に並べていた。小さくはしてあったが、
        上の1本と同じ画面に3つ並ぶと、結局「どれにするか」をもう一度
        考えることになる。この画面の役目は**次の1本を決めること**。

        消しはしない。上の1本が刺さらなかった人の行き先が無くなる。
        名前を隠して、開いた人にだけ見せる。
      */}
      {plan.rest.length > 0 && (
        <button
          type="button"
          onClick={() => setAlso(true)}
          data-testid="diagnosis-also-open"
          className="mt-1.5 self-start rounded-badge px-1 py-0.5 text-[0.6875rem]
                     text-ink-muted underline transition hover:text-ink"
        >
          ほかの候補を見る
        </button>
      )}

      {also && (
        <MoreSheet
          placement="center"
          testId="diagnosis-also-sheet"
          title="ほかの候補"
          onClose={() => setAlso(false)}
        >
          <p className="text-sm leading-6 text-ink-muted">
            上の1本が合わないときは、こちらから。
          </p>
          <ul className="mt-3 space-y-2" role="list" data-testid="diagnosis-also">
            {plan.rest.map((id) => {
              const one = find(id);
              if (!one) return null;
              const inside = (
                <>
                  <span className="block text-xs font-bold leading-4 text-ink-muted">
                    Day {one.number}
                  </span>
                  <span className="mt-0.5 block text-sm leading-5">{one.title}</span>
                </>
              );
              const shape = `block w-full rounded-card border border-line
                             bg-surface px-3 py-2.5 text-left`;
              return (
                <li key={id}>
                  {onPickLesson ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAlso(false);
                        onPickLesson(id);
                      }}
                      data-testid="diagnosis-also-pick"
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
        </MoreSheet>
      )}

      {open && (
        <MoreSheet
          placement="center"
          testId="diagnosis-reason-sheet"
          title="いまの様子"
          onClose={() => setOpen(false)}
        >
          {/*
            一枚の中は、**上から 切り替え → 図 → 3行**だけ。

            前はここに軸の内訳・長い説明・答えの一覧まで入れていて、
            開いた瞬間に送らないと読み終わらない量があった。補足を
            見る場所が「別のページ」に見えていた、と言われたのが
            そこ。読み物は下の「答えと理由」へもう一段落とす。
          */}
          <ChartSwitch value={chart} onChange={setChart}>
            {chart === "stage" ? (
              <GrowthTrack stage={result.stage.number} size="lg" />
            ) : (
              <RadarChart axes={result.axes} focus={result.weakest} size="lg" />
            )}
          </ChartSwitch>

          {/* 3行だけ。名前と中身を1行に収めて、段落にしない */}
          <dl className="mt-4 space-y-2 text-sm leading-5">
            {[
              ["いまの現在地", result.stage.name],
              ["できていること", result.strengths.join("・")],
              ["次にやると良いこと", skill.name],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="w-24 shrink-0 text-xs leading-5 text-ink-muted">
                  {label}
                </dt>
                <dd className="min-w-0 flex-1 font-bold text-brand-dark">{value}</dd>
              </div>
            ))}
          </dl>

          {/*
            なぜこの1本か。**通常の画面から、ここへ移した。**

            画面では独立した1行になっていて、何の話なのかが置き場から
            読めなかった。3行のすぐ下なら、その続きとして読める。
          */}
          <p
            className="mt-3 text-sm leading-6 text-ink-muted"
            data-testid="diagnosis-reason-line"
          >
            {recommendReason(values)}
          </p>

          <button
            type="button"
            onClick={() => setDeep(true)}
            data-testid="diagnosis-detail-open"
            className="mt-4 flex w-full items-center justify-center gap-1 rounded-cta
                       border border-line py-2 text-sm font-bold text-brand-dark
                       transition hover:bg-brand-soft"
          >
            答えと理由を見る
            <IconChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </button>
        </MoreSheet>
      )}

      {/*
        もう一段奥。**読みたい人だけが来る場所。**

        ここだけは文章が長くてよい。「←」は奥から順に閉じるので
        （`components/course/BackStack.tsx`）、ここから戻れば上の一枚が
        そのまま残る。
      */}
      {deep && (
        <MoreSheet
          elevated
          placement="center"
          testId="diagnosis-detail-sheet"
          title="答えと理由"
          onClose={() => setDeep(false)}
        >
          <section>
            <h3 className="text-xs font-bold text-ink-muted">できていること</h3>
            <div className="mt-2">
              <AxisBars axes={result.axes} focus={result.weakest} />
            </div>
          </section>

          <section className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-bold text-ink-muted">次にやると良いこと</h3>
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
            直せないと、出た結果を信じるしかなくなる。
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
                      /*
                        先に一枚を閉じてから移る。

                        開いたまま問いへ移ると、一枚は画面ごと消える。
                        消え方が「閉じた」ではないので、開くときに
                        積んだ履歴が1つ残り、そのあとの「戻る」が
                        1回空振りする。
                      */
                      onClick={() => {
                        setDeep(false);
                        setOpen(false);
                        onEditAnswer(entry.stepId);
                      }}
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
