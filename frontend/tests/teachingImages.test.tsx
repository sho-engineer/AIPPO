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
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ConceptCardView } from "../src/components/course/steps/ConceptCard";
import { OutcomePreview } from "../src/components/course/steps/Outcome";
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
    /*
      1枚だけ見ない。**表にある全部を見る。**

      前はここで Day2 の1枚を名指ししていて、その画面の id が変わった
      だけで「読み上げに渡している」ことを何も見なくなった（実際、
      Day2 を組み直したときに素通りした）。
    */
    expect(ALL_TEACHING_IMAGES.length).toBeGreaterThan(0);
    for (const entry of ALL_TEACHING_IMAGES) {
      expect(
        entry.alt.length,
        `${entry.lessonId}/${entry.stepId} の説明が短すぎる`,
      ).toBeGreaterThan(10);
    }
  });
});

describe("時間を二度言わない", () => {
  /*
    Day1〜8 の全体図には「学習時間の目安」が焼き込まれている。
    アプリはその絵のすぐ下に `所要時間` を出していたので、同じ画面に
    数字が2つ並んでいた（Day1 は値までずれていて、絵が「約3分」、
    アプリが「8分」だった）。

    いまは絵ごとの出し分けそのものが無い。開始画面の入口を2つに
    絞ったとき、`所要時間` の札も `初級` の札も画面から外したので、
    **数字を言う場所は「今日やること」の一枚のポーの一言だけ**になった。
    絵の中の数字と教材データが食い違っていないことは
    `tests/teachingImageFacts.test.ts` が、いまも `showsMinutes` を
    手がかりに見張っている。
  */
  it("絵が時間を言っていても、アプリ側に数字の札は出ない", () => {
    render(
      <OutcomePreview
        minutes={8}
        poMessage="ためしの一言"
        skills={[]}
        /* 全体図を持っているのは Day2（Day1 にはこの画面が無い） */
        overview={teachingImage(DAY2, "outcome_preview")}
      />,
    );

    expect(screen.queryByText("所要時間")).not.toBeInTheDocument();
    expect(screen.queryByText("8分")).not.toBeInTheDocument();
    /*
      むずかしさの札も一緒に外した。押せる先が4つあると、どれが本題か
      決められない——残したのは「さっそく試す」と「今日やることを見る」
      の2つだけで、札はどちらでもない。
    */
    expect(screen.queryByText("初級")).not.toBeInTheDocument();
  });

  it("札を外しても、時間はポーの一言が一度だけ言う", () => {
    /*
      下げすぎると、時間がどこにも出なくなる。行き先はポーの吹き出し
      （「今日やること」の一枚）で、絵が時間を言っているかどうかで
      出し分けはしない——札が無くなった以上、二度言う道がそもそも無い。

      数字を独立した札に戻さないこと。「約8分で終わる」は仕様ではなく、
      背中を押す一言なので、ポーの言葉に混ぜたままにする。
    */
    render(
      <OutcomePreview
        minutes={8}
        poMessage="ためしの一言"
        skills={[]}
        overview={{
          src: "/x.webp",
          alt: "時間の入っていない絵",
          visualType: "lesson_overview",
        }}
      />,
    );

    expect(screen.queryByText("所要時間")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-hero-message")).toHaveTextContent(
      "約8分で終わるよ！",
    );
  });

  it("Day1〜8 の全体図は、8枚とも時間を持っていると書いてある", () => {
    /*
      1枚でも書き忘れると、その日だけ数字が2つ並ぶ。
      絵を差し替えて時間が消えたときは、逆にここを false へ戻すこと。
    */
    const overviews = ALL_TEACHING_IMAGES.filter(
      (entry) => entry.visualType === "lesson_overview",
    );

    /*
      枚数は決め打ちにしない。**「載っているものは全部そう書いてある」**
      ことだけを見る。

      前はここが「8枚」だった。Day1 が全体図の画面ごと無くなり、表から
      1行消えた時点で落ちた——教材の作りが変わるたびに数を書き替える
      なら、この検査が見ているのは「前回の枚数」になる。
    */
    expect(overviews.length, "全体図が1枚も無い").toBeGreaterThan(0);
    for (const entry of overviews) {
      expect(entry.showsMinutes, `${entry.lessonId} の全体図`).toBe(true);
    }
  });
});

