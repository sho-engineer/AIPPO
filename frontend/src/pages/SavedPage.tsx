/**
 * 保存したもの（下タブの「保存したもの」）。
 *
 * 目印を付けた教材と、自分のプロンプト帳を並べる。前は教材一覧の中に
 * 節として埋まっていた。取っておいた人ほど一覧を下まで読むことになっていて、
 * 「取っておく」の意味が薄かった。
 *
 * 並べ方は一覧と同じ行にする（LessonRow）。同じ教材の見え方が
 * 場所によって変わると、同じものだと気づけない。
 *
 * 登録していない人には
 * --------------------
 * この画面の中身は**全部「残すもの」**なので、ゲストには出さない
 * （course/keeping.ts）。ゲストの鍵は7日で切れるので、残したつもりの
 * ものが翌月には本人からも取り出せない。取っておけると言っておいて
 * 消えるより、取っておくには登録が要ると先に言うほうがよい。
 *
 * ただし締め出さない。学ぶこと自体はゲストのままでできる、と
 * その場に書く。ここを「ログインしてください」だけで終える画面に
 * すると、まだ何も良いことが起きていない人を追い返すことになる。
 *
 * 何も無いときに、行き止まりにしない
 * ----------------------------------
 * 「まだありません」で終える画面を作らない（憲章 原則 I）。
 * 付け方を1行で書き、そのまま一覧へ行けるようにしておく。
 */

import { useState } from "react";

import { AppHeader } from "../components/AppShell";
import { AuthDialog } from "../components/auth/AuthDialog";
import { LessonRow } from "../components/lessons/LessonRow";
import { PromptLibrary } from "../components/course/PromptLibrary";
import { IconBookmark, IconCheckCircle } from "../components/Icons";
import { useBookmarks } from "../course/bookmarks";
import { useKeeping } from "../course/keeping";
import { useCourse } from "../course/live";
import { useCompletedLessons } from "../course/progress";
import { isComingSoon } from "../course/availability";

export interface SavedPageProps {
  onSelectLesson: (lessonId: string) => void;
  /** 何も無いときの行き先。 */
  onOpenCourse: () => void;
  onOpenAccount: () => void;
}

/** 登録すると使えるようになるもの。ここに挙げたものが、この画面の中身。 */
const KEPT = [
  "気になった教材に「あとで見る」印を付けられます",
  "レッスンで組み立てた伝え方が、プロンプト帳に残ります",
  "コースを終えると、修了証を受け取れます",
];

export function SavedPage({
  onSelectLesson,
  onOpenCourse,
  onOpenAccount,
}: SavedPageProps) {
  const course = useCourse();
  const bookmarks = useBookmarks();
  const done = useCompletedLessons();
  const { canKeep, loading } = useKeeping();
  const [signingUp, setSigningUp] = useState(false);

  const saved = course.lessons.filter((lesson) => bookmarks.has(lesson.id));

  return (
    <>
      <AppHeader onOpenAccount={onOpenAccount} />

      <main className="page">
        <h1 className="mt-4 text-xl font-bold sm:text-2xl">保存したもの</h1>
        <p className="mt-2 text-sm leading-7 text-ink-muted">
          あとで見る印を付けた教材と、自分のプロンプト帳です。
        </p>

        {/*
          まだ分からないあいだは、どちらも出さない。
          先に誘いを出すと、ログイン済みの人にも一瞬見えて消える。
        */}
        {loading ? null : !canKeep ? (
          <div
            className="mt-6 rounded-panel border border-line bg-surface p-6 shadow-card"
            data-testid="saved-needs-account"
          >
            <p className="text-sm font-bold">取っておくには、登録が要ります</p>
            <p className="mt-1 text-xs leading-6 text-ink-muted">
              登録しなくても、教材は最後まで進められます。
              登録すると、次のものが残ります。
            </p>

            <ul className="mt-3 space-y-2" role="list">
              {KEPT.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-sm leading-7">
                  <IconCheckCircle className="mt-1.5 h-4 w-4 shrink-0 text-brand" />
                  {line}
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSigningUp(true)}
                data-testid="saved-signup"
                className="min-h-[2.75rem] rounded-cta bg-brand px-6 py-2 text-sm
                           font-bold text-white shadow-cta transition
                           hover:brightness-110 active:scale-[0.98]"
              >
                登録する
              </button>
              {/* 締め出さない。登録しないまま学びに戻る道を、同じ場所に置く */}
              <button
                type="button"
                onClick={onOpenCourse}
                className="min-h-[2.75rem] rounded-cta border border-line px-6 py-2
                           text-sm font-bold transition hover:bg-surface-sunken"
              >
                このまま教材へ
              </button>
            </div>
          </div>
        ) : saved.length === 0 ? (
          <div
            className="mt-6 rounded-panel border border-line bg-surface p-6 text-center
                       shadow-card"
            data-testid="saved-empty"
          >
            <span
              aria-hidden="true"
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full
                         bg-brand-soft text-brand"
            >
              <IconBookmark className="h-6 w-6" />
            </span>
            {/*
              「何も入っていません」とは書かない。この下に自分のプロンプトが
              並んでいることがあり、その場合は嘘になる。
              空だと言えるのは、教材の目印についてだけ。
            */}
            <p className="mt-3 text-sm font-bold">目印を付けた教材はまだありません</p>
            <p className="mt-1 text-xs leading-6 text-ink-muted">
              教材の一覧で、右端の
              <IconBookmark className="mx-1 inline h-3.5 w-3.5 align-text-bottom" />
              を押すと、ここに残ります。
            </p>
            <button
              type="button"
              onClick={onOpenCourse}
              className="mt-4 min-h-[2.75rem] rounded-cta bg-brand px-6 py-2 text-sm
                         font-bold text-white shadow-cta transition
                         hover:brightness-110 active:scale-[0.98]"
            >
              教材を見る
            </button>
          </div>
        ) : (
          <ul className="mt-5" role="list" data-testid="saved-list">
            {saved.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                done={done.includes(lesson.id)}
                firstUp={false}
                bookmarked
                onToggleBookmark={() => bookmarks.toggle(lesson.id)}
                testIdPrefix="saved-"
                onSelect={() => {
                  if (!isComingSoon(lesson)) onSelectLesson(lesson.id);
                }}
              />
            ))}
          </ul>
        )}

        {/*
          自分のプロンプト帳。レッスンで組み立てた伝え方を、ここから写して使う。
          1件も無い日は出ない。ゲストには溜まらない（LessonRunner がしまわない）。
        */}
        {canKeep && <PromptLibrary />}
      </main>

      {signingUp && <AuthDialog mode="signup" onClose={() => setSigningUp(false)} />}
    </>
  );
}
