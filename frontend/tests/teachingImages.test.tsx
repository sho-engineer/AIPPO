/**
 * 教材の絵（Day1）。
 *
 * 絵そのものが教材なので、見張るのは**出し方**と**出す順**。
 *
 *   1. 切り取らないこと（1枚で説明が完結している）
 *   2. 390px の画面からはみ出さないこと
 *   3. 比べる図を、試す前に出さないこと
 *   4. 解説の絵を続けて2枚出さないこと
 *   5. 絵があるとき、同じことを本文の図でもう一度出さないこと
 */

import { existsSync, readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConceptCardView } from "../src/components/course/steps/ConceptCard";
import { TeachingImage } from "../src/components/lessons/TeachingImage";
import { getLesson } from "../src/course/catalog";
import {
  ALL_COURSE_IMAGES,
  ALL_TEACHING_IMAGES,
  courseImage,
  teachingImage,
} from "../src/course/teachingImages";

const DAY1 = "rewrite_text";
const DAY2 = "summarize_text";
const DAY3 = "explain_topic";

/**
 * WebP の実寸を、ファイルの先頭から読む。
 *
 * 絵を差し替えたのに `teachingImages.ts` の実寸を直し忘れる、が
 * いちばん起きやすい。画面には正しい絵が出るので、**目では気づけない**。
 * 気づくのは、読み終わりに下の文とボタンが飛ぶ人になる。
 *
 * 教材の絵はすべて可逆（VP8L）で置いてある。読むのはその1形式だけ。
 * 別の形式が混じったら、そこで落として気づけるようにする。
 */
function webpSize(path: string): { width: number; height: number } {
  const file = readFileSync(path);
  const kind = file.toString("ascii", 12, 16);
  if (kind !== "VP8L") {
    throw new Error(`${path} が可逆WebP（VP8L）ではない: ${kind}`);
  }
  /*
    VP8L は 21バイト目から、幅-1 を14ビット、高さ-1 を14ビット、
    下位ビットから詰めてある。
  */
  const bits = file.readUInt32LE(21);
  return {
    width: (bits & 0x3fff) + 1,
    height: ((bits >> 14) & 0x3fff) + 1,
  };
}

describe("出し方", () => {
  it("幅は親いっぱい、比はその絵のまま、切り取らない", () => {
    render(<TeachingImage src="/assets/teaching/day1_overview.webp" alt="ずかい" />);

    const image = screen.getByAltText("ずかい");
    expect(image).toHaveClass("w-full", "max-w-full", "h-auto", "object-contain", "block");
    // 比を保つ。読み込み前の場所取りにも効く
    expect(image.style.aspectRatio).toBe("1536 / 1024");
  });

  it("比の違う絵は、その絵の比で場所を取る", () => {
    /*
      前は `aspect-[3/2]` と決め打っていた。比の違う絵に差し替えると、
      読み込み前だけ 3:2 で場所を取り、読み終わりに箱の高さが変わって
      下の文とボタンが飛ぶ（CLS）。
    */
    render(<TeachingImage src="/x.webp" alt="ましかく" width={1219} height={1231} />);

    const image = screen.getByAltText("ましかく");
    expect(image.style.aspectRatio).toBe("1219 / 1231");
    expect(image).toHaveAttribute("width", "1219");
    expect(image).toHaveAttribute("height", "1231");
  });

  it("読み込む前から高さが決まっている", () => {
    // 決まっていないと、読み終わりに下の文とボタンが飛ぶ（CLS）
    render(<TeachingImage src="/x.webp" alt="ずかい" />);

    const image = screen.getByAltText("ずかい");
    expect(image).toHaveAttribute("width", "1536");
    expect(image).toHaveAttribute("height", "1024");
  });

  it("横へはみ出さないよう、外側で隠す", () => {
    render(<TeachingImage src="/x.webp" alt="ずかい" />);

    expect(screen.getByTestId("teaching-image")).toHaveClass(
      "overflow-hidden",
      "w-full",
      "max-w-full",
    );
  });

  it("何の図かを、読み上げにも渡す", () => {
    /*
      ここは飾りではなく中身。見えない人に「何の図か」が
      伝わらないと、そのぶんだけ教材が欠ける。
    */
    for (const [, entry] of Object.entries({ a: teachingImage(DAY1, "concept_1") })) {
      expect(entry?.alt.length ?? 0).toBeGreaterThan(10);
    }
  });
});

