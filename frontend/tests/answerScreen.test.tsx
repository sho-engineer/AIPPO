/**
 * 「分かりやすくなった？」——結果を見て、答える画面。
 *
 * この画面だけ、**送らずに最後まで終われる**ことを守る
 * ------------------------------------------------------
 * 実機（402×684）で、ここに載るものを数えるとこうなる。
 *
 *   ヘッダと進み具合 / 題 / ポーと吹き出し / AIの結果 /
 *   「変わったところを見る」/ 答えの2択 / 下の帯のボタン
 *
 * 縦に積むと入らない。入らないぶんは画面を送れば読めるが、
 * **答えの札が下の帯に隠れたまま**「分かりやすくなった？」を
 * 聞かれることになり、押せない札を探して上下に動かすことになる。
 *
 * 削るのではなく、置き場所を分けた。読み比べ・言いかえの対応・
 * 見どころは「変わったところ」の**中央の一枚**へ移し、通常画面には
 * 決めるのに要るものだけを残した。
 *
 * ここで見張るのは4つ。
 *
 *   1. 通常画面に、読み物を積み直さないこと（タブ・見どころ・全文比較）
 *   2. 「変わったところ」は中央に浮くこと（下から出る＝続きのある読み物）
 *   3. 全文の比べは、その一枚の中でもう1回押した人にだけ出ること
 *   4. 答えは1つだけ選べて、選ぶまで次へ行けないこと
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { LessonRunner } from "../src/pages/LessonRunner";
import { ObservationList } from "../src/components/course/steps/Observation";
import { ResultCompare } from "../src/components/course/steps/Results";
import { getLesson } from "../src/course/catalog";
import { lessonPlan } from "../src/course/lessonPlan";
import type { Lesson, LessonStep } from "../src/course/types";

const BEFORE =
  "Transformer型言語モデルにおける自己注意機構では、各トークンから生成された" +
  "QueryとKeyの内積をスケーリングし、系列内の依存関係を動的に表現する。";

const AFTER =
  "AIは文章を読むとき、すべての言葉を同じように見るわけではありません。\n" +
  "「この言葉と、この言葉は関係がありそう」と考えながら、文章の中で大事な言葉に注目します。";

const POINTS = ["元の意味が変わっていないか", "読む相手に合った説明になっているか"];

const SWAPS = lessonPlan("rewrite_text")!.swaps;

/** 答える画面での出しかた（`StepRenderer` の `observation` と同じ渡し方）。 */
function showAnswerScreen() {
  return render(
    <ResultCompare
      before={BEFORE}
      after={AFTER}
      reviewPoints={POINTS}
      showPoints={false}
      swaps={SWAPS}
      onlyResult
      fill={false}
    />,
  );
}

/** 「変わったところを見る」を開く。 */
async function openChanges(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("result-more"));
  return screen.getByTestId("changes-sheet");
}

