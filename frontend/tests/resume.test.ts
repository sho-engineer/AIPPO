/**
 * 途中まで進めた教材を、もう一度ひらいたとき。
 *
 * 守りたいのは2つ。**下のほうが重い。**
 *
 *   1. 途中の人には、続きの選択が出る
 *   2. **それ以外の人には、出ない**
 *
 * 2つ目が重いのは、出す必要の無い問いが学びの前に1枚挟まるため。
 * ひらいてすぐ学べる人を、押す作業から始めさせない。
 *
 * もうひとつ、**出せないのに「つづきから」を並べない**。教材の並びが
 * 変わった控えは、`stepId` が生きていても続きの意味が変わっている。
 */

import { describe, expect, it } from "vitest";

import { getLesson } from "../src/course/catalog";
import {
  lessonRevision,
  ownerTag,
  resumeOffer,
  type ResumeInput,
} from "../src/course/resume";
import type { Draft } from "../src/lib/draft";

const DIAGNOSIS = getLesson("diagnosis")!;
const DAY1 = getLesson("rewrite_text")!;

function draftOf(
  lesson = DAY1,
  over: Partial<Draft> = {},
): Draft {
  return {
    version: 3,
    lessonId: lesson.id,
    stepId: lesson.steps[3].id,
    values: {},
    revision: lessonRevision(lesson),
    attempt: "a1",
    owner: "",
    updatedAt: Date.now(),
    ...over,
  };
}

const ask = (over: Partial<ResumeInput> = {}) =>
  resumeOffer({
    lesson: DAY1,
    draft: draftOf(),
    owner: "",
    completed: [],
    ...over,
  });

describe("出すかどうか", () => {
  it("途中まで進めていれば、出す", () => {
    expect(ask()).not.toBeNull();
  });

  it("控えが無ければ出さない（まだ始めていない）", () => {
    expect(ask({ draft: null })).toBeNull();
  });

  it("最初の回に居るだけなら出さない", () => {
    /*
      ひらいて何もせずに閉じた人。控えはあるが、続きも何も無い。
    */
    expect(
      ask({ draft: draftOf(DAY1, { stepId: DAY1.steps[0].id }) }),
    ).toBeNull();
  });

  it("終えた教材では出さない", () => {
    // 結果と復習の導線は、完了画面がそのまま持っている
    expect(ask({ completed: ["rewrite_text"] })).toBeNull();
  });

  it("別のアカウントの控えには、触れも見せもしない", () => {
    expect(ask({ draft: draftOf(DAY1, { owner: "someone" }), owner: "me" }))
      .toBeNull();
  });

  it("ゲストで進めた控えは、登録したあとも自分のものとして出す", () => {
    /*
      登録の直前まで進めた続きは、その人自身のもの。持ち主が付いて
      いない控え（ゲスト・古い版）は、いまの人のものとして読む。
    */
    expect(ask({ draft: draftOf(DAY1, { owner: "" }), owner: "me" }))
      .not.toBeNull();
  });
});

describe("復元できないとき", () => {
  it("教材の並びが変わっていたら、つづきからを出さない", () => {
    const offer = ask({ draft: draftOf(DAY1, { revision: "ちがう版" }) });

    expect(offer?.canResume).toBe(false);
    expect(offer?.blocked).toContain("最初から");
  });

  it("控えの回が、いまの教材に無いときも同じ", () => {
    const offer = ask({
      draft: draftOf(DAY1, { revision: undefined, stepId: "もう無い回" }),
    });

    expect(offer?.canResume).toBe(false);
  });

  it("版を持っていない古い控えは、それだけでは止めない", () => {
    /*
      「分からない」であって「違う」ではない。ここで止めると、
      版を上げた日に途中の人全員の続きが消える。
    */
    const offer = ask({ draft: draftOf(DAY1, { revision: undefined }) });

    expect(offer?.canResume).toBe(true);
  });
});

describe("何と言うか", () => {
  it("診断は、答えた数と次の問いを出す", () => {
    /*
      数は教材から数える。書き写すと、問いを1つ足した日に**画面だけが
      古い数を言う**。
    */
    const offer = resumeOffer({
      lesson: DIAGNOSIS,
      draft: draftOf(DIAGNOSIS, {
        stepId: "match_purpose",
        values: { ai_usage: "tried", ask_style: "short", build_prompt: "x" },
      }),
      owner: "",
      completed: [],
    });

    expect(offer!.headline).toBe("AI活用診断");
    expect(offer!.lines[0]).toBe("全5問中、3問回答済み");
    expect(offer!.lines[1]).toBe("質問4から再開できます");
  });

  it("全問そろっていれば、結果へ進めると言う", () => {
    const values = Object.fromEntries(
      DIAGNOSIS.steps.filter((s) => s.key).map((s) => [s.key as string, "x"]),
    );
    const offer = resumeOffer({
      lesson: DIAGNOSIS,
      draft: draftOf(DIAGNOSIS, { stepId: "result", values }),
      owner: "",
      completed: [],
    });

    expect(offer!.lines[0]).toBe("全5問に回答済み");
    expect(offer!.lines[1]).toContain("結果");
  });

  it("レッスンは、Day の番号と章の名前で言う", () => {
    const day2 = getLesson("summarize_text")!;
    const section = day2.steps.find((s) => s.type === "section_transition")!;
    const after = day2.steps[day2.steps.indexOf(section) + 1];

    const offer = resumeOffer({
      lesson: day2,
      draft: draftOf(day2, { stepId: after.id }),
      owner: "",
      completed: [],
    });

    expect(offer!.headline).toBe(`Day${day2.number} ${day2.title}`);
    expect(offer!.lines[0]).toBe(`「${section.title}」の途中です`);
  });
});

describe("教材の版", () => {
  it("回の並びが同じなら、同じ版", () => {
    expect(lessonRevision(DAY1)).toBe(lessonRevision({ ...DAY1 }));
  });

  it("回を足したら、別の版になる", () => {
    const grown = { ...DAY1, steps: [...DAY1.steps, DAY1.steps[0]] };

    expect(lessonRevision(grown)).not.toBe(lessonRevision(DAY1));
  });

  it("文言を直しただけでは、版を変えない", () => {
    /*
      誤字を1つ直した日に、途中の人全員の続きが消えてはいけない。
      ずれるのは「続きの場所」で、言い回しはずれても意味が変わらない。
    */
    const reworded = {
      ...DAY1,
      steps: DAY1.steps.map((step) => ({ ...step, title: `${step.title}！` })),
    };

    expect(lessonRevision(reworded)).toBe(lessonRevision(DAY1));
  });
});

describe("持ち主の印", () => {
  it("ゲストは空", () => {
    expect(ownerTag(null)).toBe("");
  });

  it("同じ人なら、同じ印", () => {
    expect(ownerTag({ email: "a@example.com" })).toBe(
      ownerTag({ email: "a@example.com" }),
    );
  });

  it("違う人なら、違う印", () => {
    expect(ownerTag({ email: "a@example.com" })).not.toBe(
      ownerTag({ email: "b@example.com" }),
    );
  });

  it("メールそのものは残さない", () => {
    // 端末に置くのは読み戻せない短い印だけ
    expect(ownerTag({ email: "a@example.com" })).not.toContain("a@");
    expect(ownerTag({ email: "a@example.com" })).not.toContain("example");
  });
});
