/**
 * 進めないときの伝え方。
 *
 * 開いた瞬間からオレンジの警告が出ていると、まだ選んでいないだけの人が
 * 「何か間違えた」と読む。ふだんは案内、押して初めて断り、にする。
 *
 * あわせて、押せないボタンを**押せる形**にしてある。本物の disabled は
 * 押下そのものを受け取れないので、理由をその場で言えない。
 * 押しても何も起きないボタンは、理由が分からないまま二度三度と押される。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StepShell } from "../src/components/course/StepShell";

function shell(overrides: Partial<Parameters<typeof StepShell>[0]> = {}) {
  return (
    <StepShell
      title="だれが読みますか"
      progress={{ current: 2, total: 19 }}
      po={{ message: "近いものを選んでください。", emotion: "question", action: "wait" }}
      summary={[]}
      onEditSummary={() => {}}
      primaryLabel="次へ"
      onPrimary={() => {}}
      primaryDisabled
      hintNearButton="ひとつ選んでください。"
      {...overrides}
    >
      <p>本文</p>
    </StepShell>
  );
}

describe("押す前", () => {
  it("案内の色で出す（注意の色にしない）", () => {
    render(shell());

    expect(screen.getByTestId("step-hint")).toHaveAttribute("data-tone", "neutral");
  });

  it("読み上げには最初から届く", () => {
    // 押す前に理由が分かるほうがよい。色だけを後出しにする
    render(shell());

    expect(screen.getByTestId("step-hint")).toHaveTextContent("ひとつ選んでください");
    expect(screen.getByTestId("step-hint")).toHaveAttribute("role", "status");
  });

  it("押せない形だと、読み上げに伝わる", () => {
    render(shell());

    expect(screen.getByTestId("primary-action")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("押したあと", () => {
  it("注意の色へ変わる", async () => {
    const user = userEvent.setup();
    render(shell());

    await user.click(screen.getByTestId("primary-action"));

    expect(screen.getByTestId("step-hint")).toHaveAttribute("data-tone", "warning");
  });

  it("押しても、先へは進まない", async () => {
    // 色が変わるだけ。答えが足りないまま進めてはいけない
    const onPrimary = vi.fn();
    const user = userEvent.setup();
    render(shell({ onPrimary }));

    await user.click(screen.getByTestId("primary-action"));

    expect(onPrimary).not.toHaveBeenCalled();
  });

  it("回が変われば、案内の色に戻る", async () => {
    /*
      前の回で断られたことを、次の回まで引きずって赤いままにしない。
    */
    const user = userEvent.setup();
    const { rerender } = render(shell());
    await user.click(screen.getByTestId("primary-action"));
    expect(screen.getByTestId("step-hint")).toHaveAttribute("data-tone", "warning");

    rerender(shell({ title: "つぎの問い" }));

    expect(screen.getByTestId("step-hint")).toHaveAttribute("data-tone", "neutral");
  });
});

describe("送っている間", () => {
  it("本当に押せなくする", () => {
    /*
      ここは押されると困る。二度押しでAIへ2回送れば、費用も2回ぶん。
      理由を言う必要も無い（送っている、と文字で出ている）。
    */
    render(shell({ busy: true, primaryDisabled: false }));

    expect(screen.getByTestId("primary-action")).toBeDisabled();
  });

  it("送っている間に押しても、呼ばれない", async () => {
    const onPrimary = vi.fn();
    const user = userEvent.setup();
    render(shell({ busy: true, primaryDisabled: false, onPrimary }));

    await user.click(screen.getByTestId("primary-action"));

    expect(onPrimary).not.toHaveBeenCalled();
  });
});

describe("受け取った合図", () => {
  it("選んだ中身をそのまま返す", () => {
    /*
      押した札が青くなるだけでは、登録されたのか分からない。
      選んだ中身を返せば、押し間違いにもその場で気づける。
    */
    render(
      shell({
        primaryDisabled: false,
        hintNearButton: null,
        doneLabel: "「上司」で進みます",
      }),
    );

    expect(screen.getByTestId("step-done-inline")).toHaveTextContent(
      "「上司」で進みます",
    );
    expect(screen.getByTestId("step-done-inline")).toHaveAttribute("role", "status");
  });

  it("合図と、押せない理由を同時に出さない", () => {
    // 答えたのに「ひとつ選んでください」が並ぶと、何が起きたのか分からない
    render(shell({ doneLabel: "「上司」で進みます" }));

    expect(screen.getByTestId("step-done-inline")).toBeInTheDocument();
    expect(screen.queryByTestId("step-hint")).not.toBeInTheDocument();
  });
});

describe("進めるとき", () => {
  it("ふつうに押せる", async () => {
    const onPrimary = vi.fn();
    const user = userEvent.setup();
    render(shell({ primaryDisabled: false, hintNearButton: null, onPrimary }));

    await user.click(screen.getByTestId("primary-action"));

    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("step-hint")).not.toBeInTheDocument();
  });
});
