/**
 * いま使っている教材。
 *
 * 教材の本体は DB にあり、管理画面から直せる（`backend/apps/catalog`）。
 * 画面は起動時に `GET /api/v1/catalog/` を1回聞き、届いたらそれに差し替える。
 *
 * 同梱データを残してある理由
 * --------------------------
 * サーバーに届かないとき、教材が1本も無い画面になる。
 * それは「壊れている」のと見分けがつかない。同梱の9本を先に出しておけば、
 * 通信できない場所でも最後まで進められる（AIを使うステップだけが止まる）。
 *
 * 差し替えるのは、届いた中身が教材として成り立っているときだけ。
 * 空の応答や形の違うものを受け取って上書きすると、同梱の分まで失われる。
 *
 * 置き場所はここ1つ。React の外にも `lookupLesson()` で読める形にしてある。
 * 画面遷移の処理（App.tsx）は描画の外で id を引くため。
 */

import { useEffect, useSyncExternalStore } from "react";

import { COURSE as BUNDLED } from "./catalog";
import { getJson } from "../api/http";
import type { Course, Lesson } from "./types";

type Listener = () => void;

let current: Course = BUNDLED;
/**
 * 届いたコース一式。
 *
 * `current` は「いま学ぶコース」で、こちらは**一覧に出す全部**。
 * 中身がまだ無いコース（近日公開）も入る。何ができるようになるかを
 * 先に見せるためで、始められるかどうかは availability が持つ。
 *
 * 同梱データには近日公開のコースを入れていない。同梱の役目は
 * 「通信できなくても最後まで学べること」で、これから増えるものの
 * 一覧はその役目に要らない。二重に持つと必ず食い違う。
 */
let all: Course[] = [BUNDLED];
let source: "bundled" | "server" = "bundled";
let started = false;

const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 届いた中身が教材として成り立っているか。
 *
 * 見るのは最小限。ここで細かく型を検めると、教材に項目を1つ足すたびに
 * 画面が全部の教材を拒むようになる。「始められる教材が1本でもあるか」
 * だけを見て、あとは画面側が省略に耐える作りにしてある。
 */
function looksUsable(course: unknown): course is Course {
  if (typeof course !== "object" || course === null) return false;

  const { id, lessons } = course as Partial<Course>;
  if (typeof id !== "string" || !Array.isArray(lessons)) return false;

  return lessons.some(
    (lesson) =>
      typeof lesson?.id === "string" &&
      Array.isArray(lesson?.steps) &&
      lesson.steps.length > 0,
  );
}

/**
 * サーバーの教材へ差し替える。
 *
 * 何度呼んでも、取りに行くのは最初の1回だけ。画面を移るたびに
 * 聞き直すと、教材一式は小さくないので体感が落ちる。
 */
export async function loadCatalog(): Promise<void> {
  if (started) return;
  started = true;

  try {
    const body = await getJson<{ courses: unknown[] }>("/api/v1/catalog/");
    const courses = Array.isArray(body.courses) ? body.courses : [];

    /*
      学ぶコースは、**中身のある最初の1本**にする。

      並び順の先頭を無条件に採ると、近日公開のコースを一番上へ
      並べ替えた日に、教材が1本も無い画面になる。
    */
    const usable = courses.find(looksUsable);
    if (!usable) return;

    current = usable;
    /*
      一覧は届いた全部。形の見分けが付くものだけ入れる
      （中身が無くても、題と説明があればカードは出せる）。
    */
    all = courses.filter(looksListable);
    source = "server";
    notify();
  } catch {
    // 届かなかった。同梱のままで動かす
  }
}

/** テスト用。取りに行った記録と差し替えを元へ戻す。 */
export function resetCatalog(): void {
  current = BUNDLED;
  all = [BUNDLED];
  source = "bundled";
  started = false;
  notify();
}

/**
 * カードに出せる形をしているか。
 *
 * `looksUsable` より緩い。あちらは「学べるか」を見るので中身を要求するが、
 * 一覧のカードは題と説明だけで成り立つ。同じ関門にすると、
 * これから増えるコースが1つも出せない。
 */
function looksListable(course: unknown): course is Course {
  if (typeof course !== "object" || course === null) return false;
  const { id, title } = course as Partial<Course>;
  return typeof id === "string" && typeof title === "string";
}

export function currentCourse(): Course {
  return current;
}

export function catalogSource(): "bundled" | "server" {
  return source;
}

export function allCourses(): Course[] {
  return all;
}

/**
 * id から1本引く。
 *
 * 描画の外からも呼ぶ（画面遷移のとき、開いてよい教材かを見る）。
 */
export function lookupLesson(lessonId: string): Lesson | null {
  return current.lessons.find((lesson) => lesson.id === lessonId) ?? null;
}

/** いまの教材。サーバーから届いたら、自動で描き直る。 */
export function useCourse(): Course {
  const course = useSyncExternalStore(subscribe, currentCourse, currentCourse);

  useEffect(() => {
    void loadCatalog();
  }, []);

  return course;
}

/** 一覧に出すコース全部。これから増える分も入る。 */
export function useCourses(): Course[] {
  const courses = useSyncExternalStore(subscribe, allCourses, allCourses);

  useEffect(() => {
    void loadCatalog();
  }, []);

  return courses;
}
