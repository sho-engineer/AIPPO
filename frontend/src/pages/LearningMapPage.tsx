/**
 * 学習マップ——**いまどこに居て、次に何をすれば上がるか**を1本の縦道で。
 *
 * なぜ縦なのか
 * ------------
 * 画面は片手の iPhone。横に並べると、5段のうち2段しか入らないか、
 * 全部を縮めて字が読めなくなる。縦なら、指を動かした方向がそのまま
 * 「先へ進む」になる。
 *
 * 何を出さないか
 * --------------
 * 順位も、他の人が何段目かも、平均も出さない——サーバーがそもそも
 * 返さない。出るのは自分の道だけ。
 *
 * 「このレッスンをやれば必ず上がる」とは書かない
 * ----------------------------------------------
 * 上がる条件は2つあって、どちらも要る（技がそろう・昇段の実践問題を
 * 通る）。レッスン1本の先に Level Up を約束すると、終えた人が上がら
 * ない理由を探すことになる。ここが言うのは**あと何がそろっていないか**
 * だけ。
 *
 * 取っていない技を、取ったことにしない
 * ------------------------------------
 * 診断で Lv.3 から始めた人の Lv.1・Lv.2 は「通り過ぎた段」として出す。
 * ただし中の技は未取得のまま——「あとで身につける」と書いておく。
 * 通り過ぎた印と習得済みを混ぜると、使えるか分からない技が並ぶ。
 *
 * 段の数を、ここで決めない
 * ------------------------
 * 段も要件もサーバーから来る（`api/progression.ts`）。画面は届いた
 * 配列を上から並べるだけなので、段を足しても技を入れ替えてもここは
 * 直さずに済む。
 */

import { useCallback, useEffect, useState } from "react";

import { fetchLevelMap, type LevelMap, type MapLevel, type MapSkill } from "../api/progression";
import { AppHeader } from "../components/AppShell";
import {
  IconCheck,
  IconChevronRight,
  IconLock,
  IconMedal,
} from "../components/Icons";
import { lookupLesson } from "../course/live";
import { EVENTS, track } from "../lib/analytics";

export interface LearningMapPageProps {
  /** 足りない技のレッスンへ、そのまま入れるようにする。 */
  onSelectLesson: (lessonId: string) => void;
}

/**
 * 段の頭に置く丸。**状態を形と字の両方で言う。**
 *
 * 色だけで区別すると、色が見分けにくい人には全部同じに見える。
 * 済みは check、いまここは番号を塗り、先は番号を薄く。
 */
function LevelMark({ level }: { level: MapLevel }) {
  const base =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold tabular-nums";

  if (level.status === "done") {
    return (
      <span className={`${base} bg-brand text-white`} aria-hidden="true">
        <IconCheck className="h-5 w-5" />
      </span>
    );
  }
  if (level.status === "current") {
    return (
      <span
        className={`${base} bg-brand text-white ring-4 ring-brand-soft`}
        aria-hidden="true"
      >
        {level.number}
      </span>
    );
  }
  return (
    <span
      className={`${base} border border-line bg-surface text-ink-muted`}
      aria-hidden="true"
    >
      {level.number}
    </span>
  );
}

/**
 * 技ひとつ。取っていなければ、取れるレッスンへの行き先を必ず添える。
 *
 * 行き先の無い項目を並べない——押しても何も無い項目は、「自分には
 * まだ早い」ではなく「壊れている」と読まれる。
 */