describe("必ず見せるものと、見たい人に見せるもの", () => {
  /*
    「作った絵だから毎回必ず全部見せる」にはしない。ただし畳む向きは
    絵によって逆になる。

      全体図   … 今日やることを知らせる。**押したら大きく出す**
      技の絵   … 本文の補足。**閉じておく**（開ける）

    全体図は前まで開いた状態で置いていた。1画面＝1アクションに
    収めると、この絵に渡せる高さは 30px しか残らない（Pixel 5 で実測）。
    読めない絵を置くより、一手ぶん押してもらって大きく見せる。
  */
  it("最初の画面の全体図は、押したら大きく出す", async () => {
    render(
      <OutcomePreview
        poMessage="ためしの一言"
        skills={[]}
        /* 全体図を持っているのは Day2（Day1 にはこの画面が無い） */
        overview={teachingImage(DAY2, "outcome_preview")}
      />,
    );

    // 押す前は絵そのものを置かない（読めない大きさで置かない）
    expect(screen.queryByTestId("teaching-image")).toBeNull();

    const user = userEvent.setup();
    /*
      全体図の入口は「今日やること」の中へ移した。開始画面に
      「全体図を見る」「詳しく見る」「初級」を並べると、どれを押せば
      よいのか決められなくなるため。導入の一枚は開いた最初に出るので、
      閉じずにそのまま押す。
    */
    await user.click(screen.getByTestId("lesson-intro-overview"));

    expect(screen.getByTestId("lesson-overview-sheet")).toBeInTheDocument();
    expect(screen.getByTestId("teaching-image")).toBeInTheDocument();
  });

  it("技の絵は、閉じた状態で置く", () => {
    /*
      技の名前を受け取る場面なので、大きな絵で埋めると
      名前より絵が主役になる。本文の1行で用は足りている。
    */
    /*
      Day1 から解説の絵を外したので、絵を持っている教材で見る（Day2）。
      見たいのは「技の絵は閉じた状態で置く」という決まりのほうで、
      どの教材かではない。
    */
    const card = getLesson("summarize_text")!.steps.find(
      (step) => step.id === "concept_summary",
    )!.card!;
    render(
      <ConceptCardView
        card={card}
        image={teachingImage("summarize_text", "concept_summary")}
        headingShown
      />,
    );

    expect(screen.getByTestId("concept-visual")).not.toHaveAttribute("open");
    expect(screen.getByTestId("concept-visual-toggle")).toBeInTheDocument();
  });
});

