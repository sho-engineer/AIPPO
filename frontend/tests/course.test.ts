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
  it("現在地チェックは Day として数えない", () => {
    // 診断は始める前に自分の位置を見るもので、コースの1日目ではない。
    // Day に数えると、受けなかった人の進み具合が最初から欠ける
    const check = COURSE.lessons.find((lesson) => lesson.id === "diagnosis")!;
    expect(check.number).toBe(0);
    expect(check.stageKey).toBe("orientation");
  });

  it("Day は1から続きの番号で並ぶ", () => {
    const days = COURSE.lessons.filter((lesson) => lesson.number > 0);
    expect(days.map((lesson) => lesson.number)).toEqual(
      [...days.map((lesson) => lesson.number)].sort((a, b) => a - b),
    );
    expect(days.every((lesson) => lesson.stageKey)).toBe(true);
  });

  it("コースから外した教材も、id からは引ける", () => {
    /*
      一覧から外したのと、行き先ごと消したのは別のこと。
      終えた人が学習記録から押したときに「ありません」になると、
      やったことを取り上げる形になる。
    */
    for (const id of ["make_plan", "improve_answer", "final_challenge"]) {
      expect(getLesson(id), `${id} が引けない`).not.toBeNull();
      expect(COURSE.lessons.some((lesson) => lesson.id === id)).toBe(false);
    }
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

  it("先に入っている既定値が、その質問の選択肢に無いことがない", () => {
    /*
      最初のお試しは、聞かなかった条件を `quickDefaults` が埋めて
      成立させている（useCourseLesson が `values` に書く）。その値は
      あとの画面まで残るので、同じキーを使う質問は**開いた時点で
      答えが入っている**。

      入っている値がその質問の選択肢のどれかなら、札が選ばれた形で
      出るので筋は通る。**選択肢に無い値**だと、札はどれも選ばれて
      いないのに `checkStep`（空かどうかしか見ない）は通ってしまい、
      必須なのに選ばずに次へ進める。

      Day3 でこれが起きた。「これがロール指定」と教えた直後の質問に
      `style` を流用したせいで、立場を選ばないまま、立場の無い依頼が
      AIへ送られていた。看板だけが残る。
    */
    for (const lesson of COURSE.lessons) {
      const quick = lesson.steps.find((step) => step.id === "quick_try");
      const defaults = (quick?.meta?.defaults ?? {}) as Record<string, string>;

      for (const step of lesson.steps) {
        if (step.id === "quick_try" || !step.required || !step.key) continue;
        if (!step.options) continue;

        const filled = defaults[step.key];
        if (!filled) continue;

        // 複数選べる回は「,」でつないだ形で持つ（Inputs.tsx と同じ読み方）
        const chosen =
          step.type === "multi_choice" ? filled.split(",").filter(Boolean) : [filled];
        const values = step.options.map((one) => one.value);

        for (const one of chosen) {
          expect(
            values,
            `${lesson.title}/${step.id} は「${one}」が先に入るのに、それが選択肢に無い`,
          ).toContain(one);
        }
      }
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
      /*
        AI技の名前は、**使って、違いを見たあと**に出す。

        観察より後、というだけでは足りなかった。以前はここが
        「観察 → 解説 → 条件を足す → 比べる」で、条件を足す前・
        比べる前に「〜とは」を読ませていた。何の役に立つのか
        分からないまま読む説明は、飛ばされるか、読んでも残らない。

        いまは 条件を足す → 結果が変わる → 見比べる → 「今のが〜です」。
        名前が、たったいま自分で起こした変化に貼り付く。
      */
      expect(
        kinds.indexOf("concept_card"),
        `${lesson.title} の解説が、比べるより前に出ている`,
      ).toBeGreaterThan(kinds.indexOf("result_compare"));

      // 比べた直後であること。1画面でも空くと「さっきの話」になる
      expect(
        kinds[kinds.indexOf("result_compare") + 1],
        `${lesson.title} の解説が、比べた直後に無い`,
      ).toBe("concept_card");
    }
  });


  it("解説が続いたら、そのあとは必ず操作へ戻る", () => {
    /*
      読むだけの画面が続いたあと、また読む画面が来ると講義になる。
      解説の連続が切れたところで、必ず手を動かす画面が来ること。

      解説そのものが続くのは止めない（骨格は3枚まで並べられる）。
      見るのは**連続の終わり**だけ。
    */
    const reading = new Set(["concept_card", "reflection", "completion"]);

    for (const lesson of COURSE.lessons) {
      const kinds = lesson.steps.map((step) => step.type);
      for (let index = 0; index < kinds.length; index += 1) {
        if (kinds[index] !== "concept_card") continue;
        if (kinds[index + 1] === "concept_card") continue; // まだ連続の途中

        const next = kinds[index + 1];
        expect(
          next !== undefined && !reading.has(next),
          `${lesson.title}/${lesson.steps[index].id} の後が「${next}」で、操作へ戻っていない`,
        ).toBe(true);
      }
    }
  });

  it("AI技の解説を、続けて2枚出さない", () => {
    /*
      新しい技を2つ続けて説明すると、どちらも身に付かないまま
      次へ行く。技は**使う直前**に1つずつ出す。

      骨格が最初に出す解説（concept_1〜3）は別。あれは同じ場面を
      3通りに言い換えたもので、新しい技を並べているのではない。
    */
    const fromSkeleton = (id: string) => /^concept_[123]$/.test(id);

    for (const lesson of COURSE.lessons) {
      for (let index = 0; index < lesson.steps.length - 1; index += 1) {
        const here = lesson.steps[index];
        const next = lesson.steps[index + 1];
        if (here.type !== "concept_card" || next.type !== "concept_card") continue;

        expect(
          fromSkeleton(here.id) && fromSkeleton(next.id),
          `${lesson.title} で解説が続いている（${here.id} → ${next.id}）`,
        ).toBe(true);
      }
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
    // 分母は主導線のぶん。任意の回は入っていない（下の2件が理由）
    expect(progress.total).toBeLessThan(REWRITE.steps.length);
    expect(progress.total).toBeGreaterThan(1);
  });

  it("**主導線だけで終えた人が「途中」に見えない**", () => {
    /*
      任意の回（「自分の文章でも試す？」から先）を分母に入れると、
      9画面をやり切った人が「9 / 19」で終わることになり、
      最後まで来たのに途中でやめたように見える。
    */
    const end = progressOf(REWRITE, "completion");

    expect(end.current).toBe(end.total);
  });

  it("任意の回へ入った人には、そのぶんも数える", () => {
    /*
      入った以上は道のりの一部。隠すと今度は
      「進んでいるのに増えない」になる。
    */
    const main = progressOf(REWRITE, "real_task_intro");
    const inside = progressOf(REWRITE, "real_task");

    expect(inside.total).toBeGreaterThan(main.total);
    expect(inside.total).toBe(REWRITE.steps.length);
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
    expect(isFreeValue(step, "新入社員")).toBe(false);
    expect(isFreeValue(step, "")).toBe(false);
  });
});

describe("AI へ渡す値", () => {
  it("教材の対応表どおりに詰め替える", () => {
    const step = REWRITE.steps.find((entry) => entry.id === "generate_first")!;
    const input = buildAiInput(step, {
      source_text: "もとの文章",
      instruction: "分かりやすくして",
      audience: "新入社員",
      tone: "やさしい口調で",
      length: "3行くらい",
    });

    expect(input).toEqual({
      original_text: "もとの文章",
      instruction: "分かりやすくして",
      audience: "新入社員",
      tone: "やさしい口調で",
      length: "3行くらい",
    });
  });

  it("まだ答えていない条件は、空のまま渡す", () => {
    /*
      Day1 の1回目がこの形。頼みかたしか選んでいないので、
      誰向けも口調も空で送る（サーバー側で行ごと落ちる）。
      ここで既定値が混ざると、2回目に足した条件の効きめが見えなくなる。
    */
    const step = REWRITE.steps.find((entry) => entry.id === "generate_first")!;

    expect(
      buildAiInput(step, {
        source_text: "もとの文章",
        instruction: "分かりやすくして",
      }),
    ).toEqual({
      original_text: "もとの文章",
      instruction: "分かりやすくして",
      audience: "",
      tone: "",
      length: "",
    });
  });

  it("AI を呼ばないステップからは何も作らない", () => {
    const step = REWRITE.steps.find((entry) => entry.id === "outcome_preview")!;
    expect(buildAiInput(step, { source_text: "x" })).toEqual({});
  });
});

describe("入力済みのまとめ", () => {
  it("現在地より前の、答えた分だけを出す", () => {
    /*
      `real_tone`（言い方を選ぶ回）に居るときの持ち物。

      自分の文章は**まだ書いていない**。条件と解説を自分の文章より
      前へ移したので、ここに来る時点では手元にあるのは
      「お試しで選んだ頼みかた」「足した条件」「誰向けか」の3つだけ。
      渡しても出ないことを見張る——出てしまうと、書いていない文章を
      「答えた」ことにしてしまう。
    */
    const summary = summaryOf(REWRITE, "real_tone", {
      instruction: "分かりやすくして",
      condition: "AI初心者向けに",
      audience: "新入社員",
      real_task_text: "自分の文章",
      // まだ答えていない
      tone: "",
    });

    expect(summary.map((entry) => entry.value)).toEqual([
      "分かりやすくして",
      "AI初心者向けに",
      "新入社員",
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
    /*
      札に書いてある言葉がそのまま出ること。

      文言は短くしたので（折り返し対策で「文章を書くことが多い」→
      「文章を書く」）、ここも合わせる。見ているのは**記号ではなく
      人の言葉が出るか**で、文言そのものではない。
    */
    expect(summary.map((entry) => entry.value)).toContain("文章を書く");
  });

  it("自分で書いた言葉は、そのまま出す", () => {
    // 選択肢のどれにも一致しない。書いた文字が答えそのもの。
    // 見るのは書いた**あと**の回（送る内容を確かめるところ）
    const summary = summaryOf(REWRITE, "prompt_preview", {
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
