/**
 * レッスンの絵。
 *
 * ここで守るのは5つ。
 *
 *   1. 出どころは1か所。同じレッスンなら、どの画面でも同じ絵
 *   2. 教材データが持っていれば、そちらが優先される
 *   3. 絵が無いレッスンでは null（画面側は絵の場所ごと出さない）
 *   4. 縦横比は必ず 4:3。引き伸ばさない・切り取らない
 *   5. 読み込みの前後で高さが変わらない（あとから他の要素が飛ばない）
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  LessonThumbnail,
  LessonThumbnailPlaceholder,
} from "../src/components/lessons/LessonThumbnail";
import {
  LESSON_THUMBNAIL_HEIGHT,
  LESSON_THUMBNAIL_WIDTH,
  lessonThumbnail,
  lessonThumbnailById,
} from "../src/course/lessonThumbnail";
import { COURSE } from "../src/course/catalog";
import type { Lesson } from "../src/course/types";

const lessonOf = (id: string): Lesson =>
  COURSE.lessons.find((entry) => entry.id === id)!;

describe("どの絵を出すか", () => {
  it("id から引ける", () => {
    expect(lessonThumbnail(lessonOf("rewrite_text"))).toBe(
      "/assets/final-thumbnails/start_01.webp",
    );
  });

  it("教材データが持っていれば、そちらを使う", () => {
    /*
      管理画面から差し替えられるようにするための入口。
      表よりデータのほうが新しいので、データを優先する。
    */
    const lesson: Lesson = {
      ...lessonOf("rewrite_text"),
      thumbnail: "/assets/lessons/差し替えたもの.webp",
    };

    expect(lessonThumbnail(lesson)).toBe("/assets/lessons/差し替えたもの.webp");
  });

  it("絵の無いレッスンでは null", () => {
    // 用意できている絵は全レッスンぶんではない。無いものは無いと返す
    expect(lessonThumbnail(lessonOf("diagnosis"))).toBeNull();
    expect(lessonThumbnailById("lesson_that_has_no_picture")).toBeNull();
  });

  it("同じレッスンなら、どこから引いても同じ絵", () => {
    /*
      画面ごとに違う絵を出さない、を裏から確かめる。
      教材データから引いても、id から引いても同じでなければ、
      画面によって絵が変わりうる。
    */
    for (const lesson of COURSE.lessons) {
      const fromLesson = lessonThumbnail(lesson);
      const fromId = lessonThumbnailById(lesson.id);
      expect(fromLesson).toBe(fromId);
    }
  });
});

describe("出し方", () => {
  it("縦横比は 4:3 で、引き伸ばさない", () => {
    render(<LessonThumbnail src="/assets/lessons/rewrite_text.webp" />);

    const img = screen.getByTestId("lesson-thumbnail");
    expect(img.className).toContain("aspect-[4/3]");
    // cover にしても、絵そのものが 4:3 なので切り取られない
    expect(img.className).toContain("object-cover");
  });

  it("読み込みの前後で高さが変わらないよう、実寸を渡す", () => {
    render(<LessonThumbnail src="/assets/lessons/rewrite_text.webp" />);

    const img = screen.getByTestId("lesson-thumbnail");
    expect(img).toHaveAttribute("width", String(LESSON_THUMBNAIL_WIDTH));
    expect(img).toHaveAttribute("height", String(LESSON_THUMBNAIL_HEIGHT));
  });

  it("横いっぱいの絵は先に読み、一覧の小さい絵はあとから読む", () => {
    const { rerender } = render(
      <LessonThumbnail src="/x.webp" variant="banner" />,
    );
    expect(screen.getByTestId("lesson-thumbnail")).toHaveAttribute(
      "loading",
      "eager",
    );

    rerender(<LessonThumbnail src="/x.webp" variant="thumb" />);
    expect(screen.getByTestId("lesson-thumbnail")).toHaveAttribute(
      "loading",
      "lazy",
    );
  });

  it("題は隣に文字で出ているので、読み上げには渡さない", () => {
    render(<LessonThumbnail src="/x.webp" />);

    expect(screen.getByTestId("lesson-thumbnail")).toHaveAttribute("alt", "");
  });
});

describe("絵がまだ無いレッスンの場所", () => {
  const Icon = ({ className }: { className?: string }) => (
    <svg className={className} />
  );

  it("同じ大きさ・同じ縦横比で場所を取る", () => {
    /*
      一覧では絵のある行と無い行が混ざる。空けてしまうと、そこだけ
      題の始まる位置がずれて、列がガタガタに見える。
    */
    render(<LessonThumbnailPlaceholder icon={Icon} />);

    const slot = screen.getByTestId("lesson-thumbnail-placeholder");
    expect(slot.className).toContain("aspect-[4/3]");
    expect(slot.className).toContain("w-20");
  });
});
