import { describe, expect, it } from "vitest";

import { SCREENS, canTransition, nextScreen } from "../src/app/screens";

describe("画面遷移", () => {
  it("11画面（コースは一覧と中身の2段）", () => {
    expect(SCREENS).toEqual([
      "TOP",
      "HOME",
      "COURSE",
      "COURSE_DETAIL",
      "LESSON",
      "RECIPE",
      "RECORD",
      "SKILLS",
      "WORKS",
      "SAVED",
      "SETTINGS",
    ]);
  });

  it("マイ成果物から、その教材へ戻れる", () => {
    // 「これをもう一度」が、この画面のいちばん多い使われ方になる
    expect(nextScreen("WORKS", "SELECT_LESSON")).toBe("LESSON");
  });

  it("AI技図鑑から、その技を習得できるレッスンへ入れる", () => {
    /*
      読んで終わりにしない。取れていない技の隣に、取れる教材への
      行き先を必ず置く（使い方の説明と同じ考え方）。
    */
    expect(nextScreen("SKILLS", "SELECT_LESSON")).toBe("LESSON");
  });

  it("AI技図鑑は、行き止まりにしない", () => {
    expect(canTransition("SKILLS", "BACK_TO_HOME")).toBe(true);
  });

  it("完了画面から、使い方のくわしい説明へ行ける", () => {
    expect(nextScreen("LESSON", "OPEN_RECIPE")).toBe("RECIPE");
  });

  it("使い方の説明から、足りない技のレッスンへ入れる", () => {
    /*
      読んで終わりにしない。「自分にはまだできない」で止めず、
      その場から学びに行けるようにする。
    */
    expect(nextScreen("RECIPE", "SELECT_LESSON")).toBe("LESSON");
  });

  it("使い方の説明は、行き止まりにしない", () => {
    expect(canTransition("RECIPE", "BACK_TO_HOME")).toBe(true);
  });

  it("コースは、一覧 → 中身 → レッスンの3段で進む", () => {
    /*
      前は一覧から直接レッスンへ行っていた。コースが1つのあいだは
      それで足りたが、7つに増えると「どのコースの何本目か」が
      画面から消える。
    */
    expect(nextScreen("COURSE", "OPEN_COURSE_DETAIL")).toBe("COURSE_DETAIL");
    expect(nextScreen("COURSE_DETAIL", "SELECT_LESSON")).toBe("LESSON");
  });

  it("コースの中身から戻る先は、コース一覧", () => {
    expect(nextScreen("COURSE_DETAIL", "OPEN_COURSE")).toBe("COURSE");
  });

  it("レッスンから1つ戻る先は、そのコースの中身", () => {
    // 一覧まで戻すと、同じコースの次の1本へ行くのに2回押すことになる
    expect(nextScreen("LESSON", "OPEN_COURSE_DETAIL")).toBe("COURSE_DETAIL");
  });

  it("保存したものへは、下タブのどこからでも行ける", () => {
    // 取っておいたものを開くのに、一覧を読み下させない
    expect(nextScreen("HOME", "OPEN_SAVED")).toBe("SAVED");
    expect(nextScreen("COURSE", "OPEN_SAVED")).toBe("SAVED");
    expect(nextScreen("RECORD", "OPEN_SAVED")).toBe("SAVED");
    expect(nextScreen("SETTINGS", "OPEN_SAVED")).toBe("SAVED");
  });

  it("保存したものから、そのまま開ける／行き止まりにならない", () => {
    expect(nextScreen("SAVED", "SELECT_LESSON")).toBe("LESSON");
    expect(nextScreen("SAVED", "BACK_TO_HOME")).toBe("HOME");
    expect(nextScreen("SAVED", "OPEN_COURSE")).toBe("COURSE");
  });

  it("レッスンの途中からは、保存したものへ入れない", () => {
    // 1画面1タスクを崩さない。設定と同じ扱いにする
    expect(canTransition("LESSON", "OPEN_SAVED")).toBe(false);
  });

  it("学習履歴へは、下タブのどこからでも行ける", () => {
    // 作ったものを取りに来る場所なので、どこからでも1手で開けること
    expect(nextScreen("HOME", "OPEN_RECORD")).toBe("RECORD");
    expect(nextScreen("COURSE", "OPEN_RECORD")).toBe("RECORD");
    expect(nextScreen("SETTINGS", "OPEN_RECORD")).toBe("RECORD");
  });

  it("学習履歴から、同じ教材をやり直せる", () => {
    // 見返して「もう一度」と思ったときに、探し直させない
    expect(nextScreen("RECORD", "SELECT_LESSON")).toBe("LESSON");
  });

  it("学習履歴が行き止まりにならない", () => {
    expect(nextScreen("RECORD", "BACK_TO_HOME")).toBe("HOME");
    expect(nextScreen("RECORD", "OPEN_COURSE")).toBe("COURSE");
  });

  it("タイトル → ホーム → レッスン と進める", () => {
    expect(nextScreen("TOP", "START")).toBe("HOME");
    expect(nextScreen("HOME", "SELECT_LESSON")).toBe("LESSON");
  });

  it("ホームとコース一覧は行き来できる（下タブ）", () => {
    expect(nextScreen("HOME", "OPEN_COURSE")).toBe("COURSE");
    expect(nextScreen("COURSE", "BACK_TO_HOME")).toBe("HOME");
  });

  it("コース一覧からもレッスンへ入れる", () => {
    expect(nextScreen("COURSE", "SELECT_LESSON")).toBe("LESSON");
  });

  it("レッスンを終えたらホームへ戻る（行き止まりにしない）", () => {
    expect(nextScreen("LESSON", "BACK_TO_HOME")).toBe("HOME");
  });

  it("レッスンから一覧へも抜けられる", () => {
    expect(nextScreen("LESSON", "OPEN_COURSE")).toBe("COURSE");
  });

  it("一覧とレッスンからタイトルへ戻れる", () => {
    expect(nextScreen("COURSE", "BACK_TO_TOP")).toBe("TOP");
    expect(nextScreen("LESSON", "BACK_TO_TOP")).toBe("TOP");
  });

  it("タイトルから直接レッスンへは進めない", () => {
    expect(canTransition("TOP", "SELECT_LESSON")).toBe(false);
    expect(nextScreen("TOP", "SELECT_LESSON")).toBe("TOP");
  });

  it("設定はホームと教材一覧から開け、どちらへも抜けられる", () => {
    expect(nextScreen("HOME", "OPEN_SETTINGS")).toBe("SETTINGS");
    expect(nextScreen("COURSE", "OPEN_SETTINGS")).toBe("SETTINGS");
    expect(nextScreen("SETTINGS", "BACK_TO_HOME")).toBe("HOME");
    expect(nextScreen("SETTINGS", "OPEN_COURSE")).toBe("COURSE");
  });

  it("レッスンの途中からは設定へ入れない（1画面1タスクを崩さない）", () => {
    expect(canTransition("LESSON", "OPEN_SETTINGS")).toBe(false);
  });

  it("遷移表に無いイベントは現在の画面を維持する", () => {
    expect(nextScreen("TOP", "BACK_TO_TOP")).toBe("TOP");
    expect(canTransition("LESSON", "START")).toBe(false);
  });
});