function SkillNode({
  skill,
  reachable,
  onSelectLesson,
}: {
  skill: MapSkill;
  /** いま手を付けられる段か。先の段なら鍵を出す */
  reachable: boolean;
  onSelectLesson: (lessonId: string) => void;
}) {
  const earned = skill.status === "earned";
  const lessonId = skill.lessons[0];
  const lesson = lessonId ? lookupLesson(lessonId) : null;

  const mark = earned ? (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white"
      aria-hidden="true"
    >
      <IconCheck className="h-3.5 w-3.5" />
    </span>
  ) : reachable ? (
    /* ○ …… これから。押せる先がある */
    <span
      className="h-6 w-6 shrink-0 rounded-full border-2 border-brand-line bg-surface"
      aria-hidden="true"
    />
  ) : (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                 border border-line bg-canvas text-ink-muted"
      aria-hidden="true"
    >
      <IconLock className="h-3 w-3" />
    </span>
  );

  const body = (
    <>
      {mark}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{skill.name}</span>
        <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
          {skill.one_line}
        </span>
        {!earned &&
          (lesson ? (
            <span className="mt-1 block text-xs font-bold text-brand">
              {lesson.title}
            </span>
          ) : (
            /*
              技はあるが、それを教える教材がまだ無い。**黙って空欄に
              しない**——押せる見た目でも押せない見た目でもない項目が
              並ぶと、壊れているように読まれる。
            */
            <span className="mt-1 block text-xs text-ink-muted">
              レッスンを準備中です
            </span>
          ))}
      </span>
    </>
  );

  const state = earned ? "earned" : reachable ? "open" : "locked";

  /*
    押せるのは、**まだ取っていなくて・行き先があって・いま手を
    付けられる段**のときだけ。

    取ってあるものを押せるようにしない（同じレッスンをもう一度案内
    することになる）。先の段のものも押せるようにしない——鍵を出して
    おいて押せるのは、どちらの意味も伝わらない。道順としては先だが、
    その教材が見たいだけならコース一覧から開ける。行き止まりにはならない。
  */
  if (!earned && lesson && reachable) {
    return (
      <li>
        <button
          type="button"
          data-testid={`map-skill-${skill.slug}`}
          data-state={state}
          onClick={() => onSelectLesson(lesson.id)}
          className="flex min-h-[2.75rem] w-full items-start gap-3 rounded-card
                     px-2 py-2.5 text-left transition hover:bg-brand-soft/40
                     active:scale-[0.99]"
        >
          {body}
          <IconChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-muted" />
        </button>
      </li>
    );
  }

  return (
    <li
      data-testid={`map-skill-${skill.slug}`}
      data-state={state}
      className="flex items-start gap-3 px-2 py-2.5"
    >
      {body}
    </li>
  );
}

/**
 * 昇段の実践問題。段の終わりに置く。
 *
 * **「Fail」とは書かない。** 受けられないときも、足りない数を言う
 * だけにする——落ちた・できなかった、と読める言葉を置かない。
 *
 * まだ画面が無いので、ここは押せない（Phase 4）。押せない代わりに、
 * **何をすれば開くか**を字で言う。押せるのに何も起きないより、
 * 押せないと分かるほうがよい。
 */
function ChallengeNode({ level }: { level: MapLevel }) {
  /*
    もう通り過ぎた段では、**残りの数を言わない。**

    診断で飛ばした段は、技が未取得のまま通り過ぎている。そこへ
    「技があと2つ」と出すと、済んだはずの段にまだ宿題が残っている
    ように読める——技の一覧のほうが、取っていないことは言っている。
  */
  const label =
    level.status === "done"
      ? "通過ずみ"
      : !level.has_challenge
        ? "準備中"
        : level.challenge_open
          ? "挑戦できます"
          : level.remaining > 0
            ? `技があと${level.remaining}つ`
            : "この段まで進むと開きます";

  return (
    <div
      data-testid={`map-challenge-${level.number}`}
      data-open={level.challenge_open}
      className={`mt-2 flex items-center gap-3 rounded-card border px-3 py-3 ${
        level.challenge_open
          ? "border-brand-line bg-brand-soft/50"
          : "border-line bg-canvas"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          level.challenge_open ? "bg-brand text-white" : "bg-surface text-ink-muted"
        }`}
        aria-hidden="true"
      >
        <IconMedal className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">Lv.{level.number} への挑戦</span>
        <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
          {level.has_challenge
            ? "覚えた技をまとめて1回使います。何度でも受けられます。"
            : "この段の実践問題は、いま作っています。"}
        </span>
      </span>
      <span className="shrink-0 text-xs font-bold text-ink-muted">{label}</span>
    </div>
  );
}

