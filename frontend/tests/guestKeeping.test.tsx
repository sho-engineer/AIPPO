/**
 * 登録していない人は、取っておけない。
 *
 * 分けているのは2つ。
 *
 *     進める … 登録なしでもできる。教材は最後まで通る
 *     残す   … 登録した人だけ。目印・プロンプト帳・修了証
 *
 * ゲストの鍵は7日で切れる（backend の LEARNER_KEY_MAX_AGE）。
 * 取っておいたつもりのものが翌月には本人からも取り出せないので、
 * 取っておけると見せてから消すより、先に言うほうがよい。
 *
 * ここで守るのは4つ。
 *
 *   1. ゲストに、押せない「保存」を見せない
 *   2. ゲストのプロンプト帳に溜めない（溜めても消える）
 *   3. **締め出さない**。学びに戻る道を、同じ場所に置く
 *   4. 登録した人には、これまでどおり全部出る
 */

import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import userEvent from "@testing-library/user-event";

import { AuthProvider } from "../src/auth/AuthContext";
import { CourseDetailPage } from "../src/pages/CourseDetailPage";
import { useCourse } from "../src/course/live";
import { LessonRunner } from "../src/pages/LessonRunner";
import { SavedPage } from "../src/pages/SavedPage";
import { loadPrompts, savePrompt } from "../src/course/promptLibrary";
import { promptEntryFor } from "../src/course/promptSummary";
import { COURSE } from "../src/course/catalog";
import type { Lesson } from "../src/course/types";

const lesson = COURSE.lessons.find((entry) => entry.id === "rewrite_text")!;

/**
 * 「この内容でよい」の画面だけを開く。しまうのはその1回。
 *
 * この1枚だけにしてあるのは、次（AIへ送る）まで含めると、
 * ここで見たいこと（しまうか、しまわないか）と関係のない通信が
 * 混ざるため。最後の1枚なので、押しても先へは進まない。
 */
const fromPreview: Lesson = {
  ...lesson,
  steps: lesson.steps.filter((step) => step.id === "prompt_preview"),
};

const openPreview = () =>
  render(
    <AuthProvider>
      <LessonRunner lesson={fromPreview} onExit={() => {}} onOpenCourse={() => {}} />
    </AuthProvider>,
  );

const USER = {
  email: "learner@example.com",
  display_name: "",
  email_verified: true,
  terms_version: "1",
  joined_at: "2026-08-01T00:00:00Z",
  remind_study: false,
};

/**
 * サーバーの返事を組み立てる。
 *
 * 目印と修了証は、登録していない人には空で返る（サーバー側の
 * `can_keep()`）。ここでも同じように返す——画面だけが出し分けていて
 * サーバーは素通し、という食い違いを持ち込まないため。
 */
function server({ signedIn, bookmarks = [] }: { signedIn: boolean; bookmarks?: string[] }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const json = url.includes("/accounts/me")
      ? { authenticated: signedIn, user: signedIn ? USER : undefined }
      : url.includes("/bookmarks")
        ? signedIn
          ? { items: bookmarks.map((id) => ({ lesson_id: id })) }
          : { items: [], requires_account: true }
        : url.includes("/certificate")
          ? signedIn
            ? { certificates: [] }
            : { certificates: [], requires_account: true }
          : url.includes("/progress")
            ? {
                lessons: [],
                completed_count: 0,
                in_progress_count: 0,
                skills: [],
                signed_in: signedIn,
              }
            : {};
    return { ok: true, status: 200, json: async () => json } as Response;
  });
}

const openSaved = () =>
  render(
    <AuthProvider>
      <SavedPage
        onSelectLesson={() => {}}
        onOpenCourse={() => {}}
        onOpenAccount={() => {}}
      />
    </AuthProvider>,
  );

const openCourse = () =>
  render(
    <AuthProvider>
      <CourseDetail />
    </AuthProvider>,
  );

beforeEach(() => window.localStorage.clear());

/**
 * コースの中身の画面。
 *
 * この検査が見ているのは「1つのコースの中の並び」なので、
 * コース一覧（どのコースにするか）ではなく、その次の段を開く。
 * コースはサーバーから届いたものを使う（useCourse）。
 */
function CourseDetail({
  onSelectLesson = () => {},
}: {
  onSelectLesson?: (id: string) => void;
}) {
  const course = useCourse();
  return (
    <CourseDetailPage
      course={course}
      onSelectLesson={onSelectLesson}
      onBack={() => {}}
    />
  );
}

describe("登録していない人", () => {
  beforeEach(() => server({ signedIn: false }));

  it("保存したものの画面で、取っておけないことが分かる", async () => {
    openSaved();

    const card = await screen.findByTestId("saved-needs-account");
    expect(card).toHaveTextContent("取っておくには、登録が要ります");
  });

  it("行き止まりにしない。登録する道と、学びに戻る道を両方置く", async () => {
    /*
      「ログインしてください」だけで終える画面を作らない（憲章 原則 I）。
      まだ何も良いことが起きていない人を、ここで追い返すことになる。
    */
    openSaved();

    const card = await screen.findByTestId("saved-needs-account");
    expect(within(card).getByTestId("saved-signup")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "このまま教材へ" }),
    ).toBeInTheDocument();
  });

  it("登録しなくても学べる、と同じ場所に書く", async () => {
    // 無料で試せるのは変えていない。変えたのは取っておくところだけ
    openSaved();

    expect(await screen.findByTestId("saved-needs-account")).toHaveTextContent(
      "教材は最後まで進められます",
    );
  });

  it("端末に溜まっていたプロンプト帳も出さない", async () => {
    /*
      登録前に溜めた分（この作りより前の版）が残っていることがある。
      取っておける画面に見えてしまうので、出さない。
    */
    savePrompt(promptEntryFor(lesson, { audience: "上司" }));

    openSaved();

    await screen.findByTestId("saved-needs-account");
    expect(screen.queryByTestId("prompt-library")).not.toBeInTheDocument();
  });

  it("「この内容でよい」を押しても、帳面に溜まらない", async () => {
    /*
      溜めても7日で鍵ごと消える。溜まっているように見せてから消すのが
      いちばんよくないので、最初からしまわない。
    */
    const user = userEvent.setup();
    openPreview();

    await user.click(await screen.findByTestId("primary-action"));

    expect(loadPrompts()).toHaveLength(0);
  });

  it("教材一覧に、押せない目印を置かない", async () => {
    openCourse();

    await screen.findByText(COURSE.title);
    expect(screen.queryByTestId(`bookmark-${lesson.id}`)).not.toBeInTheDocument();
  });
});

describe("登録した人", () => {
  it("目印を押せる", async () => {
    server({ signedIn: true });

    openCourse();

    expect(await screen.findByTestId(`bookmark-${lesson.id}`)).toBeInTheDocument();
  });

  it("保存したものの画面は、これまでどおり", async () => {
    server({ signedIn: true, bookmarks: ["rewrite_text"] });

    openSaved();

    expect(await screen.findByTestId("saved-list")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-needs-account")).not.toBeInTheDocument();
  });

  it("「この内容でよい」で、帳面にしまわれる", async () => {
    server({ signedIn: true });
    const user = userEvent.setup();
    openPreview();

    await user.click(await screen.findByTestId("primary-action"));

    expect(loadPrompts()).toHaveLength(1);
  });

  it("プロンプト帳が出る", async () => {
    server({ signedIn: true });
    savePrompt(promptEntryFor(lesson, { audience: "上司" }));

    openSaved();

    expect(await screen.findByTestId("prompt-library")).toBeInTheDocument();
  });
});
