/**
 * 教材一覧（下タブの「教材一覧」）。
 *
 * ホームが「今日どこから始めるか」を見せる場所なのに対し、
 * ここは全体を並べて見渡す場所。
 *
 * 並べ方は**縦一列の目次**にする。1件ずつを白い角丸カードで囲わない。
 * 9件を同じ形のカードで積むと、内容ではなく「カードの列」が目に入り、
 * どれも同じ重さに見える。番号・題・ねらい・時間を桁でそろえた行に
 * すれば、視線がまっすぐ下へ流れ、比べるのも探すのも速い。
 *
 * やめたもの
 * ----------
 * - 淡色の角丸四角＋線画アイコン（IconBadge lg） … 全件に付くと、
 *   絵のほうが題より強くなる
 * - 「おすすめ」pill … 最初にやる1本は、一覧の先頭に置いて
 *   「まずはここから」と書けば伝わる
 * - 「近日公開」の青い pill ＋ 錠前 … 押せないものほど静かに置く。
 *   薄い文字と opacity と cursor で伝える
 * - 「初級」pill … 全件が初級なので、1件ずつに書く意味が無い
 *
 * ここに出すのは**自分のこと**だけ。
 * 順位も、他の人との比較も出さない。
 * 比べさせると、遅い人ほど続かなくなる。
 */

import { useEffect, useState } from "react";

import { AppHeader } from "../components/AppShell";
import { CertificateEntry } from "../components/course/CertificateEntry";
import { IconBookmark, IconCheck } from "../components/Icons";
import { CertificatePage } from "./CertificatePage";
import { PoAvatar } from "../po/PoAvatar";
import { useCertificates } from "../course/certificate";
import { lookupLesson, useCourse } from "../course/live";
import {
  comingSoonNote,
  hasComingSoonDetail,
  isComingSoon,
  startableLessons,
} from "../course/availability";
import { loadRecommendations } from "../course/recommend";
import { useCompletedLessons } from "../course/progress";
import { useBookmarks } from "../course/bookmarks";
import { searchLessons } from "../course/search";
import type { Lesson } from "../course/types";

export interface CoursePageProps {
  onSelectLesson: (lessonId: string) => void;
}

/**
 * 一覧の1行。
 *
 * 左に2桁の番号、右に所要時間。あいだに題とねらい。
 * 番号を桁でそろえるのは飾りではなく、9件の順番を
 * 一目で追えるようにするため。
 */