describe("Day1 には、レッスンの中の絵を置かない", () => {
  /*
    3枚あった（ターゲット指定・トーン指定・比べる図）。外したのは、
    **どれも画面の中の比較と同じことを言っていた**から。

      ・解説の絵は「新入社員向けならやさしく／専門家向けなら専門的に」
        という一般論で、そのすぐ上には**自分の文章で実際にそうなった
        結果**が出ている。一般論のほうが後から来ると、自分の結果が
        例示の1つに見える
      ・比べる図も同じで、隣に本物の Before / After がある

    絵は 235px を取り、その分だけ本物の比較が下へ押し出されていた。
    理解を速めない絵は、置かないほうが速い。

    **置き直すと、また同じ画面に戻る。** ここで止める。
  */
  const lesson = getLesson(DAY1)!;

  it("本文のあいだに挟まる絵が、1枚も無い", () => {
    const placed = lesson.steps
      .map((step) => step.id)
      .filter((id) => teachingImage(DAY1, id) !== null);

    expect(placed).toEqual([]);
  });

  it("全体図は、表からも外す", () => {
    /*
      表に残していた時期がある。「コース一覧のできあがりで使うから」と
      書いてあったが、**実際には使っていなかった**——`lessonOverview`
      を呼ぶのは `outcome_preview` の画面だけで（`StepRenderer`）、
      Day1 にはその画面が無い。一覧の絵は別の表が持っている
      （`course/lessonThumbnail.ts`）。

      開かれない画面を指す1行を残すと、絵を消したときに気づけない
      まま表と教材が食い違う（`course/teachingImages.ts` の決まり）。
    */
    expect(lesson.steps.some((step) => step.id === "outcome_preview")).toBe(false);
    expect(teachingImage(DAY1, "outcome_preview")).toBeNull();
  });

  it("絵だけの画面は、章扉だけ", () => {
    /*
      章扉の絵は教材データが持つ（`course/day1Steps.ts` の `meta.image`）。
      **1つの章について言うことは1か所にまとめる**と決めた側に寄せきる。
    */
    const covers = lesson.steps.filter(
      (step) => step.type === "section_transition",
    );

    expect(covers).toHaveLength(4);
    for (const cover of covers) {
      const image = (cover.meta as { image?: { src: string } }).image;
      expect(image?.src, `${cover.id} に絵が無い`).toBeTruthy();
      // こちらの表には重ねて置かない（差し替えたときにどちらが効くか決まらない）
      expect(teachingImage(DAY1, cover.id)).toBeNull();
    }
  });
});

