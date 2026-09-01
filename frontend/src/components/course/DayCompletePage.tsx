/**
 * 「Day1 終了！」の1画面。
 *
 * 重ねるのをやめた
 * ----------------
 * 前はこれを完了画面の**上に重ねて**いた。押させてから出す形
 * （完了 → 押す → 祝う）を避けたかったからで、その理由自体は
 * 今も正しい。ただ重ねた結果、祝いの下に「できるようになったこと・
 * 成果物・スタンプ・アンケート・次におすすめ」が透けて並び、
 * **1日やり切った瞬間が、長い縦積みの前置き**になっていた。
 *
 * いまは流れの終点を1画面まるごと持つ。
 *
 *     最後のステップ → できるようになりました → [完了する] → この画面
 *
 * 「完了する」は、押させるためのもう1手ではない。レッスンから
 * 出る意思表示で、押さなければ完了画面に留まれる。
 *
 * 置くものを5つに決める
 * ---------------------
 *     1. 大きなポー
 *     2. 大きな達成メッセージ
 *     3. 覚えたAI技
 *     4. 進み具合（Day1 ✓ ── ○ Day2）
 *     5. 行き先（次のレッスンへ／コースに戻る）
 *
 * カードを積まない。XPも残クレジットも出さない——**数はここの
 * 主役ではない**。長い説明も置かない。
 *
 * スマホでは縦にスクロールさせない
 * --------------------------------
 * 1画面で完結させる。ただし `overflow-hidden` では**切り落とす**ので、
 * 高さは `min-h` で押さえる。Pixel 5（727px）でも Desktop（720px）でも
 * 収まることは E2E が実寸で見張る（`e2e/dayComplete.spec.ts`）。
 * 横向きの極端に低い画面では、切るよりは伸ばす。
 *
 * 待たせない
 * ----------
 * 段階的に出すが、**0ms の時点から押せる**。演出が終わるまで
 * 操作できない画面にはしない。動きを減らす設定のときは、段階を全部
 * 飛ばして最初から最終形を出す（粒は出さない）。CSS の一括停止
 * （index.css）では、遅らせて出すものは**出ないまま消える**ことが
 * あるので、ここは自分で見る。
 */

import { useEffect, useRef, useState } from "react";

import { PoFace } from "../../po/PoAvatar";
import { poInk, poVisibleHeight } from "../../po/sizes";
import { prefersReducedMotion } from "../../course/motion";
import { playSuccessSound } from "../../course/sound";
import { EVENTS, track } from "../../lib/analytics";
import { PrimaryButton } from "../aippo/PrimaryButton";
import { IconCheck, IconChevronRight, IconMedal, IconSparkle } from "../Icons";

/**
 * 出る順番（ms）。
 *
 * 全部で 0.8 秒。これ以上伸ばすと、祝いではなく待ち時間になる。
 * 粒はポーと一緒に散って 0.8 秒で消える。
 */
const STEPS = {
  po: 100,
  title: 250,
  skill: 400,
  progress: 600,
  cta: 800,
} as const;

/** 散る粒。12片。増やすと、祝いではなく演出そのものが目的に見える。 */
const SPREAD = [-40, -31, -22, -13, -5, 3, 11, 20, 29, 37, 44, 50];

/**
 * ポーの置き場所。
 *
 * 枠は正方形だが、**絵が写っているのは中の一部だけ**。枠のまま置くと
 * 上に 56px の透明な帯が乗り、ポーだけが下がって見える。見えている
 * 背丈ぶんの高さを確保して、余白は負の margin で戻す。
 *
 * 高さを先に確保しておく理由はもう1つある。ポーは 100ms 後に
 * 出てくる（`animate-pop-in` を頭から見せるため、そこで初めて
 * 置く）。場所を空けておかないと、出た瞬間に下の文字がずれる。
 */
const INK = poInk("celebration");
const PO_HEIGHT = poVisibleHeight("celebration");

export interface DayCompletePageProps {
  /** 何日目か。教材データの `lesson.number`。 */
  day: number;
  /** その日にできるようになったこと。1行。 */
  outcome: string;
  /** 覚えたAI技。無ければその段ごと出さない。 */
  skill?: string;
  /**
   * 次の日。無ければコースを終えたということ。
   *
   * 進み具合の右の丸に出す。数が無いのに丸だけ置くと、
   * 「まだ先がある」とだけ言って行き先を言わない形になる。
   */
  nextDay?: number;
  /** いちばん押してほしい行き先。無い回はコースに戻るだけになる。 */
  primary?: { label: string; onClick: () => void };
  /** コースの道のりへ戻る。**必ず在る**（行き止まりにしない）。 */
  onBackToCourse: () => void;
}

