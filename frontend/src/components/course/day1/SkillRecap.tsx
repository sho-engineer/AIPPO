/**
 * その日のAI技を、**まとめて1回だけ**受け取る。
 *
 * 3回から1回へ
 * ------------
 * 前は技を1つずつ、使った場所で受け取っていた（`SkillGet`）。
 * 名前が付くのは使った直後がよい——それは変えていない。変えたのは
 * **祝う回数**のほうで、3回あると、そのたびに学習が止まる。
 * ポーが中央へ出て、紙が散って、押して戻る。それが Day1 の中に
 * 3回入っていた。
 *
 * いまは、使った場所では名前を言うだけ（`concept_card`）。受け取るのは
 * 自分の文章を仕上げたあとの1回で、そこで3つそろって出る。
 * 「3 / 3」と数が出ることで、その日に持って帰るものが1画面で分かる。
 *
 * 説明は1行ずつ
 * -------------
 * 3つ並ぶので、1つが2行になると画面が読み物になる。ここは
 * **思い出すための見出し**で、中身はもう本編で使っている。
 */

import { IconCheck } from "../../Icons";

export interface SkillRecapItem {
  name: string;
  body: string;
}

export function SkillRecap({ items }: { items: SkillRecapItem[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="skill-recap">
      {/*
        数を先に出す。**3つあることが、押す前に分かる。**

        「3 / 3」は、この日に持って帰るものの数そのもの。1つずつ
        受け取っていたころは、最後まで来ても何個取ったのかが
        画面のどこにも出ていなかった。
      */}
      <p className="shrink-0 text-center">
        <span
          className="text-3xl font-bold leading-none text-brand"
          data-testid="skill-recap-count"
        >
          {items.length} / {items.length}
        </span>
        <span className="mt-1 block text-xs font-bold leading-5 text-ink-muted">
          GET
        </span>
      </p>

      <ul className="mt-4 shrink-0 space-y-2" role="list">
        {items.map((one) => (
          <li
            key={one.name}
            data-testid="skill-recap-item"
            className="flex items-start gap-2.5 rounded-card border border-brand-line
                       bg-brand-soft/60 px-3.5 py-2.5"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center
                         rounded-full bg-brand text-white"
            >
              <IconCheck className="h-3 w-3" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold leading-6 text-brand-dark">
                {one.name}
              </span>
              {/* 1行に収める。2行を超えると、祝う画面が読む画面になる */}
              <span className="mt-0.5 block text-xs leading-5 text-ink-muted">
                {one.body}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
