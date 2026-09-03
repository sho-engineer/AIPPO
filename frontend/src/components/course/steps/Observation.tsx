/**
 * 観察の一覧。
 *
 * AIの結果のどこが変わったのかを、項目に分けて自分で確かめる画面。
 */

import { ChoiceButton } from "../../aippo/ChoiceButton";
import type { LessonStep, StepOption } from "../../../course/types";

// ------------------------------------------------------------- 観察の一覧

/**
 * 「分かりやすくなった？」の答え。
 *
 * 単一選択の押しボタンにする
 * --------------------------
 * 前は四角のチェックを添えた縦の一覧で、値も **カンマ区切りの複数選択**
 * だった。ところがこの問いは「分かりやすくなったか / まだ難しいか」の
 * どちらか1つで、両方は選べない。チェックの形は**複数選べる**と
 * 言っているので、形と中身が食い違っていた。
 *
 * 高さも問題だった。札1つで 56px、2つ縦に積んで 120px——この画面は
 * 1画面に収める柱の中にあり、その 120px はそのまま「AIの結果を読む
 * 場所」から引かれる。実測（402×660）では、下の帯に札が隠れていた。
 *
 * 押しボタンなら、選ばれていることは枠と地とチェックで表せて、
 * 高さは1行ぶんで足りる。**選べるのは常に1つ**。
 */
export function ObservationList({
  step,
  value,
  onChange,
}: {
  step: LessonStep;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = step.options ?? [];

  /*
    短い2択は横に並べる。3つ以上や長い言葉のときは縦のまま——
    横に詰めると折り返して、札の高さが揃わなくなる。

    9字までにする。10字ふたつ（＝両方いっぱい）は、いちばん狭い
    持ち方で足し合わせると枠を越える。
  */
  const sideBySide =
    options.length === 2 && options.every((option) => option.label.length <= 9);

  return (
    /*
      横に並べるときは、**幅を半分ずつに割らない**（`grid-cols-2` を
      使わない）。

      割ると、長いほうの札に残る幅は 393px の画面で 131px。
      「分かりやすくなった」には 136px 要るので、**「分かりや／
      すくなった」と語の途中で割れる**（実測）。文字を短くしても
      直らない種類の折り返しで、原因は幅の配り方のほう。

      `flex-auto` は、まず言葉の長さぶんを配り、余りを等分する。
      長い札が広く、短い札が狭くなるので、**どちらも1行**で収まる。
    */
    <ul
      className={sideBySide ? "flex gap-2" : "space-y-2"}
      role="list"
      data-testid="observation-list"
      data-layout={sideBySide ? "row" : "stack"}
    >
      {options.map((option) => (
        <li key={option.value} className={sideBySide ? "flex-auto" : undefined}>
          <ChoiceButton
            label={option.label}
            selected={value === option.value}
            /*
              横に並べるときは、印を浮かせて文字に幅を渡す。流れの中に
              20px＋12px を確保したままだと、「分かりやすくなった」が
              **語の途中で折れる**（実測で「分かりや／すくなった」）。
            */
            compact={sideBySide}
            /*
              押し直しで選び直せる。**取り消しはできない**——
              この問いには「どちらでもない」が無いので、空に戻せると
              先へ進めない状態を自分で作れてしまう。
            */
            onSelect={() => onChange(option.value)}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * うまくいかなかった人にだけ、その場で理由を聞く。
 *
 * なぜ要るか
 * ----------
 * 結果の直後の問いを2択（「うん」「まだ微妙」）に減らすと画面は軽く
 * なるが、**何に気づいたかが測れなくなる**。前は5つの選択肢がその
 * 役目を持っていた。
 *
 * 全員に聞き直すと元の重さに戻るので、**困っている人にだけ**聞く。
 * 進んでいる人の画面は軽いまま、詰まっている人の情報は残る。
 *
 * 答えなくても進める。ここで止めると、理由を選べない人が
 * 行き止まりになる。
 */
export function ObservationReason({
  reasons,
  value,
  onChange,
}: {
  reasons: StepOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (reasons.length === 0) return null;

  return (
    <div className="mt-4" data-testid="observation-reason">
      <p className="text-xs font-bold text-ink-muted">どこが？（任意）</p>
      <ul className="mt-2 flex flex-wrap gap-2" role="list">
        {reasons.map((reason) => {
          const active = value === reason.value;
          return (
            <li key={reason.value}>
              <button
                type="button"
                onClick={() => onChange(active ? "" : reason.value)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  active
                    ? "border-brand bg-brand-soft text-brand-dark"
                    : "border-line bg-surface hover:border-brand-line"
                }`}
              >
                {reason.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
