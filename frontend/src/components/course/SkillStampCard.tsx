/**
 * スタンプ台紙。「覚えた」を押した直後に、1つだけ押される。
 *
 * なぜ要るか
 * ----------
 * 技を受け取る画面（`SkillGet`）は**1つぶんの出来事**しか言わない。
 * 「プロンプトを覚えた」で終わり、その日の何個目なのか、あと何個で
 * 揃うのかが分からない。3つ集めると1日が終わる作りなのに、集まって
 * いく感じが画面のどこにも出ていなかった。
 *
 * 台紙を1枚見せて、そこに**いま取った1つを押す**。残りの枠が空いた
 * まま見えるので、あと何個かが数えなくても分かる。
 *
 * 集めることを目的にしない
 * ------------------------
 * 憲章の「Game要素を学習より前面に出しすぎない」。だからここは、
 *
 *   - 点数を出さない（XP もクレジットもここには出さない）
 *   - 順位も連続日数も出さない
 *   - 押したあとに次の目標を煽らない（「あと2つ」は事実の提示まで）
 *
 * 出すのは**そのレッスンの中の位置**だけ。教材データから数えられる
 * ので、サーバーに聞かない——通信が失敗しても、覚えたこと自体は
 * 変わらない。
 *
 * 動きだけで伝えない
 * ------------------
 * 押される動きが主役だが、**動きを止めている人にも同じことが伝わる**
 * ように、枠には文字（技の名前）と状態（済み・これから）を置く。
 * 見出しの下の「1 / 3」も文字。動きが無くても台紙は完成する。
 */

import { useEffect, useState } from "react";

import { IconCheckCircle, IconSparkle } from "../Icons";
import { MoreSheet } from "./MoreSheet";
import { PrimaryButton } from "../aippo/PrimaryButton";
import { prefersReducedMotion } from "../../course/motion";
import { playSuccessSound } from "../../course/sound";

export interface SkillStampCardProps {
  /** そのレッスンで覚える技を、出てくる順に全部。 */
  skills: string[];
  /** いま押す1つ。`skills` の中の位置（0 始まり）。 */
  earnedIndex: number;
  /** 「Day 1」の 1。 */
  lessonNumber: number;
  /** 台紙を閉じて、次へ進む。 */
  onClose: () => void;
}

/** 押す動きの長さ。`animate-stamp-in`（tailwind.config.js）と同じにする。 */
const STAMP_MS = 900;

/** 紙の散り方。押した場所から外へ開く。 */
const SPREAD = [-40, -26, -14, -4, 6, 16, 28, 42];

