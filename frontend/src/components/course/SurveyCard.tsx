/**
 * 完了時のアンケート（AIPPO 開発概要 §11 / N-5）。
 *
 * 出す場所は、レッスンを1本終えた直後だけ。同じレッスンでは二度聞かない。
 *
 * ここでしか取れないものがある
 * ----------------------------
 * フェーズ2→3 の判定にある「有料テストの申込率」は、記録から出せない。
 * 聞かないと分からない唯一の数字なので、3問のうち1問をそれに充てている
 * （`SURVEY_COPY` に理由を書いてある）。
 *
 * 引き止めない
 * ------------
 * 学習はもう終わっている。答えなくても閉じられるし、送れなくても
 * 失敗として見せない。ここで止めると、最後の印象だけが悪くなる。
 *
 * 選ぶところは `<fieldset>` と `<input type="radio">` で組む。
 * ボタンの並びで作ると「この中から1つ」が読み上げに伝わらない。
 * 見た目の帯（`SegmentedChoice`）は見出しを読み上げ専用にしているので、
 * 質問文を見せたいここでは使えない（同じ文が二度読まれる）。
 */

import { useId, useState } from "react";

import { Card, CardHeading } from "../AppShell";
import { IconChat, IconCheck, IconCheckCircle } from "../Icons";
import { SURVEY_COPY } from "../../content/ui";
import { alreadyAsked, rememberAsked } from "../../course/survey";
import { sendSurvey } from "../../api/lesson";

function Question({
  question,
  options,
  value,
  onChange,
}: {
  question: string;
  options: readonly string[];
  value: string | undefined;
  onChange: (next: string) => void;
}) {
  const name = useId();

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-sm font-bold leading-7">{question}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option === value;
          return (
            <label
              key={option}
              className={`flex min-h-[2.75rem] cursor-pointer items-center gap-2
                          rounded-card px-4 py-2 text-sm transition
                          ${
                            active
                              ? "bg-brand-grad font-bold text-white shadow-pop"
                              : "bg-canvas shadow-card hover:bg-brand-soft/60"
                          }`}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={active}
                onChange={() => onChange(option)}
                className="sr-only"
              />
              {/* 選ばれていることを色だけで示さない（要件 §6.12） */}
              {active && <IconCheck className="h-4 w-4 shrink-0" />}
              {option}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SurveyCard({ lessonId }: { lessonId: string }) {
  // 初回の描画で決める。あとから消えたり出たりしないようにする
  const [asked, setAsked] = useState(() => alreadyAsked(lessonId));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  /*
    送れたときと送れなかったときで、目印を分ける。
    同じ目印にすると、届いていないのに「送れた」と読めてしまい、
    見張るほうも本当に届いたかを確かめられない。
  */
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  if (notice) {
    return (
      <Card testId={notice.ok ? "survey-done" : "survey-failed"}>
        <p role="status" className="flex items-start gap-2.5 text-sm leading-7">
          <IconCheckCircle className="mt-1.5 h-4 w-4 shrink-0 text-brand" />
          {notice.message}
        </p>
      </Card>
    );
  }

  if (asked) return null;

  const answered = SURVEY_COPY.questions.filter((q) => answers[q.key]).length;
  const complete = answered === SURVEY_COPY.questions.length;

  const skip = () => {
    rememberAsked(lessonId);
    setAsked(true);
  };

  const submit = async () => {
    setSending(true);
    /*
      答えは「質問文 → 選んだ文」で送る。集計画面が質問文をそのまま
      見出しにするため（`admin.py` の `survey_tally`）。
    */
    const payload: Record<string, string> = {};
    for (const q of SURVEY_COPY.questions) payload[q.question] = answers[q.key];

    const ok = await sendSurvey(lessonId, payload);
    setSending(false);

    /*
      送れたときだけ覚える。送れなかったのに覚えると、答えは
      どこにも残らないまま二度と聞けなくなる。
    */
    if (ok) rememberAsked(lessonId);
    setNotice({ ok, message: ok ? SURVEY_COPY.done : SURVEY_COPY.failed });
  };

  return (
    <Card testId="survey">
      <CardHeading icon={IconChat} tone="plain">
        {SURVEY_COPY.title}
      </CardHeading>
      <p className="mt-2 text-xs leading-6 text-ink-muted">{SURVEY_COPY.lead}</p>

      <div className="mt-4 space-y-5">
        {SURVEY_COPY.questions.map((q) => (
          <Question
            key={q.key}
            question={q.question}
            options={q.options}
            value={answers[q.key]}
            onChange={(next) => setAnswers((prev) => ({ ...prev, [q.key]: next }))}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          data-testid="survey-submit"
          disabled={!complete || sending}
          onClick={() => void submit()}
          className="min-h-[3rem] flex-1 rounded-full bg-brand-grad px-6 py-3 text-base
                     font-bold text-white shadow-pop transition
                     enabled:hover:brightness-110 enabled:active:brightness-95
                     disabled:cursor-not-allowed disabled:opacity-60"
        >
          {SURVEY_COPY.submit}
        </button>
        <button
          type="button"
          data-testid="survey-skip"
          onClick={skip}
          className="min-h-[3rem] flex-1 rounded-full border border-line px-6 py-3
                     text-sm text-ink-muted transition hover:bg-canvas"
        >
          {SURVEY_COPY.skip}
        </button>
      </div>

      {/* 押せない理由を、押せないボタンの近くに書く */}
      {!complete && (
        <p className="mt-2 text-center text-xs text-ink-muted">
          あと{SURVEY_COPY.questions.length - answered}つ選ぶと送れます
        </p>
      )}
    </Card>
  );
}
