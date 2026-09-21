/**
 * 段が上がった瞬間の一枚。
 *
 * 祝うのは1回、数は出さない
 * -------------------------
 * ここで言いたいのは「上がった」ではなく、**何ができるようになったか**。
 * 段の番号を大きく出して終わると、増えたのは数字だけになる。番号の
 * 下に、その段の説明（`reached.description`）をそのまま置く。
 *
 * 名前も説明も、画面に写しを持たない
 * ----------------------------------
 * どちらもサーバーが返したものをそのまま出す（`reached`）。画面側に
 * 表を持つと、段を足した日に片方だけ古くなる——この作りのあいだ中、
 * ずっと守ってきた線をここでも崩さない。
 *
 * 行き止まりにしない
 * ------------------
 * 祝って終わりにせず、次の段と「あと何個」を続けて出す（`next`）。
 * いちばん上まで来た人には次を出さない代わりに、そこまで来たことを
 * 言う——「次は Lv.6」を作らない。
 *
 * 動きと音は上乗せ
 * ----------------
 * 出るときに一度だけ小さく弾む。紙吹雪は撒かない——学習より遊びが
 * 前に出る。動きを止めている人には、弾まない姿がそのまま出る
 * （`index.css` が一括で止める）。音は既定が切で、入れた人にだけ
 * 1度鳴る。**どちらも、消えても読めるものは変わらない。**
 */

import { useEffect } from "react";

import type { ChallengeVerdict } from "../../../api/progression";
import { IconChevronRight, IconMedal } from "../../Icons";
import { playSound } from "../../../course/sound";

export interface LevelUpViewProps {
  verdict: ChallengeVerdict;
  /** 閉じて学習マップへ。 */
  onClose: () => void;
}

export function LevelUpView({ verdict, onClose }: LevelUpViewProps) {
  /*
    技を覚えた回と同じ音を使う。段が上がるのは技が積み上がった先の
    出来事なので、別の音を作ると「何が起きたか」が増える。
  */
  useEffect(() => playSound("skill"), []);

  const reached = verdict.reached;
  const next = verdict.next;

  return (
    <div className="text-center" data-testid="challenge-levelup">
      <span
        aria-hidden="true"
        /*
          既にある `pop-in`（0.55秒）を使う。祝いのために新しい動きを
          足さない——動きが1つ増えるたびに、止めたときの確かめも増える。
        */
        className="mx-auto flex h-16 w-16 animate-pop-in items-center justify-center
                   rounded-full bg-brand text-white"
      >
        <IconMedal className="h-8 w-8" />
      </span>

      {/*
        番号と名前を一続きで出す。**番号だけにしない**——「Lv.2」は
        順番を言うだけで、何ができる段なのかを言っていない。
      */}
      <p className="mt-4 text-lg font-bold" data-testid="levelup-name">
        Lv.{reached?.number ?? verdict.current_level}
        {reached ? ` ${reached.name}` : ""} になりました
      </p>

      {reached && (
        <p
          className="mt-2 text-sm leading-7 text-ink-muted"
          data-testid="levelup-can"
        >
          {reached.description}
        </p>
      )}

      {/*
        次の段。**祝って終わりにしない。**

        「あと何個」はサーバーが数えた分をそのまま出す（地図と同じ
        `remaining`）。ここで数え直すと、祝いの画面と地図で違う数が
        出る日が来る。
      */}
      {next ? (
        <p
          className="mt-5 rounded-card border border-brand-line bg-brand-soft/40
                     px-4 py-3 text-sm leading-6"
          data-testid="levelup-next"
        >
          次は <strong>Lv.{next.number} {next.name}</strong>。
          {next.remaining > 0
            ? `必要な技があと${next.remaining}つです。`
            : "必要な技はそろいました。"}
        </p>
      ) : (
        /*
          いちばん上まで来た人。**「次は Lv.6」を作らない。**
          代わりに、そこまで来たことを言う。
        */
        <p
          className="mt-5 rounded-card border border-brand-line bg-brand-soft/40
                     px-4 py-3 text-sm leading-6"
          data-testid="levelup-top"
        >
          いちばん上の段です。ここまでの技は、そのまま仕事で使えます。
        </p>
      )}

      <button
        type="button"
        data-testid="challenge-done"
        onClick={onClose}
        className="mt-6 flex min-h-[3rem] w-full items-center justify-center gap-1
                   rounded-cta bg-brand px-6 py-2 text-sm font-bold text-white
                   shadow-cta transition hover:brightness-110 active:scale-[0.98]"
      >
        学習マップへ
        <IconChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
    </div>
  );
}
