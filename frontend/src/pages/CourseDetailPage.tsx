/**
 * コースの中身（コース一覧 → ここ → レッスン、の真ん中）。
 *
 * この画面が答えるのは、**3つだけ**。
 *
 *     いまどこ / 次はこれ / あとこれだけ
 *
 * 見た瞬間にそれが分かることが、ここの唯一の役目。
 * 説明する場所ではない。
 *
 * どこへ移したか
 * --------------
 * 前はこの1枚に、進み具合・できるようになったこと・あとで見る・
 * 修了証・検索・道のり・レシピ6枚が縦に積まれていた。読み下さないと
 * 「次はどれか」に辿り着けない。**消したのではなく、持ち主のところへ
 * 戻した。**
 *
 *   1本ずつの Goal / 完成イメージ / 覚えるAI技 / 使いどころ
 *       → レッスンを開いた最初の画面（components/course/steps/Outcome.tsx）
 *   できるようになったこと（覚えた技の一覧）
 *       → AI技図鑑（pages/SkillDexPage.tsx）
 *   作ったもの
 *       → マイ成果物（pages/WorksPage.tsx）
 *   あとで見る・修了証
 *       → その専用の画面（設定から入れる）
 *
 * 順番を守る
 * ----------
 * 上から 次に学ぶ1本 → 進み具合 → 道のり → できるようになること、
 * の順で置く。スタンプと Credit は下。集める楽しさは残すが、
 * **コースの主役にはしない。**
 *
 * 探すのは下
 * ----------
 * 「請求書」「議事録」のような自分の言葉で来る人には検索が要る。
 * ただしそれは *探す* 道具で、この画面の主題ではない。道のりの下に置く。
 *
 * ここに出すのは自分のことだけ。順位も、他の人との比較も出さない。
 */

import { useEffect, useMemo, useState } from "react";

import { AppHeader } from "../components/AppShell";
import { CourseOutcome } from "../components/course/CourseOutcome";
import { CourseOutline } from "../components/course/CourseOutline";
import { CourseProgressLine } from "../components/course/CourseProgressLine";
import { CourseResume } from "../components/course/CourseResume";
import { LessonDiscoveryCard } from "../components/lessons/LessonDiscoveryCard";
import { PathProgress } from "../components/course/PathProgress";
import { PoAvatar } from "../po/PoAvatar";
import { courseOutline, nextLesson } from "../course/outline";
import { courseImage } from "../course/teachingImages";
import { TeachingImage } from "../components/lessons/TeachingImage";
import { loadRecommendations } from "../course/recommend";
import { useCompletedLessons, useXpSummary } from "../course/progress";
import { useLearningPath } from "../course/learningPath";
import { useBookmarks } from "../course/bookmarks";
import { useKeeping } from "../course/keeping";
import {
  filterLessonsByCategory,
  LESSON_CATEGORIES,
  searchLessons,
  type LessonCategoryId,
} from "../course/search";
import type { Course } from "../course/types";

export interface CourseDetailPageProps {
  /** どのコースを開いているか。一覧で選ばれたもの。 */
  course: Course;
  onSelectLesson: (lessonId: string) => void;
  /** コース一覧へ戻る。 */
  onBack: () => void;
  /** 「作れるようになるもの」から、やり方の説明をひらく。 */
  onOpenRecipe?: (recipeId: string) => void;
}

