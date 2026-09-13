/**
 * Day2「長い文章を短くまとめる」の中身。
 *
 * ここで見るのは**教材データそのもの**——並び・題材・条件・AIへの
 * 頼み方。画面の振る舞いは `useCourseLesson.test.tsx` と
 * `e2e/day2.spec.ts` が見る。
 *
 * なぜ教材データを検査するか
 * --------------------------
 * Day2 は4回AIを呼び、段ごとに条件を1つずつ足す。**足す順と、足した
 * ものが次の回にも残っていること**がこの教材の骨で、そこが崩れると
 * 「条件を足したら変わった」という体験そのものが起きない。
 * 画面を通さずに読み取れることは、ここで先に止める。
 */

import { describe, expect, it } from "vitest";

import { getLesson } from "../src/course/catalog";
import { DAY2_FALLBACK, DAY2_SOURCE } from "../src/course/day2Steps";
import { buildAiInput } from "../src/course/engine";
import type { LessonStep } from "../src/course/types";

const DAY2 = getLesson("summarize_text")!;
const steps = DAY2.steps;
const byId = (id: string): LessonStep => {
  const found = steps.find((step) => step.id === id);
  if (!found) throw new Error(`Day2 に ${id} が無い`);
  return found;
};
const at = (id: string) => steps.findIndex((step) => step.id === id);

describe("Day2 の並び", () => {
  it("4つの段に分かれている", () => {
    const covers = steps.filter((step) => step.type === "section_transition");

    expect(covers.map((step) => step.title)).toEqual([
      "まず短くしてみよう",
      "読みやすい形に変えよう",
      "読む目的を伝えよう",
      "自分の文章で試そう",
    ]);
    covers.forEach((cover, index) => {
      expect((cover.meta as { sectionNumber?: number }).sectionNumber).toBe(index + 1);
    });
  });

  it("AIを呼ぶのは4回。段ごとに1回ずつ", () => {
    /*
      3回だと、形と目的のどちらが効いたのか分からない。5回にすると
      同じ待ち時間がもう一度増える。**1つ足すごとに1回**送る。
    */
    const sends = steps.filter((step) => step.type === "ai_generate");

    expect(sends).toHaveLength(4);
    expect(sends.map((step) => step.phase)).toEqual([
      "try",
      "compare",
      "deepen",
      "own",
    ]);
  });

  it("操作が先、説明はあと", () => {
    /*
      技の名前を受け取るのは、その技を使った**あと**。読ませてから
      使わせると、使うのは読んだことの確認になる。
    */
    expect(at("concept_summary")).toBeGreaterThan(at("see_basic"));
    expect(at("concept_format")).toBeGreaterThan(at("see_format"));
    expect(at("concept_context")).toBeGreaterThan(at("see_context"));
  });

  it("解説が2枚続かない", () => {
    for (let index = 0; index < steps.length - 1; index += 1) {
      if (steps[index].type !== "concept_card") continue;
      expect(
        steps[index + 1].type,
        `${steps[index].id} の次がまた解説`,
      ).not.toBe("concept_card");
    }
  });

  it("待ち時間を作らない", () => {
    /*
      偽の待機は入れない。送っているあいだに出すのは、そのとき何を
      しているかの1行だけ。
    */
    for (const step of steps.filter((one) => one.type === "ai_generate")) {
      const meta = step.meta as { waiting?: string };
      expect(meta.waiting, `${step.id} に一行が無い`).toBeTruthy();
    }
  });
});

describe("題材", () => {
  it("架空の資料だと分かる名札を付けて出す", () => {
    /*
      実在の調査と読み違えられると、**この数字を仕事で引用する人が
      出る**。題材を出す画面には必ず名札を付ける。
    */
    const meta = byId("read_source").meta as {
      sampleText?: string;
      sourceLabel?: string;
    };

    expect(meta.sampleText).toBe(DAY2_SOURCE);
    expect(meta.sourceLabel).toContain("Lesson用サンプル");
  });

  it("カードの中で送らせない（頭だけ出して、全文は別の一枚）", () => {
    const meta = byId("read_source").meta as { sourcePreview?: boolean };

    expect(meta.sourcePreview).toBe(true);
  });

  it("判断に使う数字が、題材にそろっている", () => {
    /*
      Section 3 で「上司の判断に必要な情報が残った」と言うためには、
      **元の文章に残すべき数字がある**必要がある。題材から数字が
      抜けると、あの段は何も見せられない。
    */
    for (const fact of ["68％", "54％", "62％", "20名", "1か月", "検索時間", "利用率"]) {
      expect(DAY2_SOURCE, `題材に「${fact}」が無い`).toContain(fact);
    }
  });

  it("自分の文章が無い人にも、例文がある", () => {
    const meta = byId("own_text").meta as { fallbackSample?: string };

    expect(meta.fallbackSample).toBe(DAY2_FALLBACK);
    // 例文も架空。実在の研修と読み違えられないこと
    expect(DAY2_FALLBACK.length).toBeGreaterThan(100);
  });

  it("自分の文章の回は、空では送れない", () => {
    expect(byId("own_text").required).toBe(true);
  });
});

