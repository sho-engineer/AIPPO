/**
 * 昇段の実践問題。
 *
 * 見張るのは5つ。
 *
 * - **「失敗」「不合格」と読める言葉を置かない。** 何度でも受けられる
 * - 点数を出さない。**足りなかった観点の名前**だけを返す
 * - 観点は名前だけ。どう書けば当たるかは出さない（写して通せない）
 * - 通っても、技が足りなければ上がらない——そのとき通ったことは認める
 * - 二度押しで2回送らない
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChallengeSheet } from "../src/components/course/diagnosis/ChallengeSheet";
import type {
  ChallengeVerdict,
  RankUpChallenge,
} from "../src/api/progression";

const CHALLENGE: RankUpChallenge = {
  level: 2,
  title: "目的を伝えて、頼んでみる",
  scenario:
    "先週の打ち合わせのメモが、そのままでは長くて読めません。" +
    "何のために使うのかを添えて、AIへの指示文を書いてください。",
  estimated_minutes: 2,
  check_labels: ["目的"],
  open: true,
  remaining: 0,
};

const GOOD_ANSWER =
  "来週の会議で共有するために、この議事録の要点をまとめてください。";

/** 問題だけを返す（まだ送っていない場面）。 */
function serveChallenge() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => ({ ok: true, status: 200, json: async () => CHALLENGE }) as Response,
  );
}

/** GET は問題、POST は判定を返す。 */
function serveBoth(verdict: ChallengeVerdict) {
  const sent: string[] = [];
  const spy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      const method = (init as RequestInit | undefined)?.method ?? "GET";
      if (method === "POST") {
        sent.push(String((init as RequestInit).body));
        return { ok: true, status: 200, json: async () => verdict } as Response;
      }
      return { ok: true, status: 200, json: async () => CHALLENGE } as Response;
    });
  return { spy, sent };
}

function open(onLevelUp = () => {}) {
  serveChallenge();
  return render(
    <ChallengeSheet level={2} onClose={() => {}} onLevelUp={onLevelUp} />,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("昇段の実践問題", () => {
  it("場面を出す", async () => {
    open();

    expect(await screen.findByTestId("challenge-scenario")).toHaveTextContent(
      "打ち合わせのメモ",
    );
  });

  it("観点は名前だけ出す（どう書けば当たるかは出さない）", async () => {
    open();

    const checks = await screen.findByTestId("challenge-checks");
    expect(checks).toHaveTextContent("目的");
    /* 見分け方の語（サーバー側 `CHECKS` の中身）が漏れていないこと */
    for (const word of ["したい", "してほしい", "箇条書き", "以内"]) {
      expect(document.body.textContent ?? "").not.toContain(word);
    }
  });

  it("短すぎるうちは送れない", async () => {
    open();

    await screen.findByTestId("challenge-answer");
    expect(screen.getByTestId("challenge-send")).toBeDisabled();
    expect(screen.getByTestId("challenge-length")).toHaveTextContent(
      "もう少し書いてみてください",
    );
  });

  it("書けたら送れる", async () => {
    open();

    const box = await screen.findByTestId("challenge-answer");
    await userEvent.type(box, GOOD_ANSWER);

    expect(screen.getByTestId("challenge-send")).toBeEnabled();
  });

  describe("見てもらったあと", () => {
    async function send(verdict: ChallengeVerdict) {
      const served = serveBoth(verdict);
      render(<ChallengeSheet level={2} onClose={() => {}} />);
      const box = await screen.findByTestId("challenge-answer");
      await userEvent.type(box, GOOD_ANSWER);
      await userEvent.click(screen.getByTestId("challenge-send"));
      return served;
    }

    it("足りないときは、観点の名前で返す", async () => {
      await send({
        passed: false,
        missing: ["audience"],
        missing_labels: ["誰向けか"],
        level_up: false,
        current_level: 1,
        remaining_skills: 2,
      });

      const box = await screen.findByTestId("challenge-missing");
      expect(box).toHaveTextContent("誰向けか");
      expect(screen.getByTestId("challenge-again")).toBeInTheDocument();
    });

    it("「失敗」と読める言葉を置かない", async () => {
      await send({
        passed: false,
        missing: ["audience"],
        missing_labels: ["誰向けか"],
        level_up: false,
        current_level: 1,
        remaining_skills: 2,
      });

      await screen.findByTestId("challenge-missing");
      const text = document.body.textContent ?? "";
      for (const phrase of ["失敗", "不合格", "できませんでした", "残念"]) {
        expect(text).not.toContain(phrase);
      }
    });

    it("点数を出さない", async () => {
      await send({
        passed: false,
        missing: ["audience", "format"],
        missing_labels: ["誰向けか", "出力形式"],
        level_up: false,
        current_level: 1,
        remaining_skills: 2,
      });

      await screen.findByTestId("challenge-missing");
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/\d+\s*点/);
      expect(text).not.toMatch(/\d+\s*\/\s*\d+/);
    });

    it("書き直すと、また書ける", async () => {
      await send({
        passed: false,
        missing: ["audience"],
        missing_labels: ["誰向けか"],
        level_up: false,
        current_level: 1,
        remaining_skills: 2,
      });

      await userEvent.click(await screen.findByTestId("challenge-again"));

      expect(screen.getByTestId("challenge-answer")).toBeInTheDocument();
    });

    it("通ったのに上がらない回は、通ったことを先に言う", async () => {
      /*
        上がる条件は2つあって、どちらも要る。書けているのに
        「まだです」とだけ返すと、何が悪かったのかを探すことになる。
      */
      await send({
        passed: true,
        missing: [],
        missing_labels: [],
        level_up: false,
        current_level: 1,
        remaining_skills: 2,
      });

      const box = await screen.findByTestId("challenge-passed-waiting");
      expect(box).toHaveTextContent("書けています");
      expect(box).toHaveTextContent("あと2つ");
    });

    it("2つそろうと、上がったことを出す", async () => {
      await send({
        passed: true,
        missing: [],
        missing_labels: [],
        level_up: true,
        current_level: 2,
        remaining_skills: 0,
      });

      expect(await screen.findByTestId("challenge-levelup")).toHaveTextContent(
        "Lv.2 になりました",
      );
    });

    it("上がったことを、外へ伝える", async () => {
      const told = vi.fn();
      serveBoth({
        passed: true,
        missing: [],
        missing_labels: [],
        level_up: true,
        current_level: 2,
        remaining_skills: 0,
      });
      render(
        <ChallengeSheet level={2} onClose={() => {}} onLevelUp={told} />,
      );
      await userEvent.type(
        await screen.findByTestId("challenge-answer"),
        GOOD_ANSWER,
      );
      await userEvent.click(screen.getByTestId("challenge-send"));

      await waitFor(() => expect(told).toHaveBeenCalledWith(2));
    });

    it("二度押しで、2回送らない", async () => {
      const { sent } = serveBoth({
        passed: true,
        missing: [],
        missing_labels: [],
        level_up: true,
        current_level: 2,
        remaining_skills: 0,
      });
      render(<ChallengeSheet level={2} onClose={() => {}} />);
      await userEvent.type(
        await screen.findByTestId("challenge-answer"),
        GOOD_ANSWER,
      );

      const button = screen.getByTestId("challenge-send");
      await userEvent.click(button);
      await userEvent.click(button).catch(() => {
        /* 1回目で消えているので、押せなくてよい */
      });

      await waitFor(() => expect(sent.length).toBe(1));
    });
  });
});
