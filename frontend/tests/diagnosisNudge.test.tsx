/**
 * ホームで1度だけ出す、「まずは診断を」の案内。
 *
 * 守りたいのは2つ。**下のほうが重い。**
 *
 *   1. 初めて来た人に、1度は出る
 *   2. **それ以外の人には、1度も出ない**
 *
 * 2つ目のほうが重いのは、案内は出しそこねても常設の入口から辿れる
 * のに対し、二度目を出すと「閉じたのに戻ってきた」になるため。もう
 * 使っている人に突然かぶせるのは、それより悪い。
 *
 * だから条件は5つとも、**1つでも欠けたら出さない**形にしてある。
 * ここではその5つを1つずつ外して確かめる。
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DiagnosisNudgeDialog } from "../src/components/aippo/DiagnosisNudge";
import {
  DIAGNOSIS_FIRST_QUESTION_ID,
  DIAGNOSIS_LESSON_ID,
  forgetGuestSeen,
  markGuestSeen,
  readGuestSeen,
  shouldShowNudge,
  type NudgeFacts,
} from "../src/course/diagnosisNudge";
import { getLesson } from "../src/course/catalog";
import { hasAnyDraft, openedBefore, saveDraft } from "../src/lib/draft";

/** 初めて来た人。ここから1つずつ崩す。 */
const NEWCOMER: NudgeFacts = {
  ready: true,
  seen: false,
  diagnosisDone: false,
  diagnosisStarted: false,
  hasHistory: false,
  otherDialogOpen: false,
};

describe("出すかどうか", () => {
  it("初めて来た人には出す", () => {
    expect(shouldShowNudge(NEWCOMER)).toBe(true);
  });

  it("確認が終わるまでは出さない", () => {
    /*
      ログイン状態と進み具合が届く前に決めると、**一瞬出してから
      消える**か、出すべき人に出ないかのどちらかになる。
    */
    expect(shouldShowNudge({ ...NEWCOMER, ready: false })).toBe(false);
  });

  it("もう見せた人には出さない", () => {
    expect(shouldShowNudge({ ...NEWCOMER, seen: true })).toBe(false);
  });

  it("診断を終えた人には出さない", () => {
    expect(shouldShowNudge({ ...NEWCOMER, diagnosisDone: true })).toBe(false);
  });

  it("診断を始めている人には出さない", () => {
    /*
      途中で閉じた人を含む。「まずは診断を」と言われても、
      その人はもう始めている。
    */
    expect(shouldShowNudge({ ...NEWCOMER, diagnosisStarted: true })).toBe(false);
  });

  it("もう学んでいる人には出さない", () => {
    /*
      **今回この機能が増えたことを理由に、常連のホームへ突然
      かぶせない。** いちばん避けたい出方。
    */
    expect(shouldShowNudge({ ...NEWCOMER, hasHistory: true })).toBe(false);
  });

  it("ほかの一枚が開いているときは出さない", () => {
    expect(shouldShowNudge({ ...NEWCOMER, otherDialogOpen: true })).toBe(false);
  });
});

describe("ゲストの「見た」を覚える", () => {
  beforeEach(() => {
    window.localStorage.clear();
    forgetGuestSeen();
  });

  it("立てるまでは、見ていない", () => {
    expect(readGuestSeen()).toBe(false);
  });

  it("立てたら、次に聞いたときも見たことになっている", () => {
    markGuestSeen();

    expect(readGuestSeen()).toBe(true);
  });

  it("端末に残る。読み込み直しても消えない", () => {
    markGuestSeen();
    // 読み込み直し＝この回の控えが消えた状態
    forgetGuestSeenInMemoryOnly();

    expect(readGuestSeen()).toBe(true);
  });

  it("保存が使えなくても、その回のあいだは出し直さない", () => {
    /*
      プライベートモード・容量超過・設定で無効。**毎回出る**のが
      いちばん困る形なので、せめて同じ回のあいだは控えが効く。
      読み込み直せば消える——それは端末側の制約で、直せない。
    */
    const broken = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    markGuestSeen();

    expect(readGuestSeen()).toBe(true);
    broken.mockRestore();
  });
});

/** 端末の控えだけを残して、この回の控えを落とす（読み込み直しの再現）。 */
function forgetGuestSeenInMemoryOnly(): void {
  const kept = window.localStorage.getItem("aippo:diagnosis-nudge");
  forgetGuestSeen();
  if (kept) window.localStorage.setItem("aippo:diagnosis-nudge", kept);
}

