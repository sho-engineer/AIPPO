/**
 * できたときの短い音。
 *
 * 既定は**切**。
 * 音は、画面の中で唯一「利用者が見ていない方向へ勝手に出ていく」もの。
 * 電車の中や職場で開いた人に、断りなく鳴らさない。入れたい人だけが
 * 設定で入れる（設定 → 音）。
 *
 * 音そのものは意味を運ばない
 * --------------------------
 * 鳴らない人・切っている人・聞こえない人にも、できたことは
 * 文字（StepDone の role="status"）で必ず届く。音はその**上乗せ**であって、
 * これだけが手がかりになる状態を作らない。
 *
 * 音源ファイルを置かない理由
 * --------------------------
 * mp3 を1つ置くと、最初の1回はネットワーク待ちになる。押した手応えが
 * 遅れて返ってくると、手応えではなく雑音になる。数十msの短い音なので、
 * その場で作るほうが速く、確実に鳴る。
 *
 * 鳴らせない場面は黙って諦める
 * ----------------------------
 * ブラウザは「利用者が一度も触っていないページ」の音を止める。
 * これは正しい挙動なので、逆らわない。鳴らなくても学習は進むので、
 * 例外は握りつぶして、画面は止めない。
 */

import { loadSettings } from "../lib/settings";

/**
 * 鳴らす場面と、その音。
 *
 * 上がる形にそろえる。下がる形は失敗の合図に聞こえる。
 * 和音にはしない——賑やかすぎて、19歩ぶん繰り返すと耳につく。
 *
 * **場面ごとに長さで差を付ける。** 高さを大きく変えると、どれかが
 * 目立って「そこだけ大事」に見える。1歩進むたびの音がいちばん短く、
 * コースを終えたときだけ3音になる。
 *
 *     step        1歩進んだ         2音・短い（いちばん多く鳴る）
 *     result      AIの返事が届いた   1音・ごく短い
 *     skill       AI技をおぼえた     3音・軽く上がる
 *     complete    レッスンを終えた   3音・ゆっくり
 *     milestone   節目・コース完走   3音・長い
 *     day         Day を終えた      4音・いちばん豊か（0.7秒）
 */
const CUES = {
  step: [
    { hz: 784, delay: 0, length: 0.09 }, // ソ
    { hz: 1046, delay: 0.07, length: 0.16 }, // 高いド
  ],
  result: [{ hz: 880, delay: 0, length: 0.1 }], // ラ
  skill: [
    { hz: 784, delay: 0, length: 0.08 },
    { hz: 988, delay: 0.06, length: 0.08 },
    { hz: 1319, delay: 0.12, length: 0.2 },
  ],
  complete: [
    { hz: 659, delay: 0, length: 0.12 },
    { hz: 880, delay: 0.1, length: 0.12 },
    { hz: 1319, delay: 0.2, length: 0.28 },
  ],
  milestone: [
    { hz: 659, delay: 0, length: 0.14 },
    { hz: 988, delay: 0.13, length: 0.14 },
    { hz: 1319, delay: 0.26, length: 0.4 },
  ],
  /*
    Day を終えた合図。**この中でいちばん豊か。**

    4音にしてある。1本終えた `complete` と同じ音だと、Day の区切りが
    ただのレッスン完了と同じ重さに聞こえる。それでも 0.7 秒で終える
    ——ジングルにはしない。
  */
  day: [
    { hz: 659, delay: 0, length: 0.12 },
    { hz: 880, delay: 0.11, length: 0.12 },
    { hz: 1046, delay: 0.22, length: 0.12 },
    { hz: 1319, delay: 0.33, length: 0.34 },
  ],
} as const;

export type Cue = keyof typeof CUES;

/** 音の大きさ。手応えとして分かる下限まで落とす。 */
const VOLUME = 0.05;

/**
 * 音を出す箱。
 *
 * 1回ごとに作ると、ブラウザが持てる数の上限（多くは6個）にすぐ当たって、
 * 数回で鳴らなくなる。1つ作って使い回す。
 */
let shared: AudioContext | null = null;

type AudioContextCtor = typeof AudioContext;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const Ctor =
    (window as unknown as { AudioContext?: AudioContextCtor }).AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext;
  if (!Ctor) return null;

  try {
    if (!shared) shared = new Ctor();
    // 触るまで止まっている決まりの環境がある。止まったままだと無音になる
    if (shared.state === "suspended") void shared.resume();
    return shared;
  } catch {
    return null;
  }
}

/** 設定で入れているか。押した瞬間の値を読む（画面をまたいで持ち回らない）。 */
export function isSuccessSoundOn(): boolean {
  try {
    return loadSettings().successSound;
  } catch {
    return false;
  }
}

/**
 * 設定を見て鳴らす。学習中はこちらを呼ぶ。
 *
 * 場面を省くと、1歩進んだときの音になる（いちばん多く鳴る場面）。
 */
export function playSuccessSound(cue: Cue = "step"): void {
  if (!isSuccessSoundOn()) return;
  previewSuccessSound(cue);
}

/**
 * 設定を見ずに鳴らす。設定画面の「試す」だけが呼ぶ。
 *
 * 入れた直後に playSuccessSound を呼んでも鳴らない。React の状態更新は
 * すぐには走らないので、その時点で端末に書かれているのはまだ**切**。
 * 「入れたのに鳴らない」を避けるため、確かめ用は設定を読まない口にする。
 */
export function previewSuccessSound(cue: Cue = "step"): void {
  const context = audioContext();
  if (!context) return;

  try {
    const now = context.currentTime;
    for (const note of CUES[cue]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      // 正弦波にする。矩形波は同じ高さでも安っぽく響く
      oscillator.type = "sine";
      oscillator.frequency.value = note.hz;

      /*
        音の出入りをなめらかにする。いきなり鳴らして
        いきなり止めると、両端で「プツッ」と鳴る。
        0 へは落とせない（指数の傾きなので）ため、十分小さい値まで下げる。
      */
      const start = now + note.delay;
      const end = start + note.length;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(VOLUME, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    }
  } catch {
    // 鳴らせない場面（自動再生の制限など）では、黙って諦める
  }
}

/** テスト用。使い回している箱を捨てる。 */
export function resetAudioForTest(): void {
  shared = null;
}