describe("通常画面に置くもの", () => {
  it("AIの結果は、開いた時点で数行ぶん読める", () => {
    showAnswerScreen();

    const preview = screen.getByTestId("result-after-mobile");
    expect(preview).toHaveTextContent("すべての言葉を同じように見るわけでは");
    // 切る行数はクラス名で持つ（Tailwind は書いてあるクラス名しか作らない）
    expect(preview.querySelector(".line-clamp-3")).not.toBeNull();
  });

  it("元の文章と切り替える札は、置かない", () => {
    /*
      札は 44px 取る。**切り替えても答えは変わらない**——聞かれて
      いるのは「AIの結果が分かりやすくなったか」で、そのために読むのは
      AIの結果のほう。元の文章は「変わったところ」の一枚の中で、
      言いかえの対応と一緒に見るほうが早い。
    */
    showAnswerScreen();

    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("見どころは、画面に直接出さない", () => {
    /*
      ここでするのは1つ（分かりやすくなったか）。そこへ確認事項を
      足すと、**答える前に読み物が増える**。見どころは消していない
      ——「変わったところ」の一枚の中にある。
    */
    showAnswerScreen();

    expect(screen.queryByTestId("review-point")).toBeNull();
  });

  it("全文の比べも、最初からは出さない", () => {
    showAnswerScreen();

    expect(screen.queryByTestId("full-compare")).toBeNull();
  });

  it("読み比べる画面では、見どころをこれまでどおり画面に出す", () => {
    // 出す先を選んだだけで、作りを消したのではない
    render(<ResultCompare before={BEFORE} after={AFTER} reviewPoints={POINTS} />);

    expect(screen.getByTestId("review-point")).toHaveTextContent(POINTS[0]);
  });
});

describe("変わったところの一枚", () => {
  it("中央に浮かせる（下から出す形にしない）", async () => {
    /*
      ここは**見て、閉じて、答える**場面。下から出る形は
      「送れば続きがある読み物」に見えるので、閉じずに送り始める。
    */
    const user = userEvent.setup();
    showAnswerScreen();

    const sheet = await openChanges(user);

    expect(sheet).toHaveAttribute("data-placement", "center");
    // 開いているあいだ、後ろのレッスン画面は送れない
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("いちばん上は、言いかえの対応", async () => {
    /*
      全文を突き合わせなくても「簡単になった」が分かるのは、この
      対応のほう。長い2文を先に置くと、そこまで届かない。
    */
    const user = userEvent.setup();
    showAnswerScreen();

    const sheet = await openChanges(user);
    const swaps = screen.getByTestId("changes-swaps");

    expect(swaps).toHaveTextContent("自己注意機構");
    expect(swaps).toHaveTextContent("言葉同士の関係を見る仕組み");
    // 見出しより先に来ていること（＝読む順で最初）
    expect(sheet.textContent!.indexOf("自己注意機構")).toBeLessThan(
      sheet.textContent!.indexOf("ここを見て"),
    );
  });

  it("見どころは、ここに全部ある", async () => {
    const user = userEvent.setup();
    showAnswerScreen();

    const sheet = await openChanges(user);

    for (const point of POINTS) {
      expect(sheet).toHaveTextContent(point);
    }
  });

  it("全文の比べは、もう1回押した人にだけ出す", async () => {
    const user = userEvent.setup();
    showAnswerScreen();

    await openChanges(user);
    expect(screen.queryByTestId("full-compare")).toBeNull();

    await user.click(screen.getByTestId("full-compare-open"));

    expect(screen.getByTestId("full-before")).toHaveTextContent("Transformer型言語モデル");
    expect(screen.getByTestId("full-after")).toHaveTextContent(
      "すべての言葉を同じように見るわけでは",
    );
  });

  it("閉じると、全文の比べも畳まれる", async () => {
    // 次に開いたとき、いきなり長い2文が並ばないように
    const user = userEvent.setup();
    showAnswerScreen();

    await openChanges(user);
    await user.click(screen.getByTestId("full-compare-open"));
    await user.click(screen.getByTestId("changes-close"));
    await openChanges(user);

    expect(screen.queryByTestId("full-compare")).toBeNull();
  });

  it("測って分かる差が無くても、言いかえがあれば入口を出す", async () => {
    /*
      AIが返す文が元とよく似ている日は、1文ずつの差分が「ほぼ同じ」に
      なる（`isMostlyUnchanged`）。差分だけを入口の条件にしていると、
      **言いかえの対応を持っているのに入口ごと消える**。
    */
    const user = userEvent.setup();
    render(
      <ResultCompare
        before="自己注意機構のはなし。"
        after="自己注意機構のはなし。"
        reviewPoints={[]}
        swaps={SWAPS}
        onlyResult
        fill={false}
      />,
    );

    const sheet = await openChanges(user);

    expect(sheet).toHaveTextContent("言葉同士の関係を見る仕組み");
  });
});

describe("答えの2択", () => {
  const step: LessonStep = {
    id: "observe_result",
    type: "observation",
    phase: "try",
    title: "分かりやすくなった？",
    instruction: "",
    poMessage: "どうだった？",
    poEmotion: "question",
    key: "observation",
    options: [
      { value: "分かりやすくなった", label: "分かりやすくなった" },
      { value: "まだ難しい", label: "まだ難しい" },
    ],
  };

  it("選べるのは1つだけ（四角のチェックにしない）", async () => {
    /*
      前は四角のチェックを添えた一覧で、値も**カンマ区切りの複数選択**
      だった。この問いは「分かりやすくなったか / まだ難しいか」の
      どちらか1つで、両方は選べない。**形が中身と食い違っていた。**
    */
    const user = userEvent.setup();
    let value = "";
    const { rerender } = render(
      <ObservationList step={step} value={value} onChange={(next) => (value = next)} />,
    );

    expect(screen.queryByRole("checkbox")).toBeNull();

    await user.click(screen.getByRole("button", { name: "まだ難しい" }));
    rerender(
      <ObservationList step={step} value={value} onChange={(next) => (value = next)} />,
    );

    expect(screen.getByRole("button", { name: "まだ難しい" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "分かりやすくなった" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("押し直すと、前の答えは外れる", async () => {
    const user = userEvent.setup();
    let value = "まだ難しい";
    const { rerender } = render(
      <ObservationList step={step} value={value} onChange={(next) => (value = next)} />,
    );

    await user.click(screen.getByRole("button", { name: "分かりやすくなった" }));
    rerender(
      <ObservationList step={step} value={value} onChange={(next) => (value = next)} />,
    );

    expect(screen.getByRole("button", { name: "まだ難しい" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("短い2択は、横に並べる", () => {
    // 縦に積むと 120px。この画面ではその 120px がAIの結果から引かれる
    render(<ObservationList step={step} value="" onChange={() => {}} />);

    expect(screen.getByTestId("observation-list")).toHaveAttribute(
      "data-layout",
      "row",
    );
  });

  it("長い言葉や3つ以上のときは、縦のまま", () => {
    /*
      横に詰めると折り返して札の高さが揃わない。**揃わないほうが
      「押せる場所が分からない」ぶん高くつく。**
    */
    render(
      <ObservationList
        step={{
          ...step,
          options: [
            { value: "a", label: "とても分かりやすくなったと思う" },
            { value: "b", label: "まだ難しい" },
          ],
        }}
        value=""
        onChange={() => {}}
      />,
    );

    expect(screen.getByTestId("observation-list")).toHaveAttribute(
      "data-layout",
      "stack",
    );
  });
});

describe("答えるまで、次へ行けない", () => {
  const lesson = getLesson("rewrite_text") as Lesson;
  const at = lesson.steps.findIndex((step) => step.id === "observe_result");
  const fromObserve: Lesson = { ...lesson, steps: lesson.steps.slice(at) };

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("選ぶ前の「条件を足してみる」は、押せない形で出す", async () => {
    /*
      前は押せた。押すと**答えの入っていないまま**次の回へ進むので、
      何に答えたつもりだったのかが誰にも残らない。

      本物の `disabled` にはしない——押下を受け取れないと、なぜ進めない
      のかをその場で言えない（このアプリはどこも `aria-disabled`）。
    */
    render(
      <LessonRunner lesson={fromObserve} onExit={() => {}} onOpenCourse={() => {}} />,
    );

    expect(await screen.findByTestId("primary-action")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
