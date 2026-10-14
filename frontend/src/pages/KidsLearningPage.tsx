import learningDocument from "../kids/learning.html?raw";

/** Draft preview: deterministic responses and progress stored on this device. */
export default function KidsLearningPage() {
  return (
    <iframe
      title="AIPPO Kids AIぼうけん・学習プレビュー"
      srcDoc={learningDocument}
      className="block h-[100dvh] w-full border-0"
      sandbox="allow-scripts allow-same-origin allow-downloads"
    />
  );
}
