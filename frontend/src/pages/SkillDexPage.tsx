/**
 * AI技図鑑。**いま自分に何ができるか**を並べる場所。
 *
 * 学習記録が「何を学んだか」なのに対して、ここは「何ができるか」。
 * 終えた本数は積み上がっても、できることが増えた実感は別に要る。
 *
 * まだ取っていない技も出す
 * ------------------------
 * ただし「どの教材で取れるか」が書けるものだけ。行き先の無い枠を
 * 並べると、押しても何も無い項目になる（サーバー側でも同じ判断を
 * している——`AiSkillLesson` の無い技は返ってこない）。
 *
 * 数を人と比べさせない
 * --------------------
 * 順位も、他の人の数も、平均も出さない。サーバーがそもそも返さない。
 * 出るのは自分の「3 / 12」と、次の呼び名まであといくつか、だけ。
 *
 * 組み合わせ（コンボ）
 * --------------------
 * 技そのものの名前は一般用語のまま置いておき、組み合わせにだけ
 * 呼び名を付ける。名前を置き換えると、外で通じる言葉を覚えられない。
 */

import { useCallback, useEffect, useState } from "react";

import { fetchSkillDex, type Skill, type SkillDex } from "../api/skills";
import { AppHeader } from "../components/AppShell";
import { IconCheck, IconSparkle, IconStar } from "../components/Icons";

export interface SkillDexPageProps {
  /** 「この教材で習得できます」から、そのまま入れるようにする。 */
  onSelectLesson: (lessonId: string) => void;
  /** 何も取れていない人の行き先。 */
  onOpenCourse: () => void;
}

/**
 * 学んだ量と、いまの呼び名。
 *
 * 帯は「次まであといくつ」を出すためだけに置く。満たすことが目的に
 * ならないよう、数字は小さく、色は1色にとどめる。
 */
