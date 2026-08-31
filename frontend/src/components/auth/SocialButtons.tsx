/**
 * Google と LINE で続けるボタン。
 *
 * 押すと画面ごと向こうへ移動する。合言葉は画面を一度も通らない
 * （サーバーが受け取り、いつもの Cookie にする）。
 *
 * 設定が入っていない先は、ボタンそのものを出さない。
 * 押すと落ちるボタンは、無いより悪い。
 *
 * 同意の扱い
 * ----------
 * ここを押した時点で登録まで進むので、押す前に見えるところへ
 * 「続けると同意したことになります」と書く。あとから聞けない。
 */

import { useEffect, useRef, useState } from "react";

import { fetchSocialProviders, type SocialProvider } from "../../api/accounts";
import { currentPlace } from "../../app/session";
import { rememberReturn } from "../../auth/returnTo";
import { SOCIAL_COPY } from "../../content/ui";
import { apiBaseUrl } from "../../api/config";
import { EVENTS, track } from "../../lib/analytics";
import { IconGlobe } from "../Icons";

/*
  各社の色。ボタンの意味が一目で分かるようにする。

  LINE の緑（#06C755）はそのまま使うが、**文字は白ではなく濃紺**にする。
  白文字だと 2.26 で、本文に必要な 4.5 に遠く届かない（明るい場所や
  安い画面で読めなくなる）。濃紺なら 7.39 で、緑はブランドどおりのまま。
  ブランドの見た目より、読めることを優先する。
*/
const LOOK: Record<string, string> = {
  google: "border-line bg-surface text-ink hover:bg-canvas",
  line: "border-[#06C755] bg-[#06C755] text-ink hover:brightness-105",
};

export interface SocialButtonsProps {
  disabled?: boolean;
  /**
   * 区切り線と同意の一文を、自分では出さない。
   *
   * 登録の入口では、この3つ（Google・パスキー・メール）が並ぶ。
   * 同意の一文はどの道でも同じものなので、置き場所は1つにする。
   * ここでも出すと、同じ文が2回見えることになる。
   */
  bare?: boolean;
  /**
   * 何件出したかを、置いた側へ返す。
   *
   * 上に何も出ないときに「または」の線だけが残るのを避けるため。
   * 設定が入っていない環境では、ここは 0 件になる。
   */
  onCount?: (count: number) => void;
}

export function SocialButtons({ disabled, bare = false, onCount }: SocialButtonsProps) {
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  /*
    押したあと、向こうへ移り始めるまでの数百ミリ秒。

    `window.location.href` を入れてから実際に画面が変わるまでには間が
    あり、そのあいだ**ボタンは押せたまま**だった。二度押すと外部への
    往復が2本走る。押した直後に閉じて、何が起きているかを文で返す。
  */
  const [leaving, setLeaving] = useState<string | null>(null);
  /* 呼び出し側が毎回作り直す関数でも、取り直しにいかないようにする */
  const report = useRef(onCount);
  report.current = onCount;

  useEffect(() => {
    let alive = true;
    void fetchSocialProviders()
      .then((body) => {
        /*
          形が違うものが返ることがある（前段のプロキシ、設定違いの
          エンドポイント）。そのまま入れると `.length` で落ち、
          登録の画面ごと真っ白になる。連携は「あると嬉しい」ものなので、
          読めなければ黙って出さない。
        */
        if (!alive) return;
        const found = Array.isArray(body?.providers) ? body.providers : [];
        setProviders(found);
        report.current?.(found.length);
      })
      .catch(() => {
        // 取れなければ出さない。メールでの登録は使えるので、行き止まりにならない
        if (alive) report.current?.(0);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (providers.length === 0) return null;

  return (
    <div data-testid="social-buttons">
      {!bare && (
        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs text-ink-muted">{SOCIAL_COPY.divider}</span>
          <span className="h-px flex-1 bg-line" />
        </div>
      )}

      <div className="space-y-2">
        {providers.map((provider) => (
          <button
            key={provider.name}
            type="button"
            disabled={disabled || leaving !== null}
            data-testid={`social-${provider.name}`}
            onClick={() => {
              if (leaving) return;
              setLeaving(provider.name);
              // 押した回を数える。ここから先は外部なので、戻って
              // こなかった人はこの1件だけが記録に残る
              track(EVENTS.authGoogleClicked);
              /*
                いる場所を控えてから出る。

                戻ってくるのはアプリの入口（`/`）で、サーバーは
                どこから出たかを知らない。控えておかないと、別のタブが
                「最後に見ていた画面」を書き換えていたときに、
                押した本人が違う画面へ着く（auth/returnTo.ts）。
              */
              rememberReturn(currentPlace());
              // 画面ごと移動する。戻ってきたときは Cookie で入っている
              window.location.href = `${apiBaseUrl()}${provider.start_url}`;
            }}
            className={`flex min-h-[3rem] w-full items-center justify-center gap-2
                        rounded-cta border px-6 py-3 text-sm font-bold transition
                        disabled:cursor-not-allowed disabled:opacity-60
                        ${LOOK[provider.name] ?? LOOK.google}`}
          >
            <IconGlobe className="h-4 w-4 shrink-0" aria-hidden="true" />
            {leaving === provider.name
              ? SOCIAL_COPY.leavingTo(provider.label)
              : SOCIAL_COPY.continueWith(provider.label)}
          </button>
        ))}
      </div>

      {!bare && (
        <p className="mt-3 text-center text-xs leading-6 text-ink-muted">
          {SOCIAL_COPY.consentNote}
        </p>
      )}
    </div>
  );
}
