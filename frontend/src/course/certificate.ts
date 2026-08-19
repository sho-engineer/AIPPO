/**
 * 修了証。
 *
 * 進み具合（progress.ts）と違って、こちらは端末に貯めた記録を混ぜない。
 * localStorage は本人が書き換えられるので、足し合わせると
 * 「終えていないのに修了証がある」状態を自分で作れてしまう。
 * 誰が終えたかの判定は、サーバー1か所に閉じる。
 *
 * 取れなかったときは空で返す。修了証が見えないだけで、
 * 教材一覧が開かなくなるほうが困る。
 */

import { useEffect, useState } from "react";

import { getJson } from "../api/http";

export interface Certificate {
  course_slug: string;
  course_title: string;
  /** 最後の1本を終えた日（YYYY-MM-DD）。 */
  completed_on: string;
  lesson_count: number;
  skills: string[];
  /** 通し番号。連番ではない（サーバーで作る）。 */
  serial: string;
}

export interface CertificateResponse {
  certificates: Certificate[];
}

export function fetchCertificates(signal?: AbortSignal): Promise<CertificateResponse> {
  return getJson<CertificateResponse>("/api/lessons/certificate/", signal);
}

/**
 * 受け取った修了証。
 *
 * 届くまでは空。呼ぶ側は空のときに何も描かないので、
 * 一瞬だけ空の枠が出てから消える、という見え方にはならない。
 */
export function useCertificates(): Certificate[] {
  const [certificates, setCertificates] = useState<Certificate[]>([]);

  useEffect(() => {
    let alive = true;

    void fetchCertificates()
      .then((response) => {
        /*
          形を確かめてから入れる。`response.certificates` をそのまま
          入れると、鍵の無い応答（`{}`）で undefined が入り、
          読む側の `.length` で**教材一覧ごと真っ白になる**。

          応答が壊れるのは、落ちているときだけではない。経路の設定
          違い、間に挟まる proxy のエラーページ、配置の途中——
          どれも 200 で別物が返る。教材の取り込み（course/live.ts）が
          同じ理由で形を確かめているので、ここも揃える。

          修了証はあれば嬉しいもので、これが無いと教材一覧が
          開けない、という作りにはしない。
        */
        if (alive && Array.isArray(response?.certificates)) {
          setCertificates(response.certificates);
        }
      })
      .catch(() => {
        // 届かなかった。修了証は出さずに、画面はそのまま使える
      });

    return () => {
      alive = false;
    };
  }, []);

  return certificates;
}

/**
 * 「2026年8月19日」。
 *
 * `new Date("2026-08-19")` は UTC の 0時として読まれるので、
 * 日本時間へ直すと前日になる端末がある。文字列のまま切り出す。
 */
export function formatCompletedOn(completedOn: string): string {
  const [year, month, day] = completedOn.split("-");
  if (!year || !month || !day) return completedOn;
  return `${year}年${Number(month)}月${Number(day)}日`;
}
