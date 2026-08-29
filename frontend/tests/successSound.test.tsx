/**
 * できたときの音。
 *
 * 確かめるのは鳴り方（周波数や長さ）ではない。そこは耳で決めるもので、
 * 数を固定すると音色を変えるたびに落ちるだけになる。
 *
 * ここで守るのは4つ。
 *
 *   1. **既定では鳴らない**。断りなく音を出さない
 *   2. 設定で入れた人にだけ鳴る
 *   3. 音を出せない環境でも、画面が止まらない
 *   4. 音が無くても、できたことは文字で届く
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../src/auth/AuthContext";
import { SettingsPage } from "../src/pages/SettingsPage";
import { StepDone } from "../src/components/course/StepDone";
import {
  isSuccessSoundOn,
  playSuccessSound,
  previewSuccessSound,
  resetAudioForTest,
} from "../src/course/sound";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../src/lib/settings";

/**
 * 音の箱の身代わり。
 *
 * jsdom には AudioContext が無いので、鳴らそうとしたかどうかは
 * 「作ろうとしたか」で見る。
 */
function stubAudio() {
  const started: number[] = [];

  class FakeParam {
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
  }
  class FakeOscillator {
    type = "";
    frequency = { value: 0 };
    connect() {}
    start(at: number) {
      started.push(at);
    }
    stop() {}
  }
  class FakeContext {
    state = "running";
    currentTime = 0;
    destination = {};
    resume() {}
    createOscillator() {
      return new FakeOscillator();
    }
    createGain() {
      return { gain: new FakeParam(), connect() {} };
    }
  }

  vi.stubGlobal("AudioContext", FakeContext);
  return started;
}

beforeEach(() => {
  window.localStorage.clear();
  resetAudioForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  resetAudioForTest();
});

describe("既定の状態", () => {
  it("設定を触っていなければ、切のまま", () => {
    /*
      いちばん大事な1本。周りに人がいる場所で開いた人に、
      いきなり音を出さない。
    */
    expect(DEFAULT_SETTINGS.successSound).toBe(false);
    expect(isSuccessSoundOn()).toBe(false);
  });

  it("既定のままなら、鳴らそうとすらしない", () => {
    const started = stubAudio();

    playSuccessSound();

    expect(started).toHaveLength(0);
  });
});

describe("設定で入れたとき", () => {
  it("鳴る", () => {
    const started = stubAudio();
    saveSettings({ ...DEFAULT_SETTINGS, successSound: true });

    playSuccessSound();

    // 2音（上がる形）。1音だと「鳴った」しか伝わらない
    expect(started).toHaveLength(2);
  });

  it("切り戻せば、また鳴らなくなる", () => {
    const started = stubAudio();
    saveSettings({ ...DEFAULT_SETTINGS, successSound: true });
    playSuccessSound();
    expect(started).toHaveLength(2);

    saveSettings({ ...DEFAULT_SETTINGS, successSound: false });
    playSuccessSound();

    expect(started).toHaveLength(2);
  });
});

describe("確かめ用の口", () => {
  it("設定を見ずに鳴らす", () => {
    /*
      設定画面で入れた直後に鳴らすためのもの。React の状態更新は
      すぐには走らないので、その瞬間に端末へ書かれているのはまだ切。
      設定を読む口を使うと「入れたのに鳴らない」になる。
    */
    const started = stubAudio();
    expect(isSuccessSoundOn()).toBe(false);

    previewSuccessSound();

    expect(started).toHaveLength(2);
  });
});

describe("鳴らせない環境", () => {
  it("AudioContext が無くても落ちない", () => {
    // jsdom の素の状態がこれ。古い端末や、音を止めている環境も同じ
    saveSettings({ ...DEFAULT_SETTINGS, successSound: true });

    expect(() => playSuccessSound()).not.toThrow();
  });

  it("音の箱が作れなくても落ちない", () => {
    // 自動再生の制限で、作った瞬間に投げてくることがある
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("not allowed");
        }
      },
    );
    saveSettings({ ...DEFAULT_SETTINGS, successSound: true });

    expect(() => playSuccessSound()).not.toThrow();
  });
});

describe("設定画面", () => {
  /*
    「準備中」で止めた設定が並ぶ画面なので、ここだけは**本当に効く**ことを
    確かめる。触れるのに何も起きない項目を、もう一つ増やさない。
  */
  const open = async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response,
    );
    render(
      <AuthProvider>
        <SettingsPage onBack={() => {}} onOpenRecord={() => {}} onOpenSaved={() => {}} />
      </AuthProvider>,
    );
    await act(async () => {});
    await userEvent.setup().click(
      screen.getByRole("button", { name: /できたときの短い音/ }),
    );
  };

  it("つまみを入れると、端末に残る", async () => {
    stubAudio();
    await open();

    await userEvent.setup().click(
      screen.getByRole("switch", { name: /できたときの音/ }),
    );

    expect(loadSettings().successSound).toBe(true);
  });

  it("入れた瞬間に鳴らして、どんな音かを聞かせる", async () => {
    const started = stubAudio();
    await open();

    await userEvent.setup().click(
      screen.getByRole("switch", { name: /できたときの音/ }),
    );

    expect(started).toHaveLength(2);
  });

  it("切ってあっても「音を試す」は押せて、鳴る", async () => {
    /*
      入れないと聞けない作りだと、「よく分からないが一度入れてみる」しか
      道が無くなる。決める前に聞かせる。
    */
    const started = stubAudio();
    await open();

    const preview = screen.getByTestId("sound-preview");
    expect(preview).toBeEnabled();
    await userEvent.setup().click(preview);

    expect(loadSettings().successSound).toBe(false);
    expect(started).toHaveLength(2);
  });
});

describe("音と文字の関係", () => {
  it("音が鳴らなくても、できたことは読み上げに届く", () => {
    /*
      音だけが手がかりになる状態を作らない。
      既定は切なので、ふだんはこちらしか無い。
    */
    render(<StepDone label="AIが書き直しました" trigger={1} />);

    expect(screen.getByRole("status")).toHaveTextContent("AIが書き直しました");
  });

  it("できた印が出たときに、音も鳴る", () => {
    const started = stubAudio();
    saveSettings({ ...DEFAULT_SETTINGS, successSound: true });

    render(<StepDone label="できました" trigger={1} />);

    expect(started).toHaveLength(2);
  });

  it("できた印が出ても、切っていれば鳴らない", () => {
    const started = stubAudio();

    render(<StepDone label="できました" trigger={1} />);

    expect(screen.getByTestId("step-done")).toBeInTheDocument();
    expect(started).toHaveLength(0);
  });
});