describe("条件の積み上がり", () => {
  it("1回目は条件を付けずに送る", () => {
    /*
      ここが比べる基準になる。1回目から条件が入っていると、そのあと
      何を足しても「足したから変わった」と言えない。
    */
    const input = buildAiInput(byId("read_source"), { source_text: DAY2_SOURCE });

    expect(input.original_text).toBe(DAY2_SOURCE);
    expect(input.format).toBe("");
    expect(input.purpose).toBe("");
  });

  it("2回目は形だけが足される", () => {
    const values = { source_text: DAY2_SOURCE, format: "3つの箇条書きで" };
    const input = buildAiInput(byId("generate_format"), values);

    expect(input.format).toBe("3つの箇条書きで");
    expect(input.purpose).toBe("");
  });

  it("3回目は、形を残したまま読む人と目的が足される", () => {
    /*
      **前の条件を捨てない。** 捨てると、3回目に起きた変化が
      「目的を足したから」なのか「形が外れたから」なのか分からない。
    */
    const values = {
      source_text: DAY2_SOURCE,
      format: "3つの箇条書きで",
      purpose: "新しいツールを試すか判断する上司向けに",
    };
    const input = buildAiInput(byId("generate_context"), values);

    expect(input.format).toBe("3つの箇条書きで");
    expect(input.purpose).toBe("新しいツールを試すか判断する上司向けに");
  });

  it("自分の文章の回は、別の鍵で3つとも渡す", () => {
    /*
      固定の題材で選んだ条件を、自分の文章にそのまま持ち込まない。
      鍵を分けてあるので、最後の段では自分で選び直すことになる。
    */
    const values = {
      source_text: DAY2_SOURCE,
      format: "3つの箇条書きで",
      purpose: "新しいツールを試すか判断する上司向けに",
      real_task_text: "自分の長い文章",
      own_audience: "上司",
      own_purpose: "やるかどうか判断するため",
      own_format: "3行の文章で",
    };
    const input = buildAiInput(byId("generate_own"), values);

    expect(input.original_text).toBe("自分の長い文章");
    expect(input.audience).toBe("上司");
    expect(input.purpose).toBe("やるかどうか判断するため");
    expect(input.format).toBe("3行の文章で");
  });

  it("4回とも同じ頼み方（`summarize`）で送る", () => {
    for (const step of steps.filter((one) => one.aiAction)) {
      expect(step.aiAction!.action, `${step.id}`).toBe("summarize");
    }
  });
});

