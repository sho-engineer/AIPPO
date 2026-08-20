import { describe, expect, it } from "vitest";

import { COURSE, getLesson } from "../src/course/catalog";
import {
  buildAiInput,
  checkStep,
  hasFreeOption,
  isFreeValue,
  nextStepId,
  previousStepId,
  progressOf,
  summaryOf,
} from "../src/course/engine";
import { recommendLessons, RECOMMENDATION_COUNT } from "../src/course/recommend";
import { CARD_VISUALS, PO_EMOTIONS, STEP_TYPES } from "../src/course/types";
import type { LessonStep } from "../src/course/types";

const REWRITE = getLesson("rewrite_text")!;

describe("教材データ", () => {
  it("Lesson 0〜7 と Final Challenge が揃っている", () => {
    expect(COURSE.lessons.map((lesson) => lesson.number)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(getLesson("final_challenge")).not.toBeNull();
  });

  it("id が重複していない", () => {
    const ids = COURSE.lessons.map((lesson) => lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("どのレッスンもステップ id が重複していない", () => {
    for (const lesson of COURSE.lessons) {
      const ids = lesson.steps.map((step) => step.id);
      expect(new Set(ids).size, `${lesson.title} で id が重複している`).toBe(
        ids.length,
      );
    }
  });

  it("宣言された行き先が必ず存在する", () => {
    // 書き間違いがあると、その場で行き止まりになる
    for (const lesson of COURSE.lessons) {
      const ids = new Set(lesson.steps.map((step) => step.id));
      for (const step of lesson.steps) {
        if (step.next) {
          expect(ids.has(step.next), `${lesson.title}/${step.id} の行き先が無い`).toBe(
            true,
          );
        }
      }
    }
  });

  it("知らない種類・知らない表情を使っていない", () => {
    for (const lesson of COURSE.lessons) {
      for (const step of lesson.steps) {
        expect(STEP_TYPES).toContain(step.type);
        expect(PO_EMOTIONS).toContain(step.poEmotion);
      }
    }
  });

  it("Lesson 0 と Lesson 7 は AI を使わない", () => {
    // 診断で AI を呼ぶと最初の1画面で待たせる。
    // 安全の練習を AI に採点させるのも筋が違う。
    expect(getLesson("diagnosis")!.usesAi).toBe(false);
    expect(getLesson("use_ai_safely")!.usesAi).toBe(false);

    for (const lesson of COURSE.lessons.filter((entry) => !entry.usesAi)) {
      const withAi = lesson.steps.filter((step) => step.aiAction);
      expect(withAi, `${lesson.title} が AI を呼んでいる`).toEqual([]);
    }
  });

  it("成果物ファーストの骨格になっている", () => {
    // 説明から始めず、まず完成イメージ → 1回試す、の順であること。
    //
    // Final Challenge だけは外す。自分の困りごとを先に聞かないと
    // 見せる完成イメージが決まらないため。
    for (const lesson of COURSE.lessons.filter(
      (entry) => entry.usesAi && entry.id !== "final_challenge",
    )) {
      const kinds = lesson.steps.map((step) => step.type);
      expect(kinds[0], `${lesson.title} が完成イメージから始まっていない`).toBe(
        "outcome_preview",
      );
      expect(kinds[1], `${lesson.title} がすぐ試せない`).toBe("quick_try");
      // 観察 → 解説 の順。解説が先に来ていないこと
      expect(kinds.indexOf("observation")).toBeLessThan(
        kinds.indexOf("concept_card"),
      );
      // 解説のあとは、すぐ操作へ戻る
      const lastCard = kinds.lastIndexOf("concept_card");
      expect(kinds[lastCard + 1], `${lesson.title} が解説の後に操作へ戻らない`).toBe(
        "condition_choice",
      );
    }
  });

  it("最初の1回で選ばせるのは1つだけ", () => {
    // ここを増やすと、最初の結果に届く前に手が止まる
    for (const lesson of COURSE.lessons.filter((entry) => entry.usesAi)) {
      const quick = lesson.steps.find((step) => step.type === "quick_try")!;
      expect(quick.key, `${lesson.title}`).toBeTruthy();
      expect(quick.options?.length ?? 0).toBeGreaterThan(1);
      expect(quick.options?.length ?? 0).toBeLessThanOrEqual(4);
      // 例文が入っているので、空欄から始まらない
      const meta = quick.meta as { sampleText?: string };
      if (lesson.id !== "final_challenge") {
        expect(meta.sampleText, `${lesson.title} に例文が無い`).toBeTruthy();
      }
    }
  });

  it("完成イメージの材料が揃っている", () => {
    for (const lesson of COURSE.lessons.filter((entry) => entry.usesAi)) {
      expect(lesson.outcomeTitle, `${lesson.title}`).toBeTruthy();
      expect(lesson.estimatedMinutes, `${lesson.title}`).toBeGreaterThan(0);
      expect(lesson.learnedSkills?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("自分で条件を組み立てる回だけ、送る前に依頼内容を見せる", () => {
    for (const lesson of COURSE.lessons.filter((entry) => entry.usesAi)) {
      const kinds = lesson.steps.map((step) => step.type);
      expect(kinds, `${lesson.title}`).toContain("prompt_preview");
      // 最初の1回では挟まない（成功までを遠くしない）
      expect(kinds.indexOf("prompt_preview")).toBeGreaterThan(
        kinds.indexOf("observation"),
      );
    }
  });

  it("解説カードは3枚まで、短く保つ", () => {
    for (const lesson of COURSE.lessons) {
      const cards = lesson.steps.filter((step) => step.type === "concept_card");
      expect(cards.length, `${lesson.title} の解説が多い`).toBeLessThanOrEqual(3);

      for (const step of cards) {
        const card = step.card!;
        expect(card.title.length, `${card.title} の見出しが長い`).toBeLessThanOrEqual(20);
        expect(card.body.length, `${card.title} の本文が長い`).toBeLessThanOrEqual(80);
        expect(CARD_VISUALS).toContain(card.visual);
        // 読みたくない人を足止めしない
        expect(step.skippable, `${card.title} が飛ばせない`).toBe(true);
      }

      // 同じことを2枚に書かない
      const titles = cards.map((step) => step.card!.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it("AI を使うレッスンは、サンプルだけで終わらせない", () => {
    // 自分の課題で試すところまでが1本（要件 §6.10）
    for (const lesson of COURSE.lessons.filter((entry) => entry.usesAi)) {
      const kinds = lesson.steps.map((step) => step.type);
      expect(kinds, `${lesson.title}`).toContain("real_task");
      expect(kinds.indexOf("real_task")).toBeLessThan(kinds.indexOf("completion"));
    }
  });

  it("最後は必ず完了ステップ", () => {
    for (const lesson of COURSE.lessons) {
      const last = lesson.steps[lesson.steps.length - 1];
      expect(last.type, `${lesson.title}`).toBe("completion");
    }
  });

  it("画面に専門用語を出さない", () => {
    const banned = ["プロンプト", "トークン", "パラメータ", "モデル", "API"];
    for (const lesson of COURSE.lessons) {
      for (const step of lesson.steps) {
        const text = [step.title, step.instruction ?? "", step.poMessage].join(" ");
        for (const word of banned) {
          expect(text, `${lesson.title}/${step.id} に「${word}」が出ている`).not.toContain(
            word,
          );
        }
      }
    }
  });
});

describe("進み方", () => {
  it("並び順の次へ進む", () => {
    expect(nextStepId(REWRITE, "outcome_preview")).toBe("quick_try");
  });

  it("知らない id を渡されても現在地に留まる", () => {
    expect(nextStepId(REWRITE, "nope")).toBe("nope");
  });

  it("最後まで進んだらそこに留まる", () => {
    expect(nextStepId(REWRITE, "completion")).toBe("completion");
  });

  it("最初から戻ろうとしても動かない", () => {
    expect(previousStepId(REWRITE, "outcome_preview")).toBe("outcome_preview");
  });

  it("進み具合を数えられる", () => {
    const progress = progressOf(REWRITE, "outcome_preview");
    expect(progress.current).toBe(1);
    expect(progress.total).toBe(REWRITE.steps.length);
  });
});

describe("入力の確認", () => {
  const step: LessonStep = {
    id: "x",
    type: "text_input",
    title: "文章",
    poMessage: "",
    poEmotion: "neutral",
    key: "text",
    required: true,
    validationRules: { suggestLength: 20, maxLength: 100 },
  };

  it("必須が空なら止める", () => {
    const issue = checkStep(step, { text: "" });
    expect(issue?.blocking).toBe(true);
  });

  it("短すぎるだけなら止めない。提案として出す", () => {
    // 初心者の手が止まる原因は書けないことではなく、
    // 「これでいいのか分からない」こと。止めると余計に進めない。
    const issue = checkStep(step, { text: "短い" });
    expect(issue?.blocking).toBe(false);
    expect(issue?.reason).toContain("20");
  });

  it("長すぎるときは止める", () => {
    expect(checkStep(step, { text: "あ".repeat(101) })?.blocking).toBe(true);
  });

  it("ちょうどよければ何も言わない", () => {
    expect(checkStep(step, { text: "あ".repeat(30) })).toBeNull();
  });
});

describe("その他（自由入力）", () => {
  const step = REWRITE.steps.find((entry) => entry.id === "real_audience")!;

  it("選択肢を持つステップには「そのほか」がある", () => {
    expect(hasFreeOption(step)).toBe(true);
  });

  it("選択肢に無い値は自由入力とみなす", () => {
    expect(isFreeValue(step, "取引先の担当者")).toBe(true);
    expect(isFreeValue(step, "上司")).toBe(false);
    expect(isFreeValue(step, "")).toBe(false);
  });
});

describe("AI へ渡す値", () => {
  it("教材の対応表どおりに詰め替える", () => {
    const step = REWRITE.steps.find((entry) => entry.id === "generate_first")!;
    const input = buildAiInput(step, {
      source_text: "もとの文章",
      audience: "上司",
      tone: "ていねいに",
      length: "3行くらい",
    });

    expect(input).toEqual({
      original_text: "もとの文章",
      audience: "上司",
      tone: "ていねいに",
      length: "3行くらい",
    });
  });

  it("AI を呼ばないステップからは何も作らない", () => {
    const step = REWRITE.steps.find((entry) => entry.id === "outcome_preview")!;
    expect(buildAiInput(step, { source_text: "x" })).toEqual({});
  });
});

describe("入力済みのまとめ", () => {
  it("現在地より前の、答えた分だけを出す", () => {
    const summary = summaryOf(REWRITE, "real_tone", {
      audience: "上司",
      condition: "もっと短く",
      real_task_text: "自分の文章",
      // まだ答えていない
      tone: "",
    });

    expect(summary.map((entry) => entry.value)).toEqual([
      "上司",
      "もっと短く",
      "自分の文章",
      "上司",
    ]);
  });

  it("選んだ札の言葉を出す。教材の中の記号は出さない", () => {
    /*
      診断の答えは `writing` `tried` のような記号で持っている。
      そのまま出すと、日本語の画面に英語の記号が並ぶ。
      しかも記号は教材の中でしか意味を持たないので、別の質問で
      同じ `writing` が出て、違う2つの答えが同じに見えていた。
    */
    const diagnosis = getLesson("diagnosis")!;
    const last = diagnosis.steps[diagnosis.steps.length - 1];

    const summary = summaryOf(diagnosis, last.id, {
      work_kind: "writing",
      ai_experience: "tried",
      pain_point: "writing",
    });

    for (const entry of summary) {
      expect(entry.value).not.toMatch(/^[a-z_]+$/);
    }
    expect(summary.map((entry) => entry.value)).toContain("文章を書くことが多い");
  });

  it("自分で書いた言葉は、そのまま出す", () => {
    // 選択肢のどれにも一致しない。書いた文字が答えそのもの
    const summary = summaryOf(REWRITE, "real_tone", {
      real_task_text: "来週の打ち合わせの件です",
    });

    expect(summary.map((entry) => entry.value)).toContain(
      "来週の打ち合わせの件です",
    );
  });
});

describe("おすすめの選び方", () => {
  it("必ず3つ返す", () => {
    expect(recommendLessons({})).toHaveLength(RECOMMENDATION_COUNT);
    expect(recommendLessons({ pain_point: "writing" })).toHaveLength(
      RECOMMENDATION_COUNT,
    );
  });

  it("いま面倒なことに直結するものが先頭に来る", () => {
    expect(recommendLessons({ pain_point: "summarizing" })[0]).toBe(
      "summarize_text",
    );
    expect(recommendLessons({ pain_point: "planning" })[0]).toBe("make_plan");
  });

  it("同じレッスンを二重に出さない", () => {
    const ids = recommendLessons({ pain_point: "writing", work_kind: "writing" });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("AI を使わないレッスンはおすすめしない", () => {
    // 診断直後に「AIを使わない回」を勧めても、体験が始まらない
    for (const id of recommendLessons({ pain_point: "comparing" })) {
      expect(getLesson(id)!.usesAi).toBe(true);
    }
  });
});
