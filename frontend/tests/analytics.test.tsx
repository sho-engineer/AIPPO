/**
 * 見張っている出来事（Analytics）のうち、**画面から送るもの**。
 *
 * サーバーが判定するもの（技・XP・節目・送れた再設定）は、
 * `backend/tests/test_analytics_events.py` が受け持つ。
 *
 * ここで守るのは3つ。
 *
 *   1. 名前が1か所に集まっていること（綴りの違う行を増やさない）
 *   2. 送信に失敗しても、押した人の画面が止まらないこと
 *   3. 本文もメールアドレスも送らないこと
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EVENTS, track } from "../src/lib/analytics";
import { KeepArtifactButton } from "../src/components/course/KeepArtifactButton";
import { SkillDexPage } from "../src/pages/SkillDexPage";

/** 送られた操作ログの本文だけを集める。 */
function watch() {
  const sent: Record<string, unknown>[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/learning-events/")) {
      sent.push(JSON.parse(String(init?.body)));
      return { ok: true, status: 204, json: async () => null } as Response;
    }
    if (url.includes("/saved/")) {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          artifact: { id: "a1", skills: [] },
          already_saved: false,
        }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        skills: [],
        acquired_count: 0,
        total_count: 0,
        combos: [],
        xp: { total: 0, level: "AI Starter", next_level: null, to_next: null },
      }),
    } as Response;
  });
  return sent;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("名前の置き場", () => {
  it("画面から送る分が、1か所にそろっている", () => {
    /*
      画面ごとに文字列を書くと、綴りの違う行が静かに増える。
      捨てられても画面は止まらないので、気づくのは集計を見たとき。
    */
    expect(Object.values(EVENTS)).toEqual([
      "signup_started",
      "signup_completed",
      "google_auth_failed",
      // 登録までの道のり。押した順に並べる
      "signup_prompt_viewed",
      "auth_google_clicked",
      "auth_passkey_clicked",
      "returned_to_lesson",
      "passkey_registration_failed",
      "password_reset_requested",
      // 無料で使える分を使い切ったあと、その場で選んだ道
      "register_now_clicked",
      "wait_tomorrow_clicked",
      "mission_completed",
      "artifact_saved",
      "skill_dictionary_opened",
    ]);
  });

  it("サーバーが決めるものは、ここから送らない", () => {
    /*
      技・XP・節目はサーバー側で判定して記録している（設計方針 §36）。
      画面から送ると、送られてこなかった回と起きなかった回の
      区別が付かなくなる。
    */
    const names = Object.values(EVENTS) as string[];
    expect(names).not.toContain("ai_skill_acquired");
    expect(names).not.toContain("xp_earned");
    expect(names).not.toContain("course_checkpoint_completed");
    expect(names).not.toContain("password_reset_sent");
    /*
      断ったのはサーバー（apps/ai/views.py の `_out_of_credits`）で、
      そこで既に記録している。画面からも送ると二重に数える。
    */
    expect(names).not.toContain("guest_text_limit_reached");
  });
});

describe("送り方", () => {
  it("レッスンの外の記録は、教材の id を空で送る", async () => {
    // 空のときサーバーはセッションを作らない（数え上げに混ぜない）
    const sent = watch();

    track(EVENTS.skillDictionaryOpened);

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].lesson_id).toBe("");
  });

  it("送信に失敗しても、投げない", async () => {
    // 記録のために学習や登録を止めない
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    expect(() => track(EVENTS.signUpStarted)).not.toThrow();
  });

  it("本文の入る欄を持たない", async () => {
    const sent = watch();

    track(EVENTS.artifactSaved, { lessonId: "rewrite_text" });

    await waitFor(() => expect(sent).toHaveLength(1));
    for (const key of ["user_input", "text", "content", "email"]) {
      expect(sent[0]).not.toHaveProperty(key);
    }
  });
});

describe("実際に送られる場面", () => {
  it("図鑑を開くと、1回送る", async () => {
    const sent = watch();

    render(<SkillDexPage onSelectLesson={() => {}} onOpenCourse={() => {}} />);

    await waitFor(() =>
      expect(
        sent.filter((body) => body.event_type === "skill_dictionary_opened"),
      ).toHaveLength(1),
    );
  });

  it("取っておくと、1回送る", async () => {
    const user = userEvent.setup();
    const sent = watch();

    render(<KeepArtifactButton lessonId="rewrite_text" output="できた文章" />);
    await user.click(screen.getByTestId("keep-artifact"));

    await waitFor(() =>
      expect(sent.filter((body) => body.event_type === "artifact_saved")).toHaveLength(
        1,
      ),
    );
  });

  it("すでに取ってあるときは、送らない", async () => {
    // 同じ物が増えていないので、保存でもない
    const user = userEvent.setup();
    const sent: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/learning-events/")) {
        sent.push(JSON.parse(String(init?.body)));
        return { ok: true, status: 204, json: async () => null } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ artifact: { id: "a1" }, already_saved: true }),
      } as Response;
    });

    render(<KeepArtifactButton lessonId="rewrite_text" output="できた文章" />);
    await user.click(screen.getByTestId("keep-artifact"));
    await waitFor(() =>
      expect(screen.getByTestId("keep-artifact")).toHaveTextContent("取ってあります"),
    );

    expect(sent.filter((body) => body.event_type === "artifact_saved")).toHaveLength(0);
  });
});
