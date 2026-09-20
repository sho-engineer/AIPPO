import type { Page, Route } from "@playwright/test";

import { skipEntry } from "./entry";

/**
 * バックエンドの応答をスタブへ差し替える。
 *
 * E2E は画面と導線を確かめるものなので、AI の揺れを持ち込まない。
 * **実APIは絶対に呼ばない**（要件 §15）。
 */

export interface GenerateBody {
  lesson_id: string;
  step_id: string;
  action: string;
  input: Record<string, string>;
}

export interface StubOptions {
  /** ログイン状態。既定は未登録。 */
  signedIn?: boolean;
  /** 教材をサーバーから配る。指定しなければ同梱データのまま。 */
  catalog?: unknown;
  /** 生成結果。呼ばれた回数と本文を受け取る。 */
  result?: (callCount: number, body: GenerateBody) => string;
  /** 生成を失敗させる。回数を渡すと、その回だけ失敗する。 */
  failStatus?: number;
  failOnCall?: number;
  /**
   * 断りの種類を表す印。サーバーが返すのと同じ形で返す。
   *
   * `"FREE_CREDITS_EXHAUSTED"` を渡すと「無料で使える分を使い切った」。
   * 画面はこれで「もう一度」ではなく「登録する／明日また続ける」を出す。
   */
  failCode?: string;
  /** 断りの文。画面へそのまま出る。 */
  failDetail?: string;
  /** ポーの発言。 */
  tutor?: Partial<TutorBody>;
  /**
   * 外部ログインの並び。既定は「設定なし」で、ボタンは1つも出ない。
   *
   * 実際の環境では鍵を入れた先だけが出る。既定を空にしておかないと、
   * 設定していないボタンが出る状態を検査が見逃す。
   */
  social?: { name: string; label: string; start_url: string }[];
  /** パスキーを使える端末として振る舞うか。既定は使えない。 */
  passkey?: boolean;
  /** AI技図鑑の中身。既定は「1つも覚えていない」。 */
  skillDex?: unknown;
  /** 学習マップの中身。既定は「Lv.1 に居て、次の段の技が2つ未取得」。 */
  levelMap?: unknown;
  /** 取っておいた成果物。既定は「ゲストなので使えない」。 */
  saved?: unknown;
  /**
   * 入口の2枚（ようこそ・診断の案内）を出すかどうか。既定は**出さない**。
   *
   * なぜ既定で飛ばすか
   * ------------------
   * 検査はどれも `localStorage.clear()` から始めるので、**ほぼ全部の
   * 検査がはじめての人**になる——ホームへ行く道が入口2枚で塞がれ、
   * 確かめたい先へ進めない。
   *
   * 入口そのものを見に来た検査（`e2e/entryFlow.spec.ts`）だけが `true`
   * を渡す。飛ばし方は本物と同じ道（端末に「ゲストで始めた」「案内を
   * 見た」を残す）で、画面側に検査用の抜け道は作っていない。
   */
  showEntry?: boolean;
  /**
   * ログインしたばかりで、まだ何もしていない人として振る舞う。
   *
   * 既定のログイン利用者は途中まで進んでいる（`in_progress: 1`）ので、
   * **登録した初日**の画面はそのままでは作れない。診断の案内が
   * ログイン利用者にも出ることを確かめるのに要る。
   */
  freshAccount?: boolean;
}


export interface TutorBody {
  message: string;
  emotion: string;
  action: string;
}

export interface StubHandle {
  calls: GenerateBody[];
  events: { event_type: string; step: string; input_length: number }[];
  /** 登録・ログインへ送られた本文。合言葉が漏れていないか見るのに使う。 */
  auth: { url: string; body: unknown }[];
  /** 完了時アンケートへ送られた答え。 */
  surveys: { lessonId: string; answers: Record<string, string> }[];
  /** 取っておかれた成果物。 */
  saved: Record<string, unknown>[];
}

const DEFAULT_TUTOR: TutorBody = {
  message: "【スタブ応答】どこが変わったか見てみましょう。",
  emotion: "neutral",
  action: "review",
};

/** 条件を映した固定応答。条件を変えると結果が変わることを確かめられる。 */
function defaultResult(callCount: number, body: GenerateBody): string {
  const conditions = Object.entries(body.input)
    .filter(([key, value]) => value && key !== "original_text" && key !== "topic")
    .map(([, value]) => value)
    .join(" / ");
  const source = body.input.original_text ?? body.input.topic ?? "";
  return `【スタブ応答 ${callCount}回目】${conditions}\n${source.slice(0, 40)}`;
}

