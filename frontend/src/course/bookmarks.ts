/**
 * 目印の付け外しを、画面から使う形にまとめる。
 *
 * 押した瞬間に見た目を変える（楽観更新）。往復を待つと、押したのに
 * 何も起きない時間ができて、二度押しを誘う。二度押し自体はサーバーが
 * 吸収するが、押した本人には「効いていない」としか見えない。
 *
 * 失敗したら**元に戻す**。付いたように見えたまま付いていないのが
 * 一番よくない。あとで一覧を開いたときに消えていて、
 * 何が起きたのか分からなくなる。
 */

import { useCallback, useEffect, useState } from "react";

import { addBookmark, fetchBookmarks, removeBookmark } from "../api/bookmarks";

export interface BookmarkState {
  /** 目印の付いた教材の id。 */
  ids: string[];
  /** 付いているか。 */
  has: (lessonId: string) => boolean;
  /** 付け外しを切り替える。 */
  toggle: (lessonId: string) => void;
  /** 読み込み中。最初の1回だけ true になる。 */
  loading: boolean;
}

export function useBookmarks(): BookmarkState {
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const abort = new AbortController();

    fetchBookmarks(abort.signal)
      .then((data) => setIds(data.items.map((item) => item.lesson_id)))
      // 取れなくても画面は出す。目印はあれば便利なもので、
      // これが無いと教材を開けない、という作りにはしない
      .catch(() => {})
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });

    return () => abort.abort();
  }, []);

  const toggle = useCallback((lessonId: string) => {
    setIds((current) => {
      const on = current.includes(lessonId);
      const next = on
        ? current.filter((id) => id !== lessonId)
        : [...current, lessonId];

      const send = on ? removeBookmark : addBookmark;
      send(lessonId).catch(() => {
        // 戻す。付いたように見えたまま付いていないのを作らない
        setIds((latest) =>
          on
            ? latest.includes(lessonId)
              ? latest
              : [...latest, lessonId]
            : latest.filter((id) => id !== lessonId),
        );
      });

      return next;
    });
  }, []);

  const has = useCallback((lessonId: string) => ids.includes(lessonId), [ids]);

  return { ids, has, toggle, loading };
}
