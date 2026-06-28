export type CourseId = "power-supply" | "aesthetic-education" | string;

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

export interface Course {
  id: CourseId;
  name: string;
  shortName: string;
  description: string;
  questionFile: string;
}

export interface QuestionOption {
  label: string;
  text: string;
}

export interface Question {
  id: string;
  courseId: CourseId;
  paperId?: string;
  paperIndex?: number;
  index: number;
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  answer: AnswerValue;
  analysis: string;
  image?: string;
  imageAlt?: string;
}

export interface WrongRecord {
  count: number;
  lastWrongAt: string;
  note: string;
  mastered: boolean;
}

export interface PracticeAnswerRecord {
  questionId: string;
  selectedAnswer: AnswerValue;
  isCorrect: boolean | null;
  answeredAt: string;
  answerVisible?: boolean;
}

export interface PracticeState {
  lastQuestionId: string | null;
  currentIndex: number;
  mode: PracticeMode;
  filterTypes: QuestionType[];
  answers: Record<string, PracticeAnswerRecord>;
  updatedAt: string | null;
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

export interface CourseProgress {
  wrong: Record<string, WrongRecord>;
  favorites: string[];
  practice: PracticeState;
  exams: {
    activeSessionId: string | null;
    sessions: Record<string, ExamSession>;
  };
}

export interface ProgressData {
  version: 2;
  activeCourseId: CourseId;
  courses: Record<string, CourseProgress>;
}

export interface LegacyProgressData {
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
  blank: "填空/简答",
};

export const QUESTION_TYPES: QuestionType[] = [
  "single",
  "multiple",
  "judge",
  "blank",
];
