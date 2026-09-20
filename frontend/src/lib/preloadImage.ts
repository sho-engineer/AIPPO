/**
 * 次に出す絵を、出す前に用意しておく。
 *
 * なぜ要るか
 * ----------
 * 章扉は**絵1枚が画面そのもの**という作りで、絵が届くまでのあいだは
 * 章の名前だけが大きく出ていた。届いた瞬間に絵へ入れ替わるので、
 * 実機では「文字の画面 → 絵の画面」と**別の画面が一瞬見えた**ように
 * 感じる。
 *
 * 絵は軽くした（可逆 WebP をやめて 37MB → 7.2MB）が、それでも回線に
 * よっては間に合わない。**間に合わないときに文字を出す**のではなく、
 * **出す前に用意しておく**のが本筋。
 *
 * `decode()` まで待つ
 * -------------------
 * `onload` は「届いた」までで、**画に起こす前**。大きな絵では
 * `onload` のあとに一瞬止まって、そこで画面が飛ぶことがある。
 * `decode()` は画に起こし終わるまで待つので、置いた瞬間から完成した
 * 状態で出せる。
 *
 * 一度きり
 * --------
 * 済んだ src は覚えておく。同じ絵を出し直すたびに待つと、2回目以降が
 * 遅くなる——ブラウザのキャッシュには載っているので、待つ理由が無い。
 */

/** 画に起こし終わった src。ここに在れば、待たずに出してよい。 */
const ready = new Set<string>();

/** いま用意している最中の src。同じ絵を二重に取りに行かない。 */
const inFlight = new Map<string, Promise<void>>();

/** その絵は、もう待たずに出せるか。 */
export function isImageReady(src: string | undefined): boolean {
  return Boolean(src && ready.has(src));
}

/**
 * 絵を取りに行って、画に起こし終わるまで待つ。
 *
 * **失敗しても投げない。** 用意は「速く出すための下ごしらえ」であって、
 * 絵が無くても画面は出さないといけない。取れなければ、そのまま
 * ふつうに `<img>` が取りに行く（そしていつもの受け皿が出る）。
 */
export function preloadImage(src: string | undefined): Promise<void> {
  if (!src) return Promise.resolve();
  if (ready.has(src)) return Promise.resolve();

  const running = inFlight.get(src);
  if (running) return running;

  const task = new Promise<void>((resolve) => {
    const image = new Image();
    const done = () => {
      ready.add(src);
      inFlight.delete(src);
      resolve();
    };
    image.onload = () => {
      /*
        `decode()` が無い環境（古い Safari）もある。その場合は
        `onload` の時点で済んだことにする——待てないだけで、
        取れてはいる。
      */
      if (typeof image.decode !== "function") {
        done();
        return;
      }
      image.decode().then(done, done);
    };
    image.onerror = () => {
      inFlight.delete(src);
      /*
        取れなかった src は覚えない。あとでもう一度出す機会が
        あれば、そのときまた試す（回線が戻っているかもしれない）。
      */
      resolve();
    };
    image.src = src;
  });

  inFlight.set(src, task);
  return task;
}