describe("Day1 のどこに出るか", () => {
  const lesson = getLesson(DAY1)!;
  const order = lesson.steps.map((step) => step.id);
  const at = (stepId: string) => order.indexOf(stepId);

  it("5枚が、それぞれの画面に割り当たっている", () => {
    const placed = order.filter((id) => teachingImage(DAY1, id) !== null);

    expect(placed).toEqual([
      "outcome_preview",
      "compare_results",
      "concept_1",
      "concept_tone",
      "concept_iteration",
    ]);
  });

  it("比べる図は、一度試して条件を足したあとに出る", () => {
    /*
      先に出すと、答えを見てから確かめる作業になる。
      **必ず** 試す → 条件を足す → 送る、のあとに来ること。
    */
    expect(at("compare_results")).toBeGreaterThan(at("quick_try"));
    expect(at("compare_results")).toBeGreaterThan(at("add_condition"));
    expect(at("compare_results")).toBeGreaterThan(at("generate_improved"));
  });

  it("解説の絵は、比べた直後に出る", () => {
    /*
      AI技の名前は、**使って、違いを見たあと**に出す。
      あいだに1画面でも挟むと「さっきの話」になってしまう。
    */
    expect(at("concept_1") - at("compare_results")).toBe(1);
  });

  it("解説の絵を続けて2枚出さない", () => {
    /*
      見張るのは**解説どうし**が続くこと。読み下す画面が2つ続くと
      手が止まる。

      「比べる図 → 解説の絵」だけは続いてよい。あれは2つの教材では
      なく、**見比べて、その名前を知る**というひとつながりの流れで、
      あいだに何か挟むほうが切れてしまう。
    */
    const slides = order
      .map((id, index) => ({ id, index, type: teachingImage(DAY1, id)?.visualType }))
      .filter((entry) => entry.type === "skill_concept");

    for (let i = 0; i < slides.length - 1; i += 1) {
      expect(
        slides[i + 1].index - slides[i].index,
        `${slides[i].id} と ${slides[i + 1].id} が隣り合っている`,
      ).toBeGreaterThan(1);
    }
  });

  it("トーン指定は、トーンを選ぶ直前に出る", () => {
    // 技は、使う直前に出す
    expect(at("real_tone") - at("concept_tone")).toBe(1);
  });

  it("反復は、自分の文章を送る直前に出る", () => {
    expect(at("prompt_preview") - at("concept_iteration")).toBe(1);
  });

  it("画像だけの画面を増やしていない", () => {
    // 絵は既にある画面に添える。5枚のために5画面を足さない
    for (const id of ["outcome_preview", "compare_results"]) {
      expect(order).toContain(id);
    }
    expect(order).toHaveLength(19);
  });
});