export function DayCompletePage({
  day,
  outcome,
  skill,
  nextDay,
  primary,
  onBackToCourse,
}: DayCompletePageProps) {
  const quiet = prefersReducedMotion();
  /** どこまで出したか。動きを減らす設定なら、最初から全部。 */
  const [at, setAt] = useState(quiet ? STEPS.cta : 0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    track(EVENTS.dayCompleted, { amount: day });
    playSuccessSound("day");
  }, [day]);

  useEffect(() => {
    if (quiet) return;
    const timers = Object.values(STEPS).map((delay) =>
      window.setTimeout(() => setAt((now) => Math.max(now, delay)), delay),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [quiet]);

  /*
    画面が変わったことを、読み上げにも渡す。

    ここはレッスンの中の1歩ではなく、別の画面へ移った瞬間。
    見出しへ移しておかないと、焦点が前の画面のボタンに残ったまま
    「何が起きたのか」が読まれない。
  */
  useEffect(() => {
    heading.current?.focus();
  }, []);

  /** その段まで来たか。 */
  const shown = (delay: number) => at >= delay;

  /** 現れ方。動きを減らす設定なら、動かさずそのまま出す。 */
  const reveal = (delay: number) => ({
    opacity: shown(delay) ? 1 : 0,
    transform: shown(delay) ? "none" : "translateY(8px)",
    transition: quiet ? "none" : "opacity 260ms ease-out, transform 260ms ease-out",
  });

  return (
    /*
      帯（44px）の下、残り全部。`justify-center` で中身を縦の中央へ置く。

      `h-` ではなく `min-h-` にする。横向きの極端に低い画面で
      `h-` にすると、下の「コースに戻る」が画面の外へ出たまま
      スクロールもできなくなる（＝行き止まり）。
    */
    <div
      data-testid="day-complete"
      className="flex min-h-[calc(100dvh-2.75rem)] flex-col justify-center px-5 py-6"
    >
      <div className="mx-auto w-full max-w-sm">
        {/*
          ポー。この画面の主役なので、いちばん上に大きく置く。

          高さは見えている背丈ぶん（160px）だけ取り、枠が抱えている
          透明な帯は負の margin で戻す。
        */}
        <div
          className="relative flex justify-center"
          style={{ height: PO_HEIGHT }}
        >
          {/* 粒。飾りなので読み上げには出さない */}
          {!quiet && shown(STEPS.po) && (
            <div
              aria-hidden="true"
              data-testid="day-complete-particles"
              className="pointer-events-none absolute inset-x-0 -top-2 h-32 overflow-hidden"
            >
              {SPREAD.map((offset, index) => (
                <span
                  key={offset}
                  className="animate-confetti absolute left-1/2 top-0 block h-1.5
                             w-1.5 rounded-[1px] bg-brand"
                  style={{
                    backgroundColor:
                      index % 3 === 0 ? "var(--joy, #B8425A)" : undefined,
                    animationDelay: `${index * 18}ms`,
                    ["--confetti-x" as string]: `${offset * 2.4}px`,
                  }}
                />
              ))}
            </div>
          )}

          {/*
            出すのは 100ms 後。`animate-pop-in` は**置かれた瞬間**から
            走るので、透明にして隠しておくと、見えたときには跳ね終わって
            いる。場所は上で空けてあるので、出ても下はずれない。
          */}
          {shown(STEPS.po) && (
            <div style={{ marginTop: -INK.top, marginBottom: -INK.bottom }}>
              <PoFace emotion="celebrate" size="celebration" />
            </div>
          )}
        </div>

        <div className="mt-5 text-center" style={reveal(STEPS.title)}>
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-[1.75rem] font-bold leading-9 outline-none"
            data-testid="day-complete-title"
          >
            Day{day} 終了！
          </h1>
          {/*
            できるようになったことを1行。**説明は書かない。**
            「よくできました！」のような褒め言葉も置かない——
            何ができるようになったかのほうが、次の日まで残る。
          */}
          <p
            className="mt-2 text-sm leading-6 text-ink-muted"
            data-testid="day-complete-outcome"
          >
            {outcome}
          </p>
        </div>

        {skill && (
          <div
            className="mt-6 flex items-center gap-3 rounded-card border border-brand-line
                       bg-brand-soft/50 px-4 py-3"
            style={reveal(STEPS.skill)}
            data-testid="day-complete-skill"
          >
            {/*
              印は「AI技」の印（下タブ・図鑑と同じ）にする。技ごとの絵に
              しない——技は9つあり、絵を割り当て始めると、絵を持たない
              技だけがここで無印になる。
            */}
            <IconSparkle className="h-6 w-6 shrink-0 text-brand" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-brand">AI技 GET</span>
              <span className="block text-base font-bold leading-6">{skill}</span>
            </span>
          </div>
        )}

        {/*
          進み具合。

          「n / 9」ではなく、終えた日と次の日だけを出す。数の比は
          コースの画面が持っている。ここで見せたいのは
          **1日ぶん前に進んだ**ことで、全体の何割かではない。

          線が伸びるだけにしない。動きを止めている人にも分かるよう、
          どちらの丸にも日付の文字を添える。
        */}
        <div
          /*
            線は**丸の高さの真ん中**に引く。

            `items-center` にすると、丸（32px）と日付の文字を合わせた
            柱の中央に来るので、線だけが 10px 下がる。実際に描いて
            初めて見えた——数の上では「中央揃え」なので気づけない。
          */
          className="mt-6 flex items-start gap-3"
          style={reveal(STEPS.progress)}
          data-testid="day-complete-progress"
          aria-label={
            nextDay ? `Day${day} 完了。次は Day${nextDay}` : `Day${day} 完了。コース完走`
          }
        >
          <Node label={`Day${day}`} state="done" />
          <span
            aria-hidden="true"
            /* 丸の半分（16px）から線の半分（1px）を引いた位置 */
            className="mt-[15px] h-0.5 flex-1 overflow-hidden rounded-full bg-brand-line"
          >
            <span
              className="block h-full rounded-full bg-brand"
              style={{
                width: shown(STEPS.progress) ? "100%" : "0%",
                transition: quiet
                  ? "none"
                  : "width 460ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            />
          </span>
          {nextDay ? (
            <Node label={`Day${nextDay}`} state="next" />
          ) : (
            <Node label="完走" state="goal" />
          )}
        </div>

        <div className="mt-8 space-y-2" style={reveal(STEPS.cta)}>
          {primary && (
            <PrimaryButton
              testId="day-complete-next"
              onClick={() => {
                track(EVENTS.dayCompleteNextClicked, { amount: day });
                primary.onClick();
              }}
              trailing={<IconChevronRight className="h-5 w-5 shrink-0" />}
            >
              {primary.label}
            </PrimaryButton>
          )}
          {/*
            戻る道は必ず残す。次のレッスンが無い回でも、ここだけは出す
            ——押せる行き先が1つも無い画面を作らない。
          */}
          <button
            type="button"
            data-testid="day-complete-back"
            onClick={onBackToCourse}
            className="min-h-[2.75rem] w-full rounded-cta px-6 text-sm font-bold
                       text-brand-dark transition hover:bg-brand-soft"
          >
            コースに戻る
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 道のりの丸。
 *
 *     done … 終えた日。チェックを入れる
 *     next … 次の日。輪郭だけ
 *     goal … コースを終えた。メダル
 *
 * 色だけで区別しない（要件 §6.12）。3つとも中の印が違う。
 */
function Node({
  label,
  state,
}: {
  label: string;
  state: "done" | "next" | "goal";
}) {
  const look =
    state === "done"
      ? "bg-brand text-white"
      : state === "goal"
        ? "bg-brand-soft text-brand-dark"
        : "border-2 border-brand-line bg-surface text-ink-muted";

  return (
    <span className="flex shrink-0 flex-col items-center gap-1">
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 items-center justify-center rounded-full ${look}`}
      >
        {state === "done" ? (
          <IconCheck className="h-4 w-4" />
        ) : state === "goal" ? (
          <IconMedal className="h-4 w-4" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-brand-line" />
        )}
      </span>
      <span
        className={`text-xs font-bold ${
          state === "next" ? "text-ink-muted" : "text-brand-dark"
        }`}
      >
        {label}
      </span>
    </span>
  );
}
