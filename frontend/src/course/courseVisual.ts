/**
 * コースごとの小さな絵。
 *
 * 一覧に7つ並ぶので、題を読む前に「どれがどれか」の当たりが付く
 * 手がかりが要る。前は全部が同じ絵だったので、目で拾えるのは
 * 題の文字だけだった。
 *
 * 絵文字は使わない
 * ----------------
 * 端末ごとに形も色も違い、並べたときに大きさが揃わない。
 * この画面はカードを縦に積んで**見比べる**場所なので、
 * 1つだけ背が高い絵があると、それだけで重く見える。
 * 線画のアイコン（Icons.tsx）から選ぶ。
 *
 * 知らないコースが来たら
 * ----------------------
 * サーバー側で足したコースは、ここに無い。既定の絵を返す。
 * 絵が無いから出せない、という作りにはしない。
 */

import {
  IconBulb,
  IconList,
  IconRefresh,
  IconShield,
  IconSparkle,
  IconWand,
  IconWrite,
  type Icon,
} from "../components/Icons";

const BY_COURSE: Record<string, Icon> = {
  first_step_7days: IconSparkle,
  work_writing: IconWrite,
  summarize_organize: IconList,
  make_images: IconWand,
  expand_ideas: IconBulb,
  better_answers: IconRefresh,
  safe_at_work: IconShield,
};

export function courseIcon(courseId: string): Icon {
  return BY_COURSE[courseId] ?? IconSparkle;
}