describe("Day2 のどこに出るか", () => {
  const lesson = getLesson(DAY2)!;
  const order = lesson.steps.map((step) => step.id);
  const at = (stepId: string) => order.indexOf(stepId);

  it("5枚が、それぞれの画面に割り当たっている", () => {
    const placed = order.filter((id) => teachingImage(DAY2, id) !== null);

    expect(placed).toEqual([
      "outcome_preview",
      "compare_results",
      "concept_1",
      "concept_output_format",
      "concept_context",
    ]);
  });

  it("比べる図は、一度試して条件を足したあとに出る", () => {
    expect(at("compare_results")).toBeGreaterThan(at("quick_try"));
    expect(at("compare_results")).toBeGreaterThan(at("add_condition"));
    expect(at("compare_results")).toBeGreaterThan(at("generate_improved"));
  });

  it("解説の絵は、比べた直後に出る", () => {
    expect(at("concept_1") - at("compare_results")).toBe(1);
  });

  it("解説の絵を続けて2枚出さない", () => {
    /*
      見張るのは**解説どうし**が続くこと。読み下す画面が2つ続くと
      手が止まる。

      「比べる図 → 解説の絵」だけは続いてよい。あれは2つの教材では
      なく、**見比べて、その名前を知る**というひとつながりの流れで、
      あいだに何か挟むほうが切れてしまう。
    */
    const slides = order
      .map((id, index) => ({ id, index, type: teachingImage(DAY2, id)?.visualType }))
      .filter((entry) => entry.type === "skill_concept");

    for (let i = 0; i < slides.length - 1; i += 1) {
      expect(
        slides[i + 1].index - slides[i].index,
        `${slides[i].id} と ${slides[i + 1].id} が隣り合っている`,
      ).toBeGreaterThan(1);
    }
  });

  it("出力形式の指定は、形を選ぶ直前に出る", () => {
    expect(at("real_format") - at("concept_output_format")).toBe(1);
  });

  it("コンテキストは、目的を足す直前に出る", () => {
    expect(at("real_purpose") - at("concept_context")).toBe(1);
  });

  it("出力形式の指定を、コンテキストより先に出す", () => {
    // 直前の比較で見たのが「3つの箇条書きで」の効果なので、そこから続ける
    expect(at("concept_output_format")).toBeLessThan(at("concept_context"));
  });

  it("画像だけの画面を増やしていない", () => {
    for (const id of ["outcome_preview", "compare_results"]) {
      expect(order).toContain(id);
    }
    expect(order).toHaveLength(19);
  });
});

describe("表に載せた絵が、実際にあること", () => {
  it("指している道筋のファイルが public/ に置いてある", () => {
    /*
      **表に1行足しただけで、絵を置き忘れる**のがいちばん起きやすい。
      画面には壊れた絵の枠が出るが、検査はどれも通ってしまう。

      逆（置いたのに表へ足さない）は、絵が出ないだけで壊れて見えない
      ので、ここでは見ない。
    */
    const missing = [
      ...ALL_TEACHING_IMAGES.map((entry) => ({
        where: `${entry.lessonId}/${entry.stepId}`,
        src: entry.src,
      })),
      // コースの絵はレッスンの表に入っていない。別に持っているので
      // 別に見る——片方だけ見ると、もう片方が黙って抜ける
      ...ALL_COURSE_IMAGES.map((entry) => ({
        where: `コース ${entry.courseId}`,
        src: entry.src,
      })),
    ]
      .filter((entry) => !existsSync(`public${entry.src}`))
      .map((entry) => `${entry.where} → ${entry.src}`);

    expect(missing, `置き忘れている絵:\n${missing.join("\n")}`).toEqual([]);
  });

  it("絵の種類が、置き場所と食い違っていない", () => {
    /*
      種類（visualType）は画面が出し分けに使う。置き場所と合っていないと、
      比べる図が解説として出る、といったことが起きる。
      種類は書き手が毎回選ぶものではなく、**置き場所から決まる**。
    */
    for (const entry of ALL_TEACHING_IMAGES) {
      const expected = entry.stepId === "outcome_preview"
        ? "lesson_overview"
        : entry.stepId === "intro"
          ? "diagnosis_overview"
          : entry.stepId.startsWith("compare_")
            ? "compare"
            : "skill_concept";

      expect(entry.visualType, `${entry.lessonId}/${entry.stepId}`).toBe(expected);
    }

    for (const entry of ALL_COURSE_IMAGES) {
      expect(entry.visualType, entry.courseId).toBe("course_overview");
    }
  });

  it("表に書いた実寸が、置いてあるファイルと合っている", () => {
    /*
      合っていないと、読み込む前と後で箱の高さが変わって、下の文と
      ボタンが飛ぶ（CLS）。**絵を差し替えて数字を直し忘れる**のが
      いちばん起きやすく、画面を見ても気づけない。

      書いていない絵は既定（3:2 = 1536×1024）で場所を取るので、
      その比と合っているかを見る。実寸そのものは違ってよい——
      効くのは比だけで、幅は親いっぱいに決まる。
    */
    const wrong: string[] = [];
    for (const entry of [
      ...ALL_TEACHING_IMAGES.map((one) => ({
        where: `${one.lessonId}/${one.stepId}`,
        ...one,
      })),
      ...ALL_COURSE_IMAGES.map((one) => ({ where: `コース ${one.courseId}`, ...one })),
    ]) {
      const real = webpSize(`public${entry.src}`);

      if (entry.width !== undefined || entry.height !== undefined) {
        if (entry.width !== real.width || entry.height !== real.height) {
          wrong.push(
            `${entry.where}: 表は ${entry.width}×${entry.height}、` +
              `ファイルは ${real.width}×${real.height}`,
          );
        }
        continue;
      }

      // 実寸を書いていない絵は、既定の 3:2 であること
      const ratio = real.width / real.height;
      if (Math.abs(ratio - 1536 / 1024) > 0.01) {
        wrong.push(
          `${entry.where}: 3:2 ではない（${real.width}×${real.height}）のに実寸を書いていない`,
        );
      }
    }

    expect(wrong, `実寸が合っていない絵:\n${wrong.join("\n")}`).toEqual([]);
  });

  it("コース全体の絵と、現在地チェックの絵がある", () => {
    // 今回いちばん足したかった2枚。表から消えたらここで気づく
    expect(courseImage("first_step_7days")?.visualType).toBe("course_overview");
    expect(teachingImage("diagnosis", "intro")?.visualType).toBe(
      "diagnosis_overview",
    );
  });

  it("何の図かを、読み上げにも渡している", () => {
    // ここは飾りではなく中身。見えない人に伝わらないと、教材が欠ける
    for (const entry of ALL_TEACHING_IMAGES) {
      expect(
        entry.alt.length,
        `${entry.lessonId}/${entry.stepId} の説明が短い`,
      ).toBeGreaterThan(20);
    }
  });
});

