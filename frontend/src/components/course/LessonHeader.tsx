/**
 * レッスン中の上の帯。
 *
 *     ←        文章を分かりやすくする        ×
 *
 * ふだんの帯（AppHeader）はロゴを中央に置くが、レッスン中はそこに
 * **いま何をしているか**を出す。ロゴは開いた瞬間に一度見れば足り、
 * 19歩のあいだずっと出しておく価値は無い。代わりに、どのレッスンの
 * 途中なのかが常に読める。
 *
 * 左右を分ける理由
 * ----------------
 * 左の「←」は1歩戻る、右の「×」はレッスンから出る。行き先が違うので
 * 見た目も置き場所も分ける。前は右上に「レッスン一覧へ」という文字だけが
 * あり、1歩戻るのは画面下のボタンだった。戻る手段が上下に散っていて、
 * どちらがどこへ行くのか押すまで分からない。
 *
 * 高さは 44px のまま。スマホの縦は限られていて、帯が厚いぶん
 * そのまま教材の見える量が減る。
 */

import { IconChevronLeft } from "../Icons";

export interface LessonHeaderProps {
  /** いま開いているレッスンの名前。 */
  title: string;
  /** 1歩戻る。最初の画面では渡さない（戻り先が無い）。 */
  onBack?: () => void;
  /** レッスンから出る。 */
  onExit: () => void;
  /**
   * 出るときの言い方。
   *
   * ふだんは「×」だけでよい。ただし診断のように**やらなくてもよい**
   * ものは、出ることが「スキップ」と同じ意味になる。そこだけは
   * 言葉で出す——×は「閉じる」であって「飛ばしてよい」とは読めない。
   */
  exitLabel?: string;
}

export function LessonHeader({
  title,
  onBack,
  onExit,
  exitLabel,
}: LessonHeaderProps) {
  return (
    <header
      /*
        上の安全域を足す。

        ノッチのある端末では、帯が時計やカメラの下へ潜り込む。下端
        （ホームバー）は前から見ていたのに、上だけ見ていなかった。

        足したぶんは画面の高さからも引く必要がある——レッスンの中身は
        `calc(100dvh - 2.75rem - env(safe-area-inset-top))` を取る
        （`StepShell` / `DayCompletePage`）。片方だけ直すと、足した分が
        そのままはみ出しになる。
      */
      className="sticky top-0 z-20 flex h-11 items-center gap-2 border-b border-line
                 bg-canvas px-2 pt-[env(safe-area-inset-top)]"
      data-testid="lesson-header"
    >
      {/*
        左右の枠は、中身の有無にかかわらず同じ幅で確保する。
        戻れない画面で幅が変わると、題名の位置がずれて落ち着かない。
      */}
      <div className="flex w-9 shrink-0 justify-start">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="前のステップへ戻る"
            data-testid="lesson-back"
            className="flex h-9 w-9 items-center justify-center rounded-badge
                       text-ink-muted transition hover:bg-brand-soft hover:text-brand"
          >
            <IconChevronLeft className="h-5 w-5" />
          </button>
        )}
      </div>

      {/*
        題名。長いレッスン名でも帯を2段にしない——高さが変わると、
        その下の中身が毎回ずれる。入りきらない分は省略する。

        見出し（h1）にはしない。帯はどのステップでも同じ文字を出し続ける
        ので、画面の見出しにはならない。見出しは、いま何をしているかを言う
        ステップ側（PoHero）が持つ。h1 が2つあると、読み上げで
        「この画面は何か」を探すときに2回聞かされる。
      */}
      <p className="min-w-0 flex-1 truncate text-center text-sm font-bold">{title}</p>

      <div
        className={`flex shrink-0 justify-end ${exitLabel ? "min-w-[3.5rem]" : "w-9"}`}
      >
        {exitLabel ? (
          <button
            type="button"
            onClick={onExit}
            data-testid="lesson-exit"
            className="rounded-badge px-2 py-2 text-sm font-bold text-brand
                       transition hover:text-brand-dark"
          >
            {exitLabel}
          </button>
        ) : (
        <button
          type="button"
          onClick={onExit}
          aria-label="レッスンを閉じる"
          data-testid="lesson-exit"
          className="flex h-9 w-9 items-center justify-center rounded-badge
                     text-ink-muted transition hover:bg-brand-soft hover:text-brand"
        >
          {/* ×。線2本だけなので、アイコン一覧には足さずここで描く */}
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        )}
      </div>
    </header>
  );
}
