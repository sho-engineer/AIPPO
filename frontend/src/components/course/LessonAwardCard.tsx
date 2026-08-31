/**
 * 終えたときに増えた分（XP と AI技）。
 *
 * 完了画面の並びは **祝う → XP → AI技 → 成果物**。数の前に祝いを置き、
 * 数のあとに持ち帰れるものを置く。数字で終わらせない。
 *
 * 増えた分はサーバーが決める
 * --------------------------
 * 技もXPも節目も、判定はサーバー側（設計方針 §36）。画面で数えると
 * 必ず食い違う。返ってきた分をそのまま出し、**やり直しで何も増えて
 * いない回は、この節ごと出さない**——「+0 XP」は祝いにならない。
 *
 * 動きを止めている人にも意味が残る
 * --------------------------------
 * 出るときに小さく跳ねるが、跳ねは飾り。数も名前も文字で出ているので、
 * `prefers-reduced-motion` で止まっても読めるものは変わらない
 * （止めるのは index.css で一括）。
 *
 * 音は上乗せ
 * ----------
 * 既定は切。入れた人にだけ、技を覚えた回に短い音が1度鳴る。
 * 鳴らなくても、できたことは文字で分かる。
 */

import { useEffect } from "react";

import type { LessonAward } from "../../api/lesson";
import type { Skill } from "../../api/skills";
import { Card } from "../AppShell";
import { IconSparkle, IconStar } from "../Icons";
import { playSuccessSound } from "../../course/sound";

export interface LessonAwardCardProps {
  award: LessonAward | null;
  /** 技の表示名を引くための一覧。読めていなければ slug のまま出す。 */
  skills?: Skill[];
}

export function LessonAwardCard({ award, skills = [] }: LessonAwardCardProps) {
  const gainedSkills = award?.skills ?? [];
  const gainedXp = award?.xp ?? 0;
  const something = gainedXp > 0 || gainedSkills.length > 0;

  /*
    技を覚えた回だけ鳴らす。

    レッスンの完了そのものは、1歩進むたびの音が既に鳴っている。
    ここで毎回もう1度鳴らすと、終わりの合図が2つになる。
  */
  useEffect(() => {
    if (gainedSkills.length > 0) playSuccessSound("skill");
  }, [gainedSkills.length]);

  // 何も増えていない回（やり直し）では、この節ごと出さない
  if (!something) return null;

  return (
    <Card testId="lesson-award">
      {gainedXp > 0 && (
        <p className="flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card
                       bg-brand-soft text-brand"
          >
            <IconStar className="h-4 w-4" />
          </span>
          <span className="animate-pop-in text-lg font-bold tabular-nums text-brand-dark">
            +{gainedXp} XP
          </span>
        </p>
      )}

      {gainedSkills.length > 0 && (
        <div className={gainedXp > 0 ? "mt-4 border-t border-line pt-4" : ""}>
          <p className="text-xs font-bold text-brand">新しく覚えたAI技</p>
          <ul className="mt-2 space-y-2" role="list" data-testid="award-skills">
            {gainedSkills.map((slug, index) => {
              const found = skills.find((skill) => skill.slug === slug);
              return (
                <li
                  key={slug}
                  className="flex animate-pop-in items-start gap-2.5"
                  /* 1つずつ現れる。同時に出ると、数が多いほど雑に見える */
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center
                               rounded-card bg-brand-soft text-brand"
                  >
                    <IconSparkle className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-6">
                      {found?.name ?? slug}
                    </span>
                    {found?.one_line && (
                      <span className="block text-xs leading-6 text-ink-muted">
                        {found.one_line}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