export function CourseDetailPage({
  course,
  onSelectLesson,
  onBack,
  onOpenRecipe,
}: CourseDetailPageProps) {
  const completed = useCompletedLessons();
  /*
    このコースに対応する学習パス。レシピはパスだけが持っている。
    届かなければ null で、その節ごと出さない（course/learningPath.ts）。
  */
  const path = useLearningPath(course.id);
  const bookmarks = useBookmarks();
  /*
    目印は登録した人のもの（course/keeping.ts）。
    ゲストには印そのものを出さない。押せる形で置いておいて、
    押した先で断るのは、押させてから取り上げるのと同じ。
  */
  const { canKeep } = useKeeping();
  // 覚えた技の数はサーバーが数える。届かなければ出さない
  const summary = useXpSummary();
  const [recommended, setRecommended] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LessonCategoryId | null>(null);

  useEffect(() => {
    setRecommended(loadRecommendations());
  }, []);

  const outline = useMemo(() => courseOutline(course), [course]);

  /*
    次に進む1本。

    診断のおすすめのうち、まだ終えていないものを優先する。
    無ければ道のりの順で最初の1本（現在地チェックが先）。
    付けるのは1本だけ——複数に付けると、どれから始めればよいかが
    結局分からない。
  */
  const suggested = outline.startableDays.find(
    (lesson) => recommended.includes(lesson.id) && !completed.includes(lesson.id),
  );
  const current = suggested ?? nextLesson(outline, completed);

  const doneDays = outline.startableDays.filter((lesson) =>
    completed.includes(lesson.id),
  ).length;

  const overview = courseImage(course.id);

  // 探している最中は、絞り込んだものだけを並べる
  const searching = query.trim() !== "" || category !== null;
  const found = searchLessons(
    filterLessonsByCategory(course.lessons, category),
    query,
  );

  return (
    <>
      <AppHeader onBack={onBack} centered />

      <main className="page">
        <h1 className="text-xl font-bold">{course.title}</h1>
        {/*
          短く1文。ここで何ができるようになるかを長く語らない
          （それは下の「できるようになること」の担当）。
        */}
        <p className="mt-1.5 text-sm leading-7 text-ink-muted">{course.description}</p>

        <CourseProgressLine
          done={doneDays}
          total={outline.startableDays.length}
          comingSoon={outline.comingSoonDays}
          skills={summary?.skills}
        />

        {/*
          次に押す場所を1つに決める。

          道のりの中でも現在地は強調されるが、それは「いまどこか」を
          示すだけで、**押す場所が1つに決まっていない**。数日ぶりに
          開いた人は、結局スクロールして探すことになる。

          探している最中は隠す。絞り込んだ結果の上に「次はここから」が
          残ると、検索したのに別のものを勧められる形になる。
        */}
        {!searching && <CourseResume lesson={current ?? null} onStart={onSelectLesson} />}

        {/*
          コース全体の1枚。**説明文の代わりではなく、説明文より先**。

          「8日で何をするのか」は、順に読んで組み立てるより1枚見たほうが早い。
          道のり（下の CourseOutline）は「いまどこか」を担うので、
          こちらは「ぜんぶでどこへ行くのか」だけを持つ。

          探している最中は隠す。絞り込んだ結果の上にコース全体の絵が
          残ると、検索結果がその絵の付属物に見える。
        */}
        {!searching && overview && (
          <div className="mt-4">
            <TeachingImage
              src={overview.src}
              alt={overview.alt}
              width={overview.width}
              height={overview.height}
            />
          </div>
        )}

        {/*
          道のり。この画面の主役。

          探している最中は隠す。絞り込んだ結果の隣に道のりが残ると、
          同じレッスンが1画面に二度出て、どちらが検索結果なのかが
          分からなくなる。
        */}
        {!searching && (
        <section className="mt-7" aria-labelledby="outline-heading">
          <h2 id="outline-heading" className="sr-only">
            コースの道のり
          </h2>
          <CourseOutline
            outline={outline}
            completed={completed}
            currentId={current?.id ?? null}
            bookmarked={(id) => bookmarks.has(id)}
            onToggleBookmark={canKeep ? (id) => bookmarks.toggle(id) : undefined}
            onSelect={onSelectLesson}
          />
        </section>
        )}

        {!searching && (
          <CourseOutcome
            outcome={course.outcome}
            recipes={path?.recipes ?? []}
            onOpenRecipe={onOpenRecipe}
          />
        )}

        {/*
          探す口。**道のりの下に置く。**

          この画面の主題は順番に進むことで、探すのはその次。
          上に置くと、開いた瞬間に目に入るのが入力欄になり、
          「次はどれか」が下へ押しやられる。
        */}
        <section className="mt-8" aria-labelledby="search-heading">
          <h2 id="search-heading" className="section-title">
            やりたいことから探す
          </h2>
          <div className="mt-2">
            <label htmlFor="lesson-search" className="sr-only">
              レッスンを探す
            </label>
            <input
              id="lesson-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例: メール、要約"
              data-testid="lesson-search"
              className="w-full border-b border-line bg-transparent px-1 py-2 text-sm
                         placeholder:text-ink-muted focus:border-brand focus:outline-none"
            />
            <div
              className="mt-3 flex gap-2 overflow-x-auto pb-1"
              role="group"
              aria-label="やりたいことから絞る"
            >
              {LESSON_CATEGORIES.map((entry) => {
                const selected = category === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCategory(selected ? null : entry.id)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                      selected
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-white text-ink-muted hover:border-brand"
                    }`}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/*
            探し始めたときだけ結果を出す。何も入れていないうちに
            全件を並べると、上の道のりと同じものが二度並ぶ。
          */}
          {searching &&
            (found.length === 0 ? (
              /*
                0件のときに、黙って空にしない。打ち間違いなのか、
                そもそも無いのかが分からなくなる。
                下に一覧は無いので、その場で戻せる口を置く。
              */
              <div className="mt-4" role="status">
                <p className="text-sm leading-7 text-ink-muted">
                  {query.trim() ? `「${query}」に` : "選んだカテゴリに"}
                  当てはまる教材はありませんでした。
                  <br />
                  別の言い方でも探せます。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setCategory(null);
                  }}
                  data-testid="lesson-search-clear"
                  className="-my-2 mt-1 py-2 text-sm font-bold text-brand
                             transition hover:text-brand-dark"
                >
                  絞り込みをやめる
                </button>
              </div>
            ) : (
              /*
                探しているときは**絵のある行**で出す。見ているのは
                順番ではなく「どれが目当てか」なので、見せ方を分ける。
              */
              <ul
                className="mt-4 grid grid-cols-1 gap-4 min-[430px]:grid-cols-2"
                role="list"
              >
                {found.map((lesson) => (
                  <LessonDiscoveryCard
                    key={lesson.id}
                    lesson={lesson}
                    onSelect={() => onSelectLesson(lesson.id)}
                  />
                ))}
              </ul>
            ))}
        </section>

        {/*
          スタンプ。**いちばん下。**

          集める楽しさは残すが、コースの主役にはしない。上に置くと、
          学ぶことより集めることが目的に見えてくる。
        */}
        {!searching && (
        <div className="mt-8">
          <PathProgress
            course={course}
            done={doneDays}
            total={outline.startableDays.length}
            heading="スタンプ"
          />
        </div>
        )}

        <div className="mt-8">
          <PoAvatar
            po={{
              message:
                completed.length === 0
                  ? "まずは現在地チェックから。3つ答えるだけで、合いそうなものが分かります。"
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
