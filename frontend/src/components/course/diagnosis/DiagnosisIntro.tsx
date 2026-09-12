/**
 * 診断の開始画面。
 *
 * 前は絵1枚だった
 * ---------------
 * ここには全体図（`diagnosis_overview.webp`）が置いてあった。1枚で
 * 伝わるなら読む前に見せたほうが早い、という置き方だったが、実物は
 * そう読まれなかった。
 *
 *   ・絵の中に「AI活用診断」が大きく焼き込まれていて、上の帯と
 *     **同じ言葉が1画面に2回**出ていた
 *   ・「診断でわかること」「こんなときに」「診断後にわかること」まで
 *     詰まった1枚で、**広告のバナー**に見えた
 *
 * 絵は画面の高さに合わせて畳めない。読み上げにも1つの alt しか届かない。
 * 出したいものが「3つのメタ」と「5段階」という**数えられるもの**な
 * ので、UI で組むほうが素直だった。
 *
 * 何を出すか
 * ----------
 *     全5問 ／ 約1分 ／ 正解・不正解なし    … 答える前の不安に答える
 *     試す → 頼む → 条件 → 使い分け → 組み立て … 何を見る診断なのか
 *
 * メタの3つは、どれも**やらない理由をつぶす**ためにある。長さが
 * 分からない・間違えたら嫌だ、が始めない理由の大半なので、そこだけ先に
 * 言う。「こんなときに」「診断後にわかること」は始める前には要らない
 * ——読んでも、押すかどうかの判断は変わらない。
 *
 * 5段階に、いまここを出さない
 * ---------------------------
 * これは**診断する範囲**の下見で、結果ではない。1つを光らせると、
 * 答える前に「あなたはここ」と言うことになる（`GrowthTrack` の
 * `preview`）。
 *
 * 見出しと説明はここに書かない
 * ----------------------------
 * 教材データが持っていて、`StepShell` が上に出す。ここはその下の
 * 中身だけ——同じ文を2か所に置くと、片方だけ古くなる。
 */

import { IconCheckCircle, IconClock, IconList } from "../../Icons";
import { GrowthTrack } from "./GrowthTrack";

/**
 * 答える前の不安に答える3つ。
 *
 * 「約1分」は測った値ではなく**約束**なので、5問のまま増やさない
 * かぎり守れる。増やすときはここも一緒に動かすこと。
 */
const META = [
  { icon: IconList, label: "全5問" },
  { icon: IconClock, label: "約1分" },
  { icon: IconCheckCircle, label: "正解・不正解なし" },
] as const;

export function DiagnosisIntro() {
  return (
    /*
      送らない。**この画面は1つも隠さずに収まること。**

      中身は3つのメタと道1本だけなので、いちばん低い持ち方
      （402×660）でも余る。伸び縮みする箱を作らず、自分の高さのまま
      置く——伸ばすと、空いた白の真ん中に細い線が1本という姿になる。
    */
    <div className="shrink-0" data-testid="diagnosis-intro">
      {/*
        3つを横1行に。**札にして折り返させる。**

        縦に3行積むと 72px を説明だけで使う。ここは読み飛ばしてよい
        ものなので、1行に収めて、読みたい人の目にだけ入ればよい。
        狭い端末では折り返す（`flex-wrap`）——縮めて字を小さくしない。
      */}
      <ul
        className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
        role="list"
        data-testid="diagnosis-meta"
      >
        {META.map((one) => (
          <li
            key={one.label}
            className="flex items-center gap-1.5 rounded-badge bg-brand-soft/70
                       px-2.5 py-1 text-xs font-bold leading-5 text-brand-dark"
          >
            <one.icon className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
            {one.label}
          </li>
        ))}
      </ul>

      {/*
        何を見る診断なのか。**結果で使う道をそのまま出す。**

        5つの名前をここに書き写さない。書き写すと、段の名前を変えた
        ときに片方だけ古くなり、始める前に見た言葉が結果に出てこない。
      */}
      <section className="mt-5 rounded-card border border-line bg-surface px-4 pb-4 pt-3.5">
        <h2 className="text-xs font-bold leading-5 text-ink-muted">
          この5段階のどこにいるかを見ます
        </h2>
        <div className="mt-3">
          <GrowthTrack stage={1} preview />
        </div>
      </section>
    </div>
  );
}