describe("Day3 のどこに出るか", () => {
  const lesson = getLesson(DAY3)!;
  const order = lesson.steps.map((step) => step.id);
  const at = (stepId: string) => order.indexOf(stepId);

  it("5枚が、それぞれの画面に割り当たっている", () => {
    const placed = order.filter((id) => teachingImage(DAY3, id) !== null);

    expect(placed).toEqual([
      "outcome_preview",
      "compare_results",
      "concept_1",
      "concept_role",
      "concept_followup",
    ]);
  });

  it("解説の絵を続けて2枚出さない", () => {
    /*
      見張るのは**解説どうし**が続くこと。読み下す画面が2つ続くと
      手が止まる。

      「比べる図 → 解説の絵」だけは続いてよい。あれは2つの教材では
      なく、**見比べて、その名前を知る**というひとつながりの流れで、
      あいだに何か挟むほうが切れてしまう。
    */
    const slides = order
      .map((id, index) => ({ id, index, type: teachingImage(DAY3, id)?.visualType }))
      .filter((entry) => entry.type === "skill_concept");

    for (let i = 0; i < slides.length - 1; i += 1) {
      expect(
        slides[i + 1].index - slides[i].index,
        `${slides[i].id} と ${slides[i + 1].id} が隣り合っている`,
      ).toBeGreaterThan(1);
    }
  });

  it("ターゲット指定は、Day1 と同じ1枚を使う", () => {
    /*
      同じ技に別の絵を用意すると、**同じものだと気づけない**
      ——2つ目の技として数えられてしまう。
    */
    expect(teachingImage(DAY3, "concept_1")?.src).toBe(
      teachingImage(DAY1, "concept_1")?.src,
    );
  });

  it("比べる図は、一度試して条件を足したあとに出る", () => {
    expect(at("compare_results")).toBeGreaterThan(at("quick_try"));
    expect(at("compare_results")).toBeGreaterThan(at("add_condition"));
    expect(at("compare_results")).toBeGreaterThan(at("generate_improved"));
  });

  it("解説の絵は、比べた直後に出る", () => {
    /*
      AI技の名前は、**使って、違いを見たあと**に出す。
      あいだに1画面でも挟むと「さっきの話」になってしまう。
    */
    expect(at("concept_1") - at("compare_results")).toBe(1);
  });

  it("解説を続けて2枚出さない", () => {
    const cards = order
      .map((id, index) => ({ id, index }))
      .filter((entry) => lesson.steps[entry.index].type === "concept_card");

    for (let i = 0; i < cards.length - 1; i += 1) {
      expect(
        cards[i + 1].index - cards[i].index,
        `${cards[i].id} と ${cards[i + 1].id} が隣り合っている`,
      ).toBeGreaterThan(1);
    }
  });

  it("ロール指定は、立場を選ぶ直前に出る", () => {
    expect(at("real_role") - at("concept_role")).toBe(1);
  });

  it("追加質問は、聞き返しを足す直前に出る", () => {
    expect(at("real_followup") - at("concept_followup")).toBe(1);
  });

  it("技を出したら、必ずそれを使う画面が来る", () => {
    /*
      「これがロール指定」と言っておきながら使う場面が無い、という
      看板倒れにしない。立場も聞き返しも、実際にAIへ届く。
    */
    const role = lesson.steps.find((step) => step.id === "real_role")!;
    const followup = lesson.steps.find((step) => step.id === "real_followup")!;
    expect(role.options?.map((one) => one.label)).toContain("先生として");
    expect(followup.key).toBe("followup");

    const sends = lesson.steps.find((step) => step.id === "generate_real")!;
    const inputs = Object.keys(sends.aiAction?.inputs ?? {});
    expect(inputs).toContain("role");
    expect(inputs).toContain("followup");
  });

  it("立場は、選ばないと進めない", () => {
    /*
      いちど「これがロール指定」と教えた直後の1問なので、
      選ばずに素通りできてはいけない。
    */
    const role = lesson.steps.find((step) => step.id === "real_role")!;
    expect(role.required).toBe(true);
    expect(role.key).toBe("role");
  });

  it("聞き返しは、答えなくても進める", () => {
    // 聞きたいことが無い人を、ここで止めない
    const followup = lesson.steps.find((step) => step.id === "real_followup")!;
    expect(followup.required ?? false).toBe(false);
    expect(followup.options?.some((one) => one.value === "")).toBe(true);
  });

  it("画像だけの画面を増やしていない", () => {
    for (const id of ["outcome_preview", "compare_results"]) {
      expect(order).toContain(id);
    }
    expect(order).toHaveLength(20);
  });
});