export function XpBar({
  total,
  level,
  nextLevel,
  toNext,
}: {
  total: number;
  level: string;
  nextLevel: string | null;
  toNext: number | null;
}) {
  /*
    帯の割合は「次の呼び名までの区間」で出す。総量に対する割合にすると、
    上へ行くほど帯が動かなくなり、進んでいないように見える。
  */
  const span = toNext === null ? 0 : toNext + 1;
  const filled = toNext === null ? 100 : Math.round(((span - toNext) / span) * 100);

  return (
    <section
      className="rounded-panel border border-line bg-surface p-4 shadow-card"
      aria-labelledby="xp-heading"
      data-testid="xp-bar"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="xp-heading" className="text-base font-bold">
          {level}
        </h2>
        <span className="shrink-0 text-xs tabular-nums text-ink-muted">
          {total} XP
        </span>
      </div>

      {nextLevel !== null && toNext !== null ? (
        <>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas"
            role="presentation"
          >
            <div
              className="h-full rounded-full bg-brand transition-[width]"
              style={{ width: `${filled}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs leading-6 text-ink-muted">
            あと{toNext} で「{nextLevel}」になります。
          </p>
        </>
      ) : (
        <p className="mt-1.5 text-xs leading-6 text-ink-muted">
          いちばん上の呼び名です。ここから先は、作ったもので見せていきましょう。
        </p>
      )}
    </section>
  );
}

/** 技1つぶん。取っていないものは、どこで取れるかを書く。 */
function SkillCard({
  skill,
  onSelectLesson,
}: {
  skill: Skill;
  onSelectLesson: (lessonId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li data-testid={`skill-${skill.slug}`}>
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        data-testid={`skill-toggle-${skill.slug}`}
        className="row row-tap items-start"
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center
                      rounded-card ${
                        skill.acquired
                          ? "bg-brand-soft text-brand"
                          : "bg-canvas text-ink-muted"
                      }`}
        >
          {skill.acquired ? (
            <IconCheck className="h-4 w-4" />
          ) : (
            <IconStar className="h-4 w-4" />
          )}
        </span>

        <span className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-bold leading-6">
            {skill.name}
            {!skill.acquired && (
              <span className="ml-2 text-xs font-normal text-ink-muted">
                （まだ）
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
            {skill.one_line}
          </span>
        </span>
      </button>

      {open && (
        <div className="px-3 pb-4 text-sm leading-7" data-testid={`skill-detail-${skill.slug}`}>
          {skill.description && <p>{skill.description}</p>}

          {/* 実例。読むだけでは使えるようにならないので、そのまま真似できる形で置く */}
          {skill.example && (
            <p className="mt-2 rounded-card bg-brand-soft/40 px-3 py-2 text-xs leading-6">
              例：{skill.example}
            </p>
          )}

          {/*
            どこで取れるか。取ったあとも出しておく——
            もう一度やり直したい人の行き先になる。
          */}
          {skill.lessons.map((lesson) => (
            <button
              key={lesson.slug}
              type="button"
              onClick={() => onSelectLesson(lesson.slug)}
              data-testid={`skill-lesson-${skill.slug}-${lesson.slug}`}
              className="mt-2 block text-xs text-brand-dark underline"
            >
              {skill.acquired ? "もう一度やる" : "習得する"}：{lesson.title}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

export function SkillDexPage({ onSelectLesson, onOpenCourse }: SkillDexPageProps) {
  const [dex, setDex] = useState<SkillDex | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setDex(await fetchSkillDex(signal));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <>
      <AppHeader />

      <main className="page">
        <h1 className="text-xl font-bold">AI技</h1>
        <p className="mt-1.5 text-sm leading-7 text-ink-muted">
          いま自分にできることの一覧です。名前はどれも一般的な言葉なので、
          そのまま調べて続きを読めます。
        </p>

        {failed && (
          <div
            role="alert"
            data-testid="skills-error"
            className="mt-5 rounded-card bg-caution-soft px-4 py-3 text-sm leading-6 text-caution"
          >
            <p>読み込めませんでした。通信を確かめて、もう一度お試しください。</p>
            <button
              type="button"
              onClick={() => void load()}
              data-testid="skills-retry"
              className="mt-2 min-h-[2.75rem] rounded-cta border border-caution/40 px-5
                         py-2 text-sm font-bold text-caution transition hover:bg-caution/10"
            >
              もう一度読み込む
            </button>
          </div>
        )}

        {dex === null && !failed && (
          <p className="mt-5 text-sm text-ink-muted">読み込んでいます…</p>
        )}

        {dex && (
          <>
            <div className="mt-5">
              <XpBar
                total={dex.xp.total}
                level={dex.xp.level}
                nextLevel={dex.xp.next_level}
                toNext={dex.xp.to_next}
              />
            </div>

            <section className="mt-7" aria-labelledby="skills-heading">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="skills-heading" className="section-title">
                  覚えた技
                </h2>
                <span
                  className="shrink-0 text-xs tabular-nums text-ink-muted"
                  data-testid="skill-count"
                >
                  {dex.acquired_count} / {dex.total_count}
                </span>
              </div>

              {dex.acquired_count === 0 && (
                /*
                  空でも行き止まりにしない（憲章 原則 I）。
                  ここは1本目を終える**前**に開かれる画面でもある。
                */
                <div
                  className="mt-3 rounded-panel border border-line bg-surface p-6 text-center
                             shadow-card"
                  data-testid="skills-empty"
                >
                  <span
                    aria-hidden="true"
                    className="mx-auto flex h-12 w-12 items-center justify-center
                               rounded-full bg-brand-soft text-brand"
                  >
                    <IconSparkle className="h-6 w-6" />
                  </span>
                  <p className="mt-3 text-sm font-bold">まだ1つも覚えていません</p>
                  <p className="mt-1 text-xs leading-6 text-ink-muted">
                    レッスンを1本終えるたびに、そこで使った技がここに増えます。
                  </p>
                  <button
                    type="button"
                    onClick={onOpenCourse}
                    data-testid="skills-empty-start"
                    className="mt-4 min-h-[2.75rem] rounded-cta bg-brand px-6 py-2 text-sm
                               font-bold text-white shadow-cta transition
                               hover:brightness-110 active:scale-[0.98]"
                  >
                    レッスンを始める
                  </button>
                </div>
              )}

              <ul className="mt-2" role="list" data-testid="skill-list">
                {dex.skills.map((skill) => (
                  <SkillCard
                    key={skill.slug}
                    skill={skill}
                    onSelectLesson={onSelectLesson}
                  />
                ))}
              </ul>
            </section>

            {/* ── 組み合わせ ── */}
            {dex.combos.length > 0 && (
              <section className="mt-7" aria-labelledby="combos-heading">
                <h2 id="combos-heading" className="section-title">
                  組み合わせ
                </h2>
                <p className="mt-1 text-xs leading-6 text-ink-muted">
                  2つ揃うと、できることが1つ増えます。
                </p>

                <ul className="mt-2 space-y-2" role="list" data-testid="combo-list">
                  {dex.combos.map((combo) => (
                    <li
                      key={combo.name}
                      data-testid={`combo-${combo.skills.join("-")}`}
                      className={`rounded-card border px-4 py-3 ${
                        combo.complete
                          ? "border-brand-line bg-brand-soft/40"
                          : "border-line"
                      }`}
                    >
                      <p className="flex items-center gap-2 text-sm font-bold">
                        {combo.complete && (
                          <IconCheck className="h-4 w-4 shrink-0 text-brand" />
                        )}
                        {combo.name}
                        {!combo.complete && (
                          <span className="text-xs font-normal text-ink-muted">
                            （まだ）
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs leading-6 text-ink-muted">
                        {combo.one_line}
                      </p>
                      {/*
                        組み合わせに使う技は、**一般用語のまま**出す。
                        呼び名で置き換えると、外で通じる言葉を覚えられない。
                      */}
                      <p className="mt-1 text-xs text-ink-muted">
                        {combo.skills
                          .map(
                            (slug) =>
                              dex.skills.find((skill) => skill.slug === slug)?.name ??
                              slug,
                          )
                          .join(" ＋ ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