/** 道の1区画。 */
function LevelSection({
  level,
  current,
  onSelectLesson,
  last,
}: {
  level: MapLevel;
  current: number;
  onSelectLesson: (lessonId: string) => void;
  last: boolean;
}) {
  /*
    手を付けられるのは、**いまの段と、すぐ次の段**まで。先の段の技を
    先に取れてしまうと、途中を飛ばして上がれる（サーバー側も同じ線で
    見ている——`challenge_open`）。
  */
  const reachable = level.number <= current + 1;

  return (
    <li data-testid={`map-level-${level.number}`} data-status={level.status}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center self-stretch">
          <LevelMark level={level} />
          {/* 次の段へ続く線。いちばん下には引かない */}
          {!last && (
            <span
              aria-hidden="true"
              className={`mt-1 w-0.5 flex-1 rounded-full ${
                level.status === "locked" ? "bg-line" : "bg-brand-line"
              }`}
            />
          )}
        </div>

        <div className="min-w-0 flex-1 pb-6">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-base font-bold">
              Lv.{level.number} {level.name}
            </h2>
            {level.status === "current" && (
              <span
                data-testid={`map-here-${level.number}`}
                className="rounded-full bg-brand px-2 py-0.5 text-[0.6875rem] font-bold text-white"
              >
                いまここ
              </span>
            )}
            {level.skipped && (
              /*
                診断で飛ばした段。**「習得済み」とは書かない。**
                技はまだ取っていないので、あとで戻ってこられると言う。
              */
              <span
                data-testid={`map-skipped-${level.number}`}
                className="rounded-full bg-canvas px-2 py-0.5 text-[0.6875rem] text-ink-muted"
              >
                診断で通過
              </span>
            )}
          </div>

          <p className="mt-1 text-xs leading-6 text-ink-muted">{level.description}</p>

          {level.skills.length > 0 && (
            <ul className="mt-2" role="list">
              {level.skills.map((skill) => (
                <SkillNode
                  key={skill.slug}
                  skill={skill}
                  reachable={reachable}
                  onSelectLesson={onSelectLesson}
                />
              ))}
            </ul>
          )}

          {/*
            Lv.1 は始まりの段。ここへ「上がる」ことは無いので、要る技も
            実践問題も無い——そういう段には、この欄ごと出さない。

            `has_challenge` も見るのは、**要件をまだ決めていない段に
            問題だけ先に置いた**ときに、それが消えないようにするため。
          */}
          {(level.skills.length > 0 || level.has_challenge) && (
            <ChallengeNode level={level} />
          )}
        </div>
      </div>
    </li>
  );
}

export function LearningMapPage({ onSelectLesson }: LearningMapPageProps) {
  const [map, setMap] = useState<LevelMap | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setFailed(false);
    try {
      setMap(await fetchLevelMap(signal));
    } catch {
      if (!signal?.aborted) setFailed(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => track(EVENTS.learningMapOpened), []);

  return (
    <>
      <AppHeader />

      <main className="page">
        <h1 className="text-xl font-bold">学習マップ</h1>
        <p className="mt-1.5 text-sm leading-7 text-ink-muted">
          いまいる段と、次の段に必要な技です。上がるには、技をそろえることと、
          昇段の挑戦を通ることの両方が要ります。
        </p>

        {failed && (
          <div
            role="alert"
            data-testid="map-error"
            className="mt-5 rounded-card bg-caution-soft px-4 py-3 text-sm leading-6 text-caution"
          >
            <p>読み込めませんでした。通信を確かめて、もう一度お試しください。</p>
            <button
              type="button"
              onClick={() => void load()}
              data-testid="map-retry"
              className="mt-2 min-h-[2.75rem] rounded-cta border border-caution/40 px-5
                         py-2 text-sm font-bold text-caution transition hover:bg-caution/10"
            >
              もう一度読み込む
            </button>
          </div>
        )}

        {map === null && !failed && (
          <p className="mt-5 text-sm text-ink-muted">読み込んでいます…</p>
        )}

        {map && (
          <>
            {/*
              次の段の1行。**上の地図と同じ数を出す**——「あと2つ」と
              「あと1つ」が同じ画面に並ぶのがいちばん困るので、どちらも
              サーバーが出した `remaining` をそのまま使う。
            */}
            {map.next && (
              <p
                data-testid="map-next-line"
                className="mt-4 rounded-card border border-brand-line bg-brand-soft/40
                           px-4 py-3 text-sm leading-6"
              >
                次は <strong>Lv.{map.next.number} {map.next.name}</strong>。
                {map.next.remaining > 0
                  ? `必要な技があと${map.next.remaining}つです。`
                  : "必要な技はそろいました。"}
              </p>
            )}

            <ul className="mt-5" role="list" data-testid="map-levels">
              {map.levels.map((level, at) => (
                <LevelSection
                  key={level.number}
                  level={level}
                  current={map.current_level}
                  onSelectLesson={onSelectLesson}
                  last={at === map.levels.length - 1}
                />
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