describe("比べ方", () => {
  it("1回目の結果は比べない。返ってきたものだけを出す", () => {
    const meta = byId("see_basic").meta as {
      resultOnly?: boolean;
      changesOnly?: boolean;
    };

    expect(meta.resultOnly).toBe(true);
    expect(meta.changesOnly ?? false).toBe(false);
  });

  it("2回目・3回目は、1つ前のまとめと突き合わせる", () => {
    /*
      元の資料（300字）と結果（3行）では、対応する文が取れない。
      見せたいのは「まとめ方が変わったこと」なので、前のまとめと比べる。
    */
    for (const id of ["see_format", "see_context"]) {
      const meta = byId(id).meta as {
        changesOnly?: boolean;
        compareWithPrevious?: boolean;
        changedLabel?: string;
        changedKey?: string;
        changedNote?: string;
      };

      expect(meta.changesOnly, id).toBe(true);
      expect(meta.compareWithPrevious, id).toBe(true);
      // 「何を変えた？」「どう変わった？」の2行が、教材側にある
      expect(meta.changedLabel, id).toBeTruthy();
      expect(meta.changedNote, id).toBeTruthy();
      // 足した条件は、その段で書いた鍵から引く
      expect(meta.changedKey, id).toBeTruthy();
    }
  });

  it("足した条件の鍵が、その段で聞いた鍵と同じ", () => {
    /*
      ここがずれると「何を変えた？」に空が出る。画面では気づきにくい
      （空の行が出るだけ）ので、データの側で止める。
    */
    const pairs: [string, string][] = [
      ["see_format", "add_format"],
      ["see_context", "add_context"],
    ];

    for (const [result, question] of pairs) {
      const meta = byId(result).meta as { changedKey?: string };
      expect(meta.changedKey, result).toBe(byId(question).key);
    }
  });

  it("自分の文章の結果には、指定した3つを並べる", () => {
    const meta = byId("own_result").meta as {
      resultOnly?: boolean;
      showConditions?: boolean;
      editStep?: string;
    };

    expect(meta.resultOnly).toBe(true);
    expect(meta.showConditions).toBe(true);
  });

  it("結果から、条件へ戻れる", () => {
    /*
      出てきたものを読んだあとで直したくなる。押す先が「完了」しか
      無いと、直すには戻るボタンを4回押すことになる。
    */
    const meta = byId("own_result").meta as { editStep?: string };

    expect(meta.editStep).toBe("own_reader");
    expect(steps.some((step) => step.id === meta.editStep)).toBe(true);
    // 戻る先は、条件を聞く3画面の先頭であること
    expect(at(meta.editStep!)).toBeLessThan(at("own_format"));
  });
});

describe("技の渡し方", () => {
  it("3つを、最後に1回まとめて受け取る", () => {
    /*
      途中で1つずつ祝うと、そのたびに学習が止まる。名前は使った場所で
      言い、受け取るのは最後に1度。
    */
    const recap = byId("skills_recap").meta as {
      recap?: { name: string; body: string }[];
    };

    expect(recap.recap?.map((one) => one.name)).toEqual([
      "要約",
      "出力形式の指定",
      "コンテキスト",
    ]);
  });

  it("受け取る3つが、教材が名乗る3つと同じ", () => {
    const recap = byId("skills_recap").meta as { recap?: { name: string }[] };

    expect(recap.recap?.map((one) => one.name)).toEqual(DAY2.learnedSkills);
  });

  it("途中の解説は、名前を言うだけ（受け取る演出は出さない）", () => {
    for (const id of ["concept_summary", "concept_format", "concept_context"]) {
      const meta = byId(id).meta as { silentSkill?: string };
      expect(meta.silentSkill, id).toBeTruthy();
      // 途中の解説は必ず飛ばせる。読みたくない人を足止めしない
      expect(byId(id).skippable, id).toBe(true);
    }
  });

  it("仕事でそのまま使える形が、完了画面に残る", () => {
    const meta = byId("completion").meta as { reusablePrompt?: string };

    expect(meta.reusablePrompt).toBeTruthy();
    // 読む人・目的・形の3つが埋める場所として入っている
    expect((meta.reusablePrompt!.match(/〇〇/g) ?? []).length).toBe(3);
  });
});

describe("自分の文章を飛ばした人", () => {
  /*
    「今回はスキップする」の先には、入れたはずの文章を送る画面が
    並んでいる。1歩進めるだけだと、条件を選ばされ、確認の画面まで来て
    **空の本文を AI へ送る**ことになる（実測で `original_text: ""`）。
    本物のサーバーは本文が空の依頼を弾くので、飛ばした人だけが
    自分のせいではない失敗の画面に出る。
  */
  it("行き先が書いてあり、その先で文章を使わない", () => {
    const meta = byId("own_text").meta as { skipTo?: string };
    expect(meta.skipTo, "飛ばす先が書いていない").toBeTruthy();

    const landing = at(meta.skipTo!);
    expect(landing, `${meta.skipTo} が教材に無い`).toBeGreaterThan(0);

    // 飛んだ先から完了まで、AI へ送る画面が1つも無い
    for (const step of steps.slice(landing)) {
      expect(step.aiAction, `${step.id} で、また送ろうとしている`).toBeUndefined();
    }
  });

  it("飛ばしても、3つの技は受け取れる", () => {
    const meta = byId("own_text").meta as { skipTo?: string };
    expect(meta.skipTo).toBe("skills_recap");
  });
});