describe("AI技図鑑への行き方", () => {
  /*
    「何を学んだか」（学習記録）の隣に「何ができるか」（図鑑）を置く。
    ここが抜けていると、押しても画面が変わらないボタンになる——
    落ちないので、押した人には壊れているのか自分の勘違いなのか
    分からない。
  */
  it.each(["HOME", "COURSE", "RECORD", "SAVED", "SETTINGS"] as const)(
    "%s から開ける",
    (from) => {
      expect(nextScreen(from, "OPEN_SKILLS")).toBe("SKILLS");
    },
  );
});

describe("下タブから外した2つ", () => {
  /*
    タブから消すのと、行き先ごと消すのは別のこと。
    AI技とマイ成果物を入れるために外したが、探せば必ず見つかる
    場所を残す。ここが切れると、押せない機能ができる。
  */
  it("学習記録は、その他とホームから開ける", () => {
    expect(nextScreen("SETTINGS", "OPEN_RECORD")).toBe("RECORD");
    expect(nextScreen("HOME", "OPEN_RECORD")).toBe("RECORD");
  });

  it("あとで見るは、その他とホームから開ける", () => {
    expect(nextScreen("SETTINGS", "OPEN_SAVED")).toBe("SAVED");
    expect(nextScreen("HOME", "OPEN_SAVED")).toBe("SAVED");
  });
});