function LessonRow({
  lesson,
  done,
  firstUp,
  bookmarked,
  onToggleBookmark,
  testIdPrefix,
  onSelect,
}: {
  lesson: Lesson;
  done: boolean;
  /** 最初にやる1本。先頭に置いたうえで、ここだけ短く添える。 */
  firstUp: boolean;
  bookmarked: boolean;
  /** 近日公開の教材では渡さない。始められないものは取っておけない。 */
  onToggleBookmark?: () => void;
  /**
   * 目印の一覧に出すときの前置き。
   *
   * 同じ教材が「あとで見る」と下の一覧の両方に出る。`data-testid` が
   * 二重になると、テストもE2Eも「どちらの行か」を指せなくなる。
   * 既存の id（`lesson-…`）は下の一覧のまま変えない。
   */
  testIdPrefix?: string;
  onSelect: () => void;
}) {
  const soon = isComingSoon(lesson);
  const prefix = testIdPrefix ?? "";

  const meta = [
    lesson.estimatedMinutes !== undefined ? `${lesson.estimatedMinutes}分` : null,
    lesson.usesAi ? null : "AIは使いません",
  ].filter((part): part is string => part !== null);

  return (
    /*
      目印のボタンは、行のボタンの**中**には置けない（button の入れ子は
      不正で、読み上げも押下も壊れる）。並べて置き、行のほうを伸ばす。
    */
    <li className="flex items-stretch">
      {/*
        近日公開の教材も一覧には出す。何が来るのか分かるほうが、
        いま1本しか無いことの説明にもなる。ただし押せなくする。
        押せることと見えることを、見た目でも読み上げでも分ける。
      */}
      <button
        type="button"
        onClick={onSelect}
        disabled={soon}
        aria-disabled={soon}
        data-testid={`${prefix}lesson-${lesson.id}`}
        data-availability={soon ? "coming_soon" : "available"}
        className={`row row-tap items-baseline disabled:cursor-not-allowed
                    ${soon ? "opacity-55" : ""}`}
      >
        <span
          aria-hidden="true"
          className="w-6 shrink-0 text-xs tabular-nums text-ink-muted"
        >
          {String(lesson.number).padStart(2, "0")}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 text-sm font-bold leading-6">
              {lesson.title}
            </span>
            {/* 状態を色だけで表さない。必ず文字か印を添える */}
            {done && (
              <IconCheck
                className="h-4 w-4 shrink-0 self-center text-brand"
                aria-label="おわった"
              />
            )}
          </span>

          <span className="mt-0.5 block text-xs leading-6 text-ink-muted">
            {lesson.goal}
          </span>

          {/*
            補足は1行にまとめる。1つずつ囲うと添え物が主役になる。

            中黒は要素のあいだにだけ入れる。頭に付けると
            「・AIは使いません」のように、何かが抜け落ちて見える
            （所要時間の無い診断で実際にそうなった）。
          */}
          <span className="mt-1 block text-xs text-ink-muted">
            {soon ? (
              hasComingSoonDetail(lesson) ? comingSoonNote(lesson) : "近日公開"
            ) : (
              <>
                {meta.join("・")}
                {firstUp && (
                  <span className="font-bold text-brand-dark">
                    {meta.length > 0 && "・"}まずはここから
                  </span>
                )}
                {/*
                  色だけで「付いている」を表さない。印の色が見えない人にも、
                  ここの文字で分かるようにする
                */}
                {bookmarked && <>{(meta.length > 0 || firstUp) && "・"}あとで見る</>}
              </>
            )}
          </span>
        </span>
      </button>

      {/*
        取っておく。始められる教材にだけ出す——近日公開のものを
        取っておけても、開ける日まで何も起きない。
      */}
      {onToggleBookmark && (
        <button
          type="button"
          onClick={onToggleBookmark}
          aria-pressed={bookmarked}
          aria-label={
            bookmarked ? `${lesson.title}をあとで見るから外す` : `${lesson.title}をあとで見る`
          }
          data-testid={`${prefix}bookmark-${lesson.id}`}
          className="row-tap flex shrink-0 items-center border-b border-line px-2
                     text-ink-muted aria-pressed:text-brand"
        >
          <IconBookmark className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

export function CoursePage({ onSelectLesson }: CoursePageProps) {
  const course = useCourse();
  const completed = useCompletedLessons();
  const bookmarks = useBookmarks();
  const certificates = useCertificates();
  const [recommended, setRecommended] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  // 修了証は下位画面として開く。設定と同じで、1画面には1つの目的だけ置く
  const [showingCertificates, setShowingCertificates] = useState(false);

  useEffect(() => {
    setRecommended(loadRecommendations());
  }, []);

  if (showingCertificates) {
    return (
      <CertificatePage
        certificates={certificates}
        onBack={() => setShowingCertificates(false)}
      />
    );
  }

  // 進捗の分母は「始められる教材」だけ。近日公開を混ぜると
  // 始めようのないもので割ることになり、いつまでも終わらない
  const startable = startableLessons(course.lessons);

  /*
    「まずはここから」を付ける1本。

    診断のおすすめのうち、まだ終わっていないもの。無ければ
    始められる教材の最初。付けるのは1本だけ——複数に付けると、
    どれから始めればよいかが結局分からない。
  */
  const firstUpId =
    startable.find(
      (lesson) => recommended.includes(lesson.id) && !completed.includes(lesson.id),
    )?.id ?? startable.find((lesson) => !completed.includes(lesson.id))?.id;

  // 探している最中は、絞り込んだものだけを並べる。
  // 空のときは全件（＝いつもの目次）に戻る
  const found = searchLessons(course.lessons, query);

  // 目印の付いた教材。id の並び順ではなく、一覧と同じ順に出す——
  // 上下2か所で順番が違うと、同じものを探し直すことになる
  const savedLessons = course.lessons.filter((lesson) => bookmarks.has(lesson.id));

  const skills = completed
    .map((id) => lookupLesson(id))
    .filter((lesson): lesson is Lesson => lesson !== null)
    .flatMap((lesson) => lesson.outcomes);

  return (
    <>
      <AppHeader />

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
        <h1 className="text-xl font-bold">{course.title}</h1>
        <p className="mt-1.5 text-sm leading-7 text-ink-muted">{course.description}</p>

        {/*
          できるようになったこと。

          以前は白いカードの中に丸いチップを並べていた。ここは
          押せないので、チップにする理由が無い。中黒でつないだ
          1本の文にすれば、読むだけで済む。
        */}
        {skills.length > 0 && (
          <section className="mt-5 border-l-2 border-brand pl-3" aria-labelledby="skills-heading">
            <h2 id="skills-heading" className="section-title">
              できるようになったこと
            </h2>
            <p className="mt-1 text-sm leading-7 text-ink-muted">
              {[...new Set(skills)].join("・")}
            </p>
          </section>
        )}

        {/*
          あとで見るに入れたもの。

          付けられるだけで、まとめて見る場所が無いと目印の意味が無い
          （一覧を上から探し直すことになる）。1件も無いときは
          見出しごと出さない——空の枠は、機能が壊れているように見える。

          探している最中は隠す。絞り込んだ結果の下に別の一覧が続くと、
          どちらが検索結果なのか分からなくなる。
        */}
        {query.trim() === "" && savedLessons.length > 0 && (
          <section className="mt-7" aria-labelledby="saved-heading">
            <h2 id="saved-heading" className="section-title">
              あとで見る
            </h2>
            <ul className="mt-2" role="list">
              {savedLessons.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  done={completed.includes(lesson.id)}
                  firstUp={false}
                  bookmarked
                  onToggleBookmark={() => bookmarks.toggle(lesson.id)}
                  testIdPrefix="saved-"
                  onSelect={() => onSelectLesson(lesson.id)}
                />
              ))}
            </ul>
          </section>
        )}

        {/* 1枚も無ければ、この行ごと出ない */}
        <CertificateEntry
          count={certificates.length}
          onOpen={() => setShowingCertificates(true)}
        />

        <section className="mt-7" aria-labelledby="lessons-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="lessons-heading" className="section-title">
              レッスン
            </h2>
            <span className="text-xs text-ink-muted">
              いま {startable.length} / {course.lessons.length} 本
            </span>
          </div>

          {/*
            探す口。

            9件しか無いので目次でも足りるが、「請求書」「議事録」のように
            **やりたいことの言葉**で来る人は、題（「文章を書き直す」）と
            自分の言葉が一致せず、合う1本にたどり着けない。
            タグまで含めて当てる（search.ts）。

            虫めがねのアイコンは付けない。入力欄そのものが探す場所だと
            分かるので、絵を足しても意味が増えない。
          */}
          <div className="mt-2">
            <label htmlFor="lesson-search" className="sr-only">
              レッスンを探す
            </label>
            <input
              id="lesson-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="やりたいことで探す（例: メール、要約）"
              data-testid="lesson-search"
              className="w-full border-b border-line bg-transparent px-1 py-2 text-sm
                         placeholder:text-ink-muted focus:border-brand focus:outline-none"
            />
          </div>

          {/*
            見つからなかったときに、黙って空にしない。
            打ち間違いなのか、そもそも無いのかが分からなくなる。
          */}
          {found.length === 0 ? (
            /*
              0件のときは、下に一覧が無い。

              以前ここに「下の一覧から選んでください」と書いていたが、
              絞り込みで消えているので**下には何も無い**。できないことを
              指示していた。行き止まりで指示だけ残るのが、いちばんよくない。

              代わりに、その場で戻せる口を置く。
            */
            <div className="mt-4" role="status">
              <p className="text-sm leading-7 text-ink-muted">
                「{query}」に当てはまる教材はありませんでした。
                <br />
                別の言い方でも探せます。
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                data-testid="lesson-search-clear"
                className="-my-2 mt-1 py-2 text-sm font-bold text-brand
                           transition hover:text-brand-dark"
              >
                すべての教材を見る
              </button>
            </div>
          ) : (
            <ul className="mt-2" role="list">
              {found.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  done={completed.includes(lesson.id)}
                  firstUp={lesson.id === firstUpId}
                  bookmarked={bookmarks.has(lesson.id)}
                  onToggleBookmark={
                    isComingSoon(lesson) ? undefined : () => bookmarks.toggle(lesson.id)
                  }
                  onSelect={() => onSelectLesson(lesson.id)}
                />
              ))}
            </ul>
          )}

          {query.trim() === "" && (
            <p className="mt-3 text-xs leading-6 text-ink-muted">
              残りは順次公開します。
            </p>
          )}
        </section>

        <div className="mt-8">
          <PoAvatar
            po={{
              message:
                completed.length === 0
                  ? "まずは診断から。3つ答えるだけで、合いそうなものが分かります。"
                  : "続けていますね。1日ひとつで十分です。",
              emotion: completed.length === 0 ? "question" : "celebrate",
              action: "wait",
            }}
            compact
          />
        </div>
      </main>
    </>
  );
}
