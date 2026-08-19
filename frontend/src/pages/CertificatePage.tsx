/**
 * 修了証。
 *
 * コースのレッスンをすべて終えた人にだけ、サーバーが返す
 * （backend/apps/lessons/views_certificate.py）。ここは受け取ったものを
 * そのまま置くだけで、終えたかどうかの判定は一切しない。
 * 画面で判定すると、端末の記録を書き換えるだけで紙が作れてしまう。
 *
 * 見せ方は**書類**にする。祝いの演出は置かない。
 * 紙吹雪や「おめでとうございます！」は、その場では楽しくても、
 * 二度目に開いたときには余計なものになる。終えたという事実——
 * 何を、いつ、どこまで——が読めれば足りる。
 *
 * やらないもの（すべて意図的）
 * ----------------------------
 * - 画像として保存 … 見るための画面。書き出しは要件に無い
 * - 共有ボタン … 他人と比べさせない
 * - 大きな勲章の絵 … 中身より飾りが大きくなる
 */

import { AppHeader } from "../components/AppShell";
import { formatCompletedOn, type Certificate } from "../course/certificate";

export interface CertificatePageProps {
  certificates: Certificate[];
  onBack: () => void;
}

/**
 * 1枚ぶん。
 *
 * 面で囲うのはここだけ。修了証は「1つの独立したまとまり」で、
 * 紙が並んでいるように見えることに意味がある。
 */
function CertificateSheet({ certificate }: { certificate: Certificate }) {
  return (
    <article
      data-testid={`certificate-${certificate.course_slug}`}
      className="rounded-panel border border-brand-line bg-surface p-5"
      aria-labelledby={`certificate-title-${certificate.course_slug}`}
    >
      <p className="text-xs font-bold text-brand-dark">修了証</p>

      <h2
        id={`certificate-title-${certificate.course_slug}`}
        className="mt-1.5 text-lg font-bold leading-7"
      >
        {certificate.course_title}
      </h2>
      <p className="mt-1 text-sm leading-7 text-ink-muted">
        全{certificate.lesson_count}回のレッスンを終えました。
      </p>

      {/*
        修了日と番号は、桁をそろえて並べる。
        「いつ」と「どれ」が分かれば書類として成り立つ。
      */}
      <dl className="mt-4 border-t border-line pt-3 text-xs">
        <div className="flex gap-4 py-1">
          <dt className="w-16 shrink-0 text-ink-muted">修了日</dt>
          <dd className="tabular-nums">{formatCompletedOn(certificate.completed_on)}</dd>
        </div>
        <div className="flex gap-4 py-1">
          <dt className="w-16 shrink-0 text-ink-muted">番号</dt>
          <dd className="tabular-nums">{certificate.serial}</dd>
        </div>
      </dl>

      {/*
        身についたこと。無いときは見出しごと出さない。
        「身についたこと」の下が空の修了証は、無いほうがましになる。
      */}
      {certificate.skills.length > 0 && (
        <div className="mt-4">
          <h3 className="section-title">身についたこと</h3>
          <ul className="mt-1 space-y-0.5 text-sm leading-7 text-ink-muted" role="list">
            {certificate.skills.map((skill) => (
              <li key={skill}>・{skill}</li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function CertificatePage({ certificates, onBack }: CertificatePageProps) {
  return (
    <>
      <AppHeader onBack={onBack} centered />

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-2" data-testid="certificate-page">
        <h1 className="text-xl font-bold">修了証</h1>
        <p className="mt-1.5 text-sm leading-7 text-ink-muted">
          コースのレッスンをすべて終えると、ここに残ります。
        </p>

        <div className="mt-5 space-y-4">
          {certificates.map((certificate) => (
            <CertificateSheet key={certificate.course_slug} certificate={certificate} />
          ))}
        </div>

        {/*
          何の証明なのかを、こちらから先に書く。
          資格のように受け取られたまま人に見せて、あとで
          「それは何ですか」と言われるほうが困る。
        */}
        <p className="mt-6 text-xs leading-6 text-ink-muted">
          AIPPOの中の記録です。公的な資格ではありません。
        </p>
      </main>
    </>
  );
}