export async function stubApi(
  page: Page,
  options: StubOptions = {},
): Promise<StubHandle> {
  const handle: StubHandle = {
    calls: [],
    events: [],
    auth: [],
    surveys: [],
    saved: [],
  };
  let callCount = 0;
  let signedIn = options.signedIn ?? false;

  /*
    入口を通ったことにする。中身は `support/entry.ts`——**スタブを
    使わない検査も同じものが要る**ので、そちらへ出してある。
  */
  if (!options.showEntry) {
    await skipEntry(page);
  }

  await page.route("**/api/v1/ai/generate/", async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 200, body: "" });
      return;
    }

    const body = route.request().postDataJSON() as GenerateBody;
    handle.calls.push(body);
    callCount += 1;

    const shouldFail =
      options.failStatus !== undefined &&
      (options.failOnCall === undefined || options.failOnCall === callCount);

    if (shouldFail) {
      await route.fulfill({
        status: options.failStatus as number,
        contentType: "application/json",
        body: JSON.stringify({
          ...(options.failCode ? { code: options.failCode } : {}),
          errors: {
            detail: [
              options.failDetail ??
                "うまく届かなかったようです。もう一度おくってみましょう。",
            ],
          },
          tutor: {
            message:
              options.failDetail ?? "もう一度おくってみましょう。",
            /*
              使い切ったのは失敗ではないので祝う顔。届かなかったのと
              使えるものにならなかったのは、どちらも「困っている」側。
            */
            emotion:
              options.failCode === "FREE_CREDITS_EXHAUSTED" ? "celebrate" : "warning",
            action:
              options.failCode === "FREE_CREDITS_EXHAUSTED" ? "wait" : "retry",
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        result: (options.result ?? defaultResult)(callCount, body),
        tutor: { ...DEFAULT_TUTOR, ...options.tutor },
        usage: {
          provider: "mock",
          model: "mock-1",
          input_tokens: 10,
          output_tokens: 20,
          latency_ms: 5,
        },
        extras: {},
      }),
    });
  });

  await page.route("**/api/learning-events/", async (route: Route) => {
    if (route.request().method() === "POST") {
      handle.events.push(route.request().postDataJSON());
    }
    await route.fulfill({ status: 204, body: "" });
  });

  /*
    アカウントまわり。

    画面は開くたびに `me` を見るので、ここを塞がないと
    実サーバーへ行くか、通信できずに毎回ゲスト扱いになる。
  */
  await page.route("**/api/v1/accounts/me/", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        signedIn
          ? {
              authenticated: true,
              user: {
                email: "learner@example.com",
                display_name: "たろう",
                email_verified: false,
                terms_version: "2026-08-03",
                joined_at: "2026-08-01T00:00:00+09:00",
                /*
                  ホームの診断の案内を、もう見せたか。登録したばかりの
                  人は「まだ」。既定は「見た」——検査のほとんどは案内を
                  見に来ていないので、そちらを既定にしておく。
                */
                diagnosis_nudge_seen: !options.freshAccount,
              },
              progress: options.freshAccount
                ? { completed: 0, in_progress: 0, devices: 1 }
                : { completed: 0, in_progress: 1, devices: 1 },
            }
          : { authenticated: false },
      ),
    });
  });

  /*
    外部ログインとパスキー。

    どちらも「設定が入っていない先は出さない」作りなので、
    既定では空・使えないを返す。実APIには絶対に行かせない
    （行かせると、開発機に立っているバックエンドの設定で
    検査の結果が変わる）。
  */
  await page.route("**/api/v1/accounts/social/providers/", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ providers: options.social ?? [] }),
    });
  });

  await page.route("**/api/v1/accounts/passkey/support/", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: options.passkey ?? false }),
    });
  });

  await page.route("**/api/v1/accounts/csrf/", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });

  await page.route("**/api/v1/accounts/signup/", async (route: Route) => {
    handle.auth.push({ url: route.request().url(), body: route.request().postDataJSON() });
    signedIn = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          email: "learner@example.com",
          display_name: "",
          email_verified: false,
          terms_version: "2026-08-03",
          joined_at: "2026-08-01T00:00:00+09:00",
        },
        migration: { linked: true, sessions: 1, already_linked: false },
      }),
    });
  });

  await page.route("**/api/v1/accounts/signin/", async (route: Route) => {
    handle.auth.push({ url: route.request().url(), body: route.request().postDataJSON() });
    signedIn = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          email: "learner@example.com",
          display_name: "",
          email_verified: true,
          terms_version: "2026-08-03",
          joined_at: "2026-08-01T00:00:00+09:00",
        },
      }),
    });
  });

  await page.route("**/api/v1/progress/", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        lessons: [],
        completed_count: 0,
        in_progress_count: 0,
        skills: [],
        signed_in: signedIn,
        xp: { total: 0, level: "AI Starter", next_level: "AI Beginner", to_next: 100 },
      }),
    });
  });

  /*
    AI技図鑑。既定は「1つも覚えていない」。

    ここを塞いでいないと、開発機に立っているバックエンドの中身で
    検査の結果が変わる。
  */
  await page.route("**/api/v1/rewards/skills/", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        options.skillDex ?? {
          skills: [],
          acquired_count: 0,
          total_count: 0,
          combos: [],
          xp: { total: 0, level: "AI Starter", next_level: "AI Beginner", to_next: 100 },
        },
      ),
    });
  });

  /*
    学習マップ。既定は「Lv.1 に居て、Lv.2 の技が2つとも未取得」。

    ここも塞いでおかないと、開発機に立っているバックエンドの中身で
    検査の結果が変わる（技図鑑と同じ理由）。
  */
  await page.route("**/api/v1/rewards/map/", async (route: Route) => {
    const second = {
      number: 2,
      name: "頼む",
      description: "目的を伝えて、基本的な仕事をAIに頼める",
      status: "locked",
      skipped: false,
      remaining: 2,
      has_challenge: true,
      challenge_open: false,
      skills: [
        {
          slug: "prompt",
          name: "プロンプト",
          one_line: "してほしいことをAIに伝える",
          status: "locked",
          lessons: ["rewrite_text"],
        },
        {
          slug: "context",
          name: "コンテキスト",
          one_line: "背景と目的を先に渡す",
          status: "locked",
          lessons: ["summarize_text"],
        },
      ],
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        options.levelMap ?? {
          current_level: 1,
          reached_by: "diagnosis",
          levels: [
            {
              number: 1,
              name: "試す",
              description: "AIに質問したり、簡単な文章生成を試せる",
              status: "current",
              skipped: false,
              skills: [],
              remaining: 0,
              has_challenge: false,
              challenge_open: false,
            },
            second,
          ],
          next: second,
        },
      ),
    });
  });

  /*
    教材。既定では**配らない**。

    画面は届かなければ同梱の9本で動くので、教材の中身を固定したい
    テスト以外は、そのほうが揺れが少ない。
  */
  await page.route("**/api/v1/catalog/", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        options.catalog !== undefined ? options.catalog : { courses: [] },
      ),
    });
  });

  await page.route("**/api/v1/ai/models/", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [
          { id: "mock-1", label: "標準", note: "テスト用", provider: "mock", recommended: true },
        ],
        default: "mock-1",
      }),
    });
  });

  // ほかの通信も実サーバーへ行かないよう塞ぐ。
  //
  // ここでまとめて塞ぐ形（api の下すべて）を使ってはいけない。
  // 開発サーバーはアプリ自身のソースを /src/api/ai.ts として配るので、
  // それごと JSON に差し替えてしまい、アプリが起動しなくなる。
  // そのうえ画面が真っ白なまま検査が通り、壊れていることに気づけない。
  for (const pattern of [
    "**/api/lessons/**",
    "**/api/profile/**",
    "**/api/tutor/**",
  ]) {
    await page.route(pattern, async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: null }),
      });
    });
  }

  /*
    学習の記録。

    **上のまとめ塞ぎ（api/lessons/**）より後に置くこと。** 先に置くと
    飲まれて `{"session": null}` が返り、学習記録の画面が
    「作ったもの」を数えられなくなる。
  */
  await page.route("**/api/lessons/history/", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        artifacts: [],
        sessions: [],
        ai_quota: { limit: null, used: 0, remaining: null },
      }),
    });
  });

  /*
    取っておいた成果物。

    既定はゲスト（`requires_account`）。取っておけるのは登録した人
    だけなので、既定を「使える」にすると、その線が検査から消える。
    **上のまとめ塞ぎより後に置くこと。**
  */
  await page.route("**/api/lessons/saved/**", async (route: Route) => {
    const method = route.request().method();
    if (method === "POST") {
      if (!signedIn) {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            errors: { requires_account: ["取っておくには、登録が必要です"] },
          }),
        });
        return;
      }
      const body = route.request().postDataJSON() as {
        lesson_id: string;
        output: string;
      };
      const artifact = {
        id: "saved-1",
        lesson_id: body.lesson_id,
        title: `${body.lesson_id}で作ったもの`,
        output: body.output,
        conditions: {},
        skills: [],
        created_at: "2026-08-20T10:00:00+09:00",
      };
      handle.saved.push(artifact);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ artifact, already_saved: false }),
      });
      return;
    }
    if (method === "DELETE") {
      handle.saved.length = 0;
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        options.saved ??
          (signedIn ? { items: handle.saved } : { items: [], requires_account: true }),
      ),
    });
  });

  // 完了時アンケート。送り先の教材と、答えの中身を控える。
  //
  // **上のまとめ塞ぎより後に置くこと。** Playwright は後から足したほうを
  // 先に使うので、先に置くと api/lessons のまとめ塞ぎに飲まれる。
  // 飲まれても 200 が返るため、画面は「送れた」と表示し、
  // 中身だけが記録されない。落ちないぶん気づきにくい。
  await page.route("**/api/lessons/*/survey/", async (route: Route) => {
    if (route.request().method() === "POST") {
      const lessonId = new URL(route.request().url()).pathname.split("/").at(-3) ?? "";
      handle.surveys.push({
        lessonId,
        answers: route.request().postDataJSON().answers,
      });
    }
    await route.fulfill({ status: 204, body: "" });
  });

  return handle;
}
