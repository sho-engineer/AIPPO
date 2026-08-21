/**
 * コースのスタンプラリーの見た目。
 *
 * ここで守るのは4つ。
 *
 *   1. 埋まった数と、埋めた数が合っている（読み上げにも届く）
 *   2. 「あと◯レッスンで」の数が合っている
 *   3. 全部の節目を超えたら、「あと◯」は出さない
 *      （残るのはコース完走だけなので、この1行では言わない）
 *   4. 特典は「予告」の言い方であって、「獲得しました」ではない
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CourseStampRow,
  MilestoneLegend,
  NextMilestoneHint,
} from "../src/components/course/CourseStamps";
import { COURSE } from "../src/course/catalog";

describe("CourseStampRow", () => {
  it("埋まった数を読み上げに出す", () => {
    render(<CourseStampRow course={COURSE} done={3} total={9} />);

    expect(
      screen.getByRole("img", { name: "9個中3個のスタンプが埋まっています" }),
    ).toBeInTheDocument();
  });

  it("特典を『獲得しました』と言わない", () => {
    // ここは丸を並べるだけ。獲得の文言はまた別の場所（反応・完走）が持つ
    render(<CourseStampRow course={COURSE} done={3} total={9} />);

    expect(screen.queryByText(/獲得/)).not.toBeInTheDocument();
  });
});

describe("NextMilestoneHint", () => {
  it("次の節目までの本数を出す", () => {
    render(<NextMilestoneHint course={COURSE} done={1} />);

    expect(screen.getByTestId("next-milestone-hint")).toHaveTextContent("あと2レッスンで");
  });

  it("全部の節目を超えたら、何も出さない", () => {
    // 残るのはコース完走だけ。ここでは言わず、専用の場所に任せる
    render(<NextMilestoneHint course={COURSE} done={9} />);

    expect(screen.queryByTestId("next-milestone-hint")).not.toBeInTheDocument();
  });

  it("『獲得しました』とは言わない。届く予定の予告にとどめる", () => {
    render(<NextMilestoneHint course={COURSE} done={1} />);

    expect(screen.queryByText(/獲得しました/)).not.toBeInTheDocument();
  });
});

describe("MilestoneLegend", () => {
  it("節目をすべて出す（達成済みを含めて）", () => {
    render(<MilestoneLegend course={COURSE} done={4} />);

    const list = screen.getByTestId("milestone-legend");
    expect(list).toHaveTextContent("3個達成");
    expect(list).toHaveTextContent("6個達成");
    expect(list).toHaveTextContent("コース完走");
  });

  it("『獲得しました』と、済みの節目にも言わない", () => {
    /*
      実際に使える残高が無いので、届いた節目にも「獲得」とは言わない。
      過去形の報告文をここに置くと、そのまま誤解される。
    */
    render(<MilestoneLegend course={COURSE} done={5} />);

    expect(screen.queryByText(/獲得しました/)).not.toBeInTheDocument();
  });
});