describe("本文と重ねない", () => {
  const card = getLesson(DAY1)!.steps.find((step) => step.id === "concept_tone")!.card!;
  const day2Card = getLesson(DAY2)!.steps.find(
    (step) => step.id === "concept_context",
  )!.card!;

  it("Day2 も同じで、絵があるときは図を出さない", () => {
    render(
      <ConceptCardView
        card={day2Card}
        image={teachingImage(DAY2, "concept_context")}
        headingShown
      />,
    );

    expect(screen.getByTestId("teaching-image")).toBeInTheDocument();
    // 絵の中に「目的・相手・場面」が入っている
    expect(screen.queryByText("場面")).not.toBeInTheDocument();
  });

  it("絵があるときは、同じことを図でもう一度出さない", () => {
    render(
      <ConceptCardView
        card={card}
        image={teachingImage(DAY1, "concept_tone")}
        headingShown
      />,
    );

    // 絵の中に「丁寧・やわらかい・カジュアル」が入っている
    expect(screen.getByTestId("teaching-image")).toBeInTheDocument();
    expect(screen.queryByText("やわらかい")).not.toBeInTheDocument();
  });

  it("絵が無い回は、これまでどおり図を出す", () => {
    render(<ConceptCardView card={card} headingShown />);

    expect(screen.queryByTestId("teaching-image")).not.toBeInTheDocument();
    expect(screen.getByText("やわらかい")).toBeInTheDocument();
  });

  it("本文の1行だけは、絵があっても残す", () => {
    // 読み上げと、絵が読み込めなかったときのために
    render(
      <ConceptCardView
        card={card}
        image={teachingImage(DAY1, "concept_tone")}
        headingShown
      />,
    );

    expect(screen.getByText(card.body)).toBeInTheDocument();
  });
});
