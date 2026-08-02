export type TutorEmotion =
  | "neutral"
  | "question"
  | "thinking"
  | "hint"
  | "warning"
  | "celebrate";

export type TutorAction = "wait" | "retry" | "next" | "show_hint" | "complete";

export interface TutorMessage {
  message: string;
  emotion: TutorEmotion;
  action: TutorAction;
}

/** API が返すチューターのフィードバック（contracts/tutor-feedback.md）。 */
export interface TutorFeedback extends TutorMessage {
  hint_level: number;
  completed: boolean;
}