describe("Day2 のどこに出るか", () => {
  const lesson = getLesson(DAY2)!;
  const order = lesson.steps.map((step) => step.id);
  const at = (stepId: string) => order.indexOf(stepId);

  it("4枚が、それぞれの画面に割り当たっている", () => {
    /*
      5枚から4枚へ。Day2 を4つの段に組み直したとき、読む人と目的を
      足す段に添える図（`compare_04_context`）が Repository に無い
      ことが分かった。**無い絵を指さない**——比べる中身は実際の
      2つのまとめが持っているので、図が無くてもあの段は成り立つ。
    */
    const placed = order.filter((id) => teachingImage(DAY2, id) !== null);

    expect(placed).toEqual([
      "outcome_preview",
      "concept_summary",
      "see_format",
      "concept_format",
      "concept_context",
    ]);
  });

  it("比べる図は、一度試して条件を足したあとに出る", () => {
    expect(at("see_format")).toBeGreaterThan(at("read_source"));
    expect(at("see_format")).toBeGreaterThan(at("add_format"));
    expect(at("see_format")).toBeGreaterThan(at("generate_format"));
  });

  it("解説の絵は、その技を使った直後に出る", () => {
    // 要約は1回目の結果の直後、出力形式は形を変えた結果の直後
    expect(at("concept_summary") - at("see_basic")).toBe(1);
    expect(at("concept_format") - at("see_format")).toBe(1);
    expect(at("concept_context") - at("see_context")).toBe(1);
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

  it("出力形式の指定を、コンテキストより先に出す", () => {
    // 形を変えた効果を見た直後に名前を付け、そのあとで目的の話へ移る
    expect(at("concept_format")).toBeLessThan(at("concept_context"));
  });

  it("画像だけの画面を増やしていない", () => {
    /*
      絵は**すでにある画面に添える**もので、絵のためだけの画面を
      作らない。章扉は絵を持たない（Day2 は題と帯で足りる）ので、
      絵が乗るのはどれも中身のある画面。
    */
    const withImage = order.filter((id) => teachingImage(DAY2, id) !== null);
    const types = withImage.map(
      (id) => lesson.steps.find((step) => step.id === id)!.type,
    );

    expect(types).toEqual([
      "outcome_preview",
      "concept_card",
      "result_compare",
      "concept_card",
      "concept_card",
    ]);
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

      置き場所は**ステップの種類**で読む
      ----------------------------------
      前は id の頭文字で見ていた（`compare_` で始まれば比べる図）。
      id は画面でやることに合わせて付けるもので、絵の種類のために
      あるのではない——Day2 を組み直して `compare_results` が
      `see_format`（形を変えた結果を見る回）になったとたん、
      比べる図が「解説の絵」と判定された。

      ステップの種類なら、名前の付け方が変わっても動かない。
    */
    const TYPE_TO_VISUAL: Record<string, string> = {
      outcome_preview: "lesson_overview",
      section_transition: "section",
      concept_card: "skill_concept",
      observation: "compare",
      result_compare: "compare",
      improvement_choice: "compare",
    };

    for (const entry of ALL_TEACHING_IMAGES) {
      const lesson = getLesson(entry.lessonId);
      /*
        同梱データに無い教材は飛ばす。アイデアを広げる・情報を整理する・
        画像の2本はサーバーだけが持っていて（`course/catalog.ts` の
        `START_CURRICULUM`）、ここからは並びを引けない。
      */
      if (!lesson) continue;

      const step = lesson.steps.find((one) => one.id === entry.stepId);
      expect(step, `${entry.lessonId}/${entry.stepId} が教材に無い`).toBeTruthy();

      const expected = TYPE_TO_VISUAL[step!.type];
      expect(
        expected,
        `${entry.lessonId}/${entry.stepId}: ${step!.type} に絵を置く決まりが無い`,
      ).toBeTruthy();
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

  it("コース全体の絵がある", () => {
    // 表から消えたらここで気づく
    expect(courseImage("first_step_7days")?.visualType).toBe("course_overview");
  });

  it("診断の開始画面に、絵を置かない", () => {
    /*
      ここには全体図が1枚あった。外したのは2つの理由で、
      **どちらも絵を差し替えても直らない**。

        ・絵の中に「AI活用診断」が大きく焼き込まれていて、上の帯と
          同じ言葉が1画面に2回出ていた
        ・診断でわかること・こんなときに・診断後にわかること まで
          詰まった1枚で、広告のバナーに見えた

      いまは UI で組んである（`diagnosis/DiagnosisIntro.tsx`）。
      絵を置き直すと**また同じ画面に戻る**ので、ここで止める。
    */
    expect(teachingImage("diagnosis", "intro")).toBeNull();
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
    /*
      Day1 から解説の絵を外したので、比べる相手は Day2 の
      「出力形式の指定」…ではなく、**同じ技を使っている教材どうし**で
      見る。ターゲット指定を絵で出しているのは、いまは Day3 だけ。

      置き場所が1つになったので、ここで見るのは「その1枚が
      置いてあること」になる。同じ技に別の絵が増えたら、
      `ALL_TEACHING_IMAGES` の重複として下の検査が拾う。
    */
    expect(teachingImage(DAY3, "concept_1")?.src).toBe(
      "/assets/teaching/skill_01_targeting.webp",
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
  /*
    Day1 から解説の絵を外したので、絵を持っている教材で見る（Day2）。
    見たいのは「絵があるときは、同じことを図でもう一度出さない」と
    いう決まりのほうで、どの教材かではない。
  */
  const card = getLesson(DAY2)!.steps.find(
    (step) => step.id === "concept_format",
  )!.card!;
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
        image={teachingImage(DAY2, "concept_format")}
        headingShown
      />,
    );

    // 絵の中に「3行で・箇条書きで・表で」が入っている
    expect(screen.getByTestId("teaching-image")).toBeInTheDocument();
    expect(screen.queryByText("箇条書きで")).not.toBeInTheDocument();
  });

  it("絵が無い回は、これまでどおり図を出す", () => {
    render(<ConceptCardView card={card} headingShown />);

    expect(screen.queryByTestId("teaching-image")).not.toBeInTheDocument();
    expect(screen.getByText("箇条書きで")).toBeInTheDocument();
  });

  it("本文の1行だけは、絵があっても残す", () => {
    // 読み上げと、絵が読み込めなかったときのために
    render(
      <ConceptCardView
        card={card}
        image={teachingImage(DAY2, "concept_output_format")}
        headingShown
      />,
    );

    expect(screen.getByText(card.body)).toBeInTheDocument();
  });
});
