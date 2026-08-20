/**
 * 設定の保存と読み出し。
 *
 * 置き場は端末（localStorage）。
 *
 * このアプリには利用者登録が無い（learner_key の Cookie だけで動く）。
 * 設定をサーバーへ預けるには「誰の設定か」を決める必要があり、
 * それは実証実験の段階で背負うにはまだ重い。
 * 端末に置けば、登録も同意も要らずに、その場で効く。
 *
 * 端末に置くことの割り切り
 * ------------------------
 * - 別の端末へは持ち越せない。持ち越したくなったら、そのときに
 *   サーバーへ移す（形は下の Settings をそのまま送れば足りる）
 * - 消される可能性がある。消えても既定値で動くようにしてある
 *
 * 読み書きは必ずここを通す。画面から直接 localStorage を触ると、
 * 鍵の名前と既定値が散らばって、片方だけ直す事故が起きる。
 */

/** 回答の長さの目安。AI へ渡す言葉は resolve 側で決める。 */
export const ANSWER_LENGTHS = ["short", "standard", "long"] as const;
export type AnswerLength = (typeof ANSWER_LENGTHS)[number];

/** 出力のトーン。 */
export const TONES = [
  { value: "polite", label: "丁寧" },
  { value: "friendly", label: "フレンドリー" },
  { value: "simple", label: "シンプル" },
  { value: "formal", label: "フォーマル" },
] as const;
export type Tone = (typeof TONES)[number]["value"];

/**
 * 表示する言語。
 *
 * **いまは設定画面に出していない。** 翻訳の仕組み（文言の外出しと辞書）が
 * まだ無く、切り替えても画面の言葉は1つも変わらないため。
 * 設定画面では「準備中です。いまは日本語のみです」と書いて止めてある
 * （SettingsPage）。選ばせてから「効きません」と断るより、
 * 最初から選ばせないほうが正直で、外部連携やサブスクリプションと
 * 扱いも揃う。
 *
 * ここに一覧と型を残しておくのは、辞書ができたときに
 * 設定画面へ戻すのが**この定数を読む1画面だけ**で済むようにするため。
 * 保存の形（Settings.language）も変えない。すでに端末へ書かれた値が、
 * 用意できた日にそのまま効く。
 *
 * 教材本文は多言語化しない（憲章の「MVPで作らないもの」）。
 * 訳すのは画面まわりの言葉だけにする。
 */
export const LANGUAGES = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
] as const;
export type Language = (typeof LANGUAGES)[number]["value"];

/** 1日の学習目標（分）。0 は「決めない」。 */
export const DAILY_GOALS = [0, 10, 20, 30] as const;

export interface Settings {
  // --- AI ---------------------------------------------------------------
  /** 空なら「サーバーの既定にまかせる」。モデル名は画面に持たない。 */
  aiModel: string;
  tone: Tone;
  answerLength: AnswerLength;
  /** AI が何を根拠にしたかを結果のそばに出すか。 */
  showSources: boolean;

  // --- 学習 -------------------------------------------------------------
  dailyGoalMinutes: number;
  /** 解説カードを自動で開くか。飛ばしたい人は切れる。 */
  autoOpenConcepts: boolean;

  // --- 通知 -------------------------------------------------------------
  remindStudy: boolean;
  notifyRecommendations: boolean;
  notifyUpdates: boolean;
  notifyByEmail: boolean;

  // --- 表示 -------------------------------------------------------------
  language: Language;

  // --- 音 ---------------------------------------------------------------
  /**
   * できたときに短い音を鳴らすか。
   *
   * 既定は切。音は画面の外へ勝手に出ていくので、断りなく鳴らさない。
   */
  successSound: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  aiModel: "",
  tone: "friendly",
  answerLength: "standard",
  showSources: true,

  dailyGoalMinutes: 10,
  autoOpenConcepts: true,

  remindStudy: true,
  notifyRecommendations: true,
  // 既定で切っておく。宣伝寄りの知らせを、黙って入れない
  notifyUpdates: false,
  notifyByEmail: false,

  language: "ja",

  // 既定で切っておく。周りに人がいる場所で開いた人に、黙って鳴らさない
  successSound: false,
};

const STORAGE_KEY = "aippo:settings";

/**
 * 読み出し。
 *
 * 保存された形が古くても落とさない。既定値の上に、
 * **型が合う項目だけ**を重ねる。片方が壊れていても残りは効く。
 */
export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged = { ...DEFAULT_SETTINGS };

    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const value = parsed[key];
      if (typeof value === typeof DEFAULT_SETTINGS[key]) {
        // 型が同じことは上で確かめている
        (merged as Record<string, unknown>)[key] = value;
      }
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても、その場の表示は動く（プライベートモードなど）
  }
}

/** 設定をすべて消して既定へ戻す。 */
export function resetSettings(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 消せなくても既定値で動く
  }
}

/**
 * 学習の記録をすべて消す。
 *
 * 「学習データの削除」で呼ぶ。設定は残す（別物なので分けて消せるようにする）。
 * 端末に置いた鍵をひとつずつ消すのではなく、接頭辞で拾って消す。
 * 鍵を足したときに消し忘れるのを防ぐため。
 */
export function clearLearningData(): string[] {
  const removed: string[] = [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("aippo:") && key !== STORAGE_KEY) keys.push(key);
    }
    for (const key of keys) {
      window.localStorage.removeItem(key);
      removed.push(key);
    }
  } catch {
    // 消せない環境でも画面は止めない
  }
  return removed;
}

/**
 * 持ち帰れる形にまとめる。
 *
 * 「学習データのエクスポート」で使う。中身は端末にあるものだけで、
 * サーバーへは何も問い合わせない（そもそも本文を預けていない）。
 */
export function exportLearningData(): string {
  const data: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    settings: loadSettings(),
    entries: {} as Record<string, unknown>,
  };
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith("aippo:")) continue;
      const raw = window.localStorage.getItem(key) ?? "";
      try {
        (data.entries as Record<string, unknown>)[key] = JSON.parse(raw);
      } catch {
        (data.entries as Record<string, unknown>)[key] = raw;
      }
    }
  } catch {
    // 読めない環境では、設定だけの控えになる
  }
  return JSON.stringify(data, null, 2);
}
