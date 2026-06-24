export type QuestionType = "single" | "multiple" | "judge" | "blank";

export type PracticeMode = "normal" | "wrong" | "favorite";

export type ExamOrder = "random" | "sequence";

export type AnswerValue = string | string[];

export type ViewKey =
  | "home"
  | "practice"
  | "exam"
  | "wrong"
  | "stats"
  | "settings";

export interface QuestionOption {
  label: string;
  text: string;
}

export interface Question {
  id: string;
  index: number;
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  answer: AnswerValue;
  analysis: string;
}

export interface WrongRecord {
  count: number;
  lastWrongAt: string;
  note: string;
  mastered: boolean;
}

export interface PracticeState {
  lastQuestionId: string | null;
  mode: PracticeMode;
  filterTypes: QuestionType[];
}

export interface ExamSettings {
  count: number;
  selectedTypes: QuestionType[];
  order: ExamOrder;
  durationSeconds: number;
}

export interface ExamSession {
  id: string;
  questionIds: string[];
  currentIndex: number;
  answers: Record<string, AnswerValue>;
  startedAt: string;
  pausedAt: string | null;
  elapsedSeconds: number;
  durationSeconds: number;
  submittedAt: string | null;
  score: number | null;
  settings: ExamSettings;
}

export interface ProgressData {
  version: 1;
  wrong: Record<string, WrongRecord>;
  favorites: string[];
  practice: PracticeState;
  exams: {
    activeSessionId: string | null;
    sessions: Record<string, ExamSession>;
  };
}

export interface ExamGrade {
  score: number;
  correct: number;
  wrong: number;
  unanswered: number;
  wrongIds: string[];
  unansweredIds: string[];
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  blank: "填空",
};

export const QUESTION_TYPES: QuestionType[] = [
  "single",
  "multiple",
  "judge",
  "blank",
];
