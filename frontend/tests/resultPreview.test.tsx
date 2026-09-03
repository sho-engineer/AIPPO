/**
 * AIの結果を見る画面（「分かりやすくなった？」）。
 *
 * ここで守りたいのは1つ——**返ってきたものが読めること**。
 *
 * 前は「残りの高さ」を面に渡し、入りきらないぶんを面の中で送る形に
 * していた。この画面には下に問いと次へのボタンが載るので、実機
 * （402×684）では残りが1行ぶんしか無く、AIの結果が読めないまま
 * 「分かりやすくなった？」を聞かれていた。**読めなければ答えようが
 * ないので、勘で押すことになる。**
 *
 * 決まった行数の抜粋＋「全文を見る」に替えた。見張るのは3つ。
 *
 *   1. 抜粋が数行ぶん出ていること（1行ではないこと）
 *   2. 「全文を見る」で、全文が中央の一枚に出ること
 *   3. 結果の直後に、差分を読む入口を並べないこと
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ResultCompare } from "../src/components/course/steps/Results";

const BEFORE =
  "Transformer型言語モデルにおける自己注意機構では、各トークンから生成された" +
  "QueryとKeyの内積をスケーリングし、系列内の依存関係を動的に表現する。";

const AFTER =
  "AIは文章を読むとき、すべての言葉を同じように見るわけではありません。\n" +
  "「この言葉と、この言葉は関係がありそう」と考えながら、文章の中で大事な言葉に注目します。\n" +
  "さらに、いくつかの見方を同時に使うことで、言葉同士のつながりを捉え、" +
  "文章の意味を理解しやすくしています。";

function show(extra?: { showChanges?: boolean }) {
  return render(
    <ResultCompare before={BEFORE} after={AFTER} reviewPoints={[]} {...extra} />,
  );
}

describe("AIの結果が読めること", () => {
  it("抜粋は、決まった行数で切る（1行ではない）", () => {
    show();

    const preview = screen.getByTestId("result-after-mobile");
    /*
      切る行数はクラス名で持つ。Tailwind は**書いてあるクラス名しか
      CSS を作らない**ので、`line-clamp-${n}` と組み立てると切れずに
      全文が出る（気づけるのは画面がはみ出したとき）。
    */
    expect(preview.querySelector(".line-clamp-3")).not.toBeNull();
  });

  it("抜粋には、全文が入っている（切るのは見え方だけ）", () => {
    /*
      文字は最初から DOM にある。読み上げとコピーが、
      途中で切れた文章にならないようにするため。
    */
    show();

    expect(screen.getByTestId("result-after-mobile")).toHaveTextContent(
      "文章の意味を理解しやすくしています",
    );
  });

  it("「全文を見る」で、中央の一枚に出る", async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByTestId("result-after-mobile"));

    const sheet = screen.getByTestId("full-text-sheet");
    expect(sheet).toHaveAttribute("data-placement", "center");
    expect(sheet).toHaveTextContent("文章の意味を理解しやすくしています");
    // 開いているあいだ、後ろの画面は送れない
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("元の文章も、同じ形で読める", async () => {
    const user = userEvent.setup();
    show();

    await user.click(screen.getByRole("tab", { name: "元の文章" }));

    expect(screen.getByTestId("result-before-mobile")).toHaveTextContent(
      "Transformer型言語モデル",
    );
  });

  it("結果の直後には、差分を読む入口を並べない", () => {
    /*
      この画面で決めることは1つ（分かりやすくなったか）。そこへ
      「差分を読む」を並べると、**答える前に読み物が増える**。
      差分は次の画面（こんなに変わった）が持っている。
    */
    show({ showChanges: false });

    expect(screen.queryByTestId("result-more")).toBeNull();
  });

  it("比べる画面では、これまでどおり差分を出す", () => {
    // 消したのではなく、出す画面を選んだだけ
    show({ showChanges: true });

    expect(screen.getByTestId("result-more")).toBeInTheDocument();
  });
});
