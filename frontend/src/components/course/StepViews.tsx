/**
 * ステップの種類ごとの見た目——の、まとめ口。
 *
 * 中身は `steps/` の中で、**目的ごとに1ファイル**に分けてある。
 * 以前はここに全部（1400行）が入っていて、選択肢の余白を1つ直すのに
 * 完了画面や比較画面まで抱えて読むことになっていた。
 *
 * ここに残すのは出し口だけにする。読み込み先（StepRenderer など）は
 * 今までどおり "./StepViews" のまま——分け方を変えるたびに、使う側の
 * 書き換えが要るのでは、分けた意味が薄れる。
 *
 * どこに何があるか
 * ----------------
 * | ファイル          | 受け持ち                               |
 * |-------------------|----------------------------------------|
 * | Inputs            | 選ぶ・書く・答え合わせ（利用者が答える） |
 * | PromptPreview     | 送る前に、頼む内容を見返す              |
 * | Generating        | 送っているあいだのようす                |
 * | Results           | 返ってきたものと、これまでの実行        |
 * | Compare           | 元 → 1回目 → 条件を足したあと           |
 * | Observation       | どこが変わったかを、自分で確かめる      |
 * | ConceptCard       | 手を動かしたあとの、短い解説            |
 * | Outcome           | 完成イメージ（最初に出る画面）          |
 * | Tiles             | 大きめの札から1つ選ぶ                   |
 * | Completion        | 終わったあとの1枚                       |
 *
 * ステップ全体に効く決まりは、それぞれのファイルの頭に書いてある
 * （空欄から始めさせない、色だけで状態を表さない、など）。
 */

export { ChoiceStep, TextStep, QuizStep } from "./steps/Inputs";
export { PromptPreview } from "./steps/PromptPreview";
export { GeneratingCard } from "./steps/Generating";
export { ResultCompare, RunHistory } from "./steps/Results";
export { ThreeWayCompare, ChangePoints } from "./steps/Compare";
export { ObservationList, ObservationReason } from "./steps/Observation";
export { ConceptCardView } from "./steps/ConceptCard";
export { OutcomePreview } from "./steps/Outcome";
export { ChoiceTiles, StartChoiceTiles } from "./steps/Tiles";
export { CompletionView, CopyButton } from "./steps/Completion";