export function SkillStampCard({
  skills,
  earnedIndex,
  lessonNumber,
  onClose,
}: SkillStampCardProps) {
  /*
    押す前を一度描いてから押す。

    最初から押した姿で描くと、animation の `both` があっても
    「もう押してあった」ように見える回がある（描き直しの間に
    合わないとき）。空の枠を1フレーム見せてから落とす。
  */
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    // 音は既定では鳴らない。設定で入れた人にだけ届く
    playSuccessSound("skill");

    if (prefersReducedMotion()) {
      setPressed(true);
      return;
    }
    const timer = window.setTimeout(() => setPressed(true), 60);
    return () => window.clearTimeout(timer);
  }, [earnedIndex]);

  const got = earnedIndex + 1;
  const left = skills.length - got;

  return (
    <MoreSheet
      placement="center"
      testId="skill-stamp-sheet"
      title={`Day ${lessonNumber} のAI技`}
      /*
        ×でも「つづける」でも、行き先は同じ。

        技はもう受け取っているので、ここで閉じても取り消しにはなら
        ない。閉じ方によって進んだり進まなかったりすると、押した先が
        読めなくなる。
      */
      onClose={onClose}
    >
      <div className="text-center" data-testid="skill-stamp-card">
        {/*
          数。**いちばん上に文字で置く。** 押される動きを見なくても、
          何個目なのかがここで分かる。
        */}
        <p className="text-sm font-bold text-brand-dark" data-testid="skill-stamp-count">
          {got} / {skills.length} GET
        </p>

        {/*
          台紙。枠を横に並べる。

          3つまでは横一列。4つ以上のレッスンが来たら折り返す
          （`flex-wrap`）——枠を縮めて詰めると、押された1つが小さく
          なって、いちばん見せたいものがいちばん小さくなる。
        */}
        <ul
          className={`mt-4 flex flex-wrap items-start justify-center gap-3
                      ${pressed && !prefersReducedMotion() ? "animate-stamp-bounce" : ""}`}
          role="list"
          data-testid="skill-stamp-slots"
        >
          {skills.map((skill, index) => {
            const done = index <= earnedIndex;
            const isNew = index === earnedIndex;

            return (
              <li
                key={skill}
                className="flex w-24 flex-col items-center gap-1.5"
                data-testid="skill-stamp-slot"
                data-state={isNew ? "new" : done ? "done" : "empty"}
              >
                <div className="relative flex h-20 w-20 items-center justify-center">
                  {/*
                    空の枠。**押されたあとも残す。**

                    枠が消えて印だけになると、台紙ではなく印の列に
                    見える。押していないところと同じ大きさの円が
                    そこにあり続けることで、揃っていく形が分かる。
                  */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full border-2 border-dashed border-brand-line"
                  />

                  {/* インクのにじみ。押した1つだけ、輪が1本広がって消える */}
                  {isNew && pressed && (
                    <span
                      aria-hidden="true"
                      data-testid="skill-stamp-ink"
                      className="animate-stamp-ink absolute inset-0 rounded-full bg-brand/25"
                    />
                  )}

                  {/*
                    紙吹雪。**押された枠の中に置く。**

                    前は台紙の側に置いて「上から何 px」で合わせていた
                    ——枠の位置は技の数で動くので、3つのときに合わせた
                    数が2つや4つでずれる。実際、見出しの真下から紙が
                    出ていた。枠と同じ箱に入れれば、動かしても付いてくる。
                  */}
                  {isNew && pressed && !prefersReducedMotion() && <Confetti />}

                  {done && (
                    <span
                      aria-hidden="true"
                      className={`relative flex h-[4.25rem] w-[4.25rem] items-center
                                  justify-center rounded-full bg-brand text-white
                                  shadow-cta ${
                                    isNew && pressed ? "animate-stamp-in" : ""
                                  } ${isNew && !pressed ? "opacity-0" : ""}`}
                    >
                      <IconCheckCircle className="h-8 w-8" />
                    </span>
                  )}
                </div>

                {/*
                  技の名前。**枠の下に必ず出す。**

                  印だけだと、どの技が入っているのか分からない。まだ
                  取っていない枠にも名前を出すのは、この日に何を覚える
                  のかが先に見えているほうが、集める形が分かるため。
                */}
                <p
                  className={`text-xs leading-5 ${
                    done ? "font-bold" : "text-ink-muted"
                  }`}
                >
                  {skill}
                </p>
              </li>
            );
          })}
        </ul>

        {/*
          あと何個か。**煽らない。** 事実だけを1行で置く。
          揃った日はねぎらいに変える——「あと0つ」とは言わない。
        */}
        <p className="mt-5 text-sm leading-6" data-testid="skill-stamp-note">
          {left > 0 ? (
            <>
              あと{left}つで Day {lessonNumber} コンプリート
            </>
          ) : (
            <span className="flex items-center justify-center gap-1.5 font-bold text-brand-dark">
              <IconSparkle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Day {lessonNumber} のAI技が全部そろいました
            </span>
          )}
        </p>

        <div className="mt-5">
          <PrimaryButton onClick={onClose} testId="skill-stamp-continue">
            つづける
          </PrimaryButton>
        </div>
      </div>
    </MoreSheet>
  );
}

/**
 * 押された枠から散る紙。
 *
 * **枠と同じ箱の中に置く。** 台紙の側に置いて「上から何 px」で合わせる
 * と、枠の位置が技の数で動いたときにずれる（3つに合わせた数が、2つや
 * 4つでは別の場所を指す）。中心は枠の中心そのものにする。
 */
function Confetti() {
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setAlive(false), STAMP_MS + 200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!alive) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="skill-stamp-confetti"
      /*
        枠より広く取る。紙は外へ開くので、枠の中だけだと隠れる。
        `overflow-hidden` は付けない——台紙の側がすでに切っている。
      */
      className="pointer-events-none absolute inset-0"
    >
      {SPREAD.map((offset, index) => (
        <span
          key={offset}
          className="animate-confetti absolute left-1/2 top-1/2 block h-1.5 w-1.5
                     rounded-[1px] bg-brand"
          style={{
            // 色は2色だけ。増やすと子ども向けの画面に見える
            backgroundColor: index % 3 === 0 ? "#F0B429" : undefined,
            // 印が落ちきってから散らす。同時だと、押した動きが紙に隠れる
            animationDelay: `${480 + index * 22}ms`,
            ["--confetti-x" as string]: `${offset}px`,
          }}
        />
      ))}
    </div>
  );
}
