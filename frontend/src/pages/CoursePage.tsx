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
import { CourseCard } from "../components/course/CourseCard";
import { LessonRow } from "../components/lessons/LessonRow";
import { CertificatePage } from "./CertificatePage";
import { PoAvatar } from "../po/PoAvatar";
import { useCertificates } from "../course/certificate";
import { lookupLesson, useCourse, useCourses } from "../course/live";
import { isComingSoon, startableLessons } from "../course/availability";
import { loadRecommendations } from "../course/recommend";
import { useCompletedLessons } from "../course/progress";
import { useBookmarks } from "../course/bookmarks";
import { searchLessons } from "../course/search";
import type { Lesson } from "../course/types";

export interface CoursePageProps {
  onSelectLesson: (lessonId: string) => void;
}


export function CoursePage({ onSelectLesson }: CoursePageProps) {
  const course = useCourse();
  /*
    いま学ぶコース以外。中身のあるものも近日公開のものも入りうるが、
    いまは近日公開しか無い（開けるコースは1つ）。
    開けるものが増えたら、押して入れるように onOpen を渡す。
  */
  const upcoming = useCourses().filter((entry) => entry.id !== course.id);
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

        </section>

        {/*
          これから増えるコース。

          「残りは順次公開します」という一文の代わりに置いた。
          その一文は、何がどれだけ増えるのかを何も言っていない。
          題と本数まで見えていれば、いま開けるものを選ぶときの
          手がかりになる（憲章 原則 I: 行き止まりを作らない）。

          中身が届いていないとき（同梱データで動いているとき）は
          何も出ない。無いものを作って見せない。
        */}
        {upcoming.length > 0 && (
          <section className="mt-8" aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading" className="section-title">
              これから増えるコース
            </h2>
            <p className="mt-1 text-xs leading-6 text-ink-muted">
              いま作っています。できたものから開いていきます。
            </p>

            <ul className="mt-3 space-y-3" role="list" data-testid="upcoming-courses">
              {upcoming.map((entry) => (
                <CourseCard
                  key={entry.id}
                  course={entry}
                  completedIds={completed}
                />
              ))}
            </ul>
          </section>
        )}

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
