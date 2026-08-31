/**
 * 送信中のようす。
 *
 * 待っているあいだ、何が起きているのかを出しておく。
 * 無言で止まると、壊れたのか待てばよいのかが分からない。
 */


// ------------------------------------------------------- 送信中のようす

/**
 * 送っているあいだの画面。
 *
 * 「考えています」だけにしない。何をしているかを短く出し、
 * 進んでいることが見える棒を添える。
 * 実際の進み具合は分からないので、**時間で伸ばす**演出にはしない。
 * 待ち時間をわざと足すのと変わらなくなる。
 */
export function GeneratingCard({
  message,
  busy,
  failed = false,
}: {
  message: string;
  busy: boolean;
  /** 失敗して止まっているか。理由の文はここには出さない（下のボタンのそば） */
  failed?: boolean;
}) {
  return (
    <div
      data-testid="generating-card"
      className="rounded-card border border-brand-line bg-surface p-6 text-center"
    >
      <p className="text-sm font-bold leading-7" role="status">
        {message}
      </p>
      {/*
        待っていることを、動きでも伝える。

        **進み具合は出さない。** 前は幅40%の帯を流していたが、
        「40%終わった」と読める。AIがどこまで進んだかはこちらには
        分からないので、分かるふりをしない（偽の進捗は禁止）。

        いまは幅いっぱいの帯の中を、細い光が左から右へ通り抜ける形。
        動いていることだけを言い、どこまで来たかは言わない。

        止まっているときは動かさない。動いたままだと、まだ続いているのか
        終わったのかが読めない。
      */}
      <div
        className="mx-auto mt-5 h-2 w-48 overflow-hidden rounded-full bg-brand-soft"
        data-testid="generating-bar"
        data-busy={busy ? "true" : "false"}
      >
        {busy ? (
          <div className="h-full w-1/3 rounded-full bg-brand animate-drift-x" />
        ) : (
          <div
            className={`h-full w-full rounded-full ${failed ? "bg-line" : "bg-brand"}`}
          />
        )}
      </div>

      {/*
        返ってくるものの形を、先に置いておく。

        真ん中でぐるぐる回すだけだと、あとどれくらいなのかも、
        何が返ってくるのかも分からない。文章が入る枠を薄く出しておくと、
        待っている間に「文章が返ってくる」ことが分かり、
        届いたときの入れ替わりも急に見えない。

        飾りなので読み上げには出さない（上の文が状態を伝えている）。
      */}
      {busy && (
        <div
          aria-hidden="true"
          data-testid="result-skeleton"
          className="mt-6 space-y-2.5"
        >
          {[100, 92, 74].map((width) => (
            <div
              key={width}
              className="h-3 animate-pulse rounded-full bg-brand-soft"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