describe("ゲストが「もう使っている人」かどうかの手がかり", () => {
  beforeEach(() => window.localStorage.clear());

  it("何もしていなければ、跡は残っていない", () => {
    expect(hasAnyDraft()).toBe(false);
    expect(openedBefore()).toBe(false);
  });

  it("1本でも途中まで進めていれば、跡が残る", () => {
    saveDraft({ lessonId: "rewrite_text", stepId: "ask_first", values: {} });

    expect(hasAnyDraft()).toBe(true);
  });

  it("今日はじめて開いただけなら、「前にも来た」にはしない", () => {
    /*
      連続日数では見分けられない。`touchStreak()` は今日の分をその場で
      1 にするので、**初めて来た人も 1 になる**。日付そのものを見る。
    */
    const today = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(
      "aippo:streak",
      JSON.stringify({ days: 1, lastDate: today, openDays: [today] }),
    );

    expect(openedBefore()).toBe(false);
  });

  it("今日より前に開いた日があれば、「前にも来た」", () => {
    const today = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(
      "aippo:streak",
      JSON.stringify({ days: 2, lastDate: today, openDays: [today, "2020-01-01"] }),
    );

    expect(openedBefore()).toBe(true);
  });
});

describe("案内の一枚", () => {
  const open = (over: Partial<Parameters<typeof DiagnosisNudgeDialog>[0]> = {}) => {
    const onStart = vi.fn();
    const onClose = vi.fn();
    render(
      <DiagnosisNudgeDialog onStart={onStart} onClose={onClose} {...over} />,
    );
    return { onStart, onClose };
  };

  it("何の案内で、何が分かって、どれくらいかかるかを出す", () => {
    open();

    expect(screen.getByText("AIPPOへようこそ")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /まずは、AI活用診断を/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("diagnosis-nudge-meta")).toHaveTextContent(
      "約1分",
    );
    /* 押す前に出てくる不安に、先に答えておく */
    expect(screen.getByTestId("diagnosis-nudge-meta")).toHaveTextContent(
      "正解・不正解なし",
    );
  });

  it("読み上げに、名前と説明の両方が届く", () => {
    open();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(/AI活用診断/);
    expect(dialog).toHaveAccessibleDescription(/5つの質問/);
  });

  it("閉じるボタンに、名前が付いている", () => {
    open();

    expect(screen.getByTestId("diagnosis-nudge-close")).toHaveAccessibleName(
      "閉じる",
    );
  });

  it("「診断をはじめる」で始まる", () => {
    const { onStart } = open();

    fireEvent.click(screen.getByTestId("diagnosis-nudge-start"));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("2回押されても、1回しか進まない", () => {
    /*
      指の2度目は、一枚が閉じるより早いことがある。2回進むと履歴に
      同じ行き先が2つ積まれ、診断から戻った人がもう一度診断に着く。
    */
    const { onStart } = open();
    const start = screen.getByTestId("diagnosis-nudge-start");

    fireEvent.click(start);
    fireEvent.click(start);

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("「あとで」で閉じられる", () => {
    const { onClose, onStart } = open();

    fireEvent.click(screen.getByTestId("diagnosis-nudge-later"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("「×」で閉じられる", () => {
    const { onClose } = open();

    fireEvent.click(screen.getByTestId("diagnosis-nudge-close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape で閉じられる", () => {
    const { onClose } = open();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("背景を押しても閉じない", () => {
    /*
      1人に1度しか出ない案内なので、指が外れただけで消えると、
      読む前に無くなった人にはもう出ない。閉じ方は×・あとで・Esc の3つ。
    */
    const { onClose } = open();

    fireEvent.click(screen.getByTestId("diagnosis-nudge-scrim"));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("診断の1問目", () => {
  it("教材に、その id の回がある", () => {
    /*
      案内から入った人は、この id へ直接入る。教材を並べ替えた日に
      **無言で開始説明へ戻る**ので、id が生きていることを見張る。
    */
    const diagnosis = getLesson(DIAGNOSIS_LESSON_ID)!;

    expect(diagnosis.steps.some((step) => step.id === DIAGNOSIS_FIRST_QUESTION_ID))
      .toBe(true);
  });

  it("開始説明の、次の回になっている", () => {
    /*
      飛ばすのは**開始説明の1枚だけ**。2枚以上飛ばすと、案内で説明して
      いないことまで飛ばすことになる。
    */
    const diagnosis = getLesson(DIAGNOSIS_LESSON_ID)!;
    const order = diagnosis.steps.map((step) => step.id);

    expect(diagnosis.steps[0].type).toBe("intro");
    expect(order.indexOf(DIAGNOSIS_FIRST_QUESTION_ID)).toBe(1);
  });
});
