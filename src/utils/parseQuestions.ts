import type { Question, QuestionType } from "../types";
import { QUESTION_TYPES } from "../types";

export function buildQuestionMap(questions: Question[]): Map<string, Question> {
  return new Map(questions.map((question) => [question.id, question]));
}

export function countQuestionTypes(
  questions: Question[],
): Record<QuestionType, number> {
  const counts: Record<QuestionType, number> = {
    single: 0,
    multiple: 0,
    judge: 0,
    blank: 0,
  };

  for (const question of questions) {
    counts[question.type] += 1;
  }
  return counts;
}

export function normalizeQuestions(value: unknown): Question[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isQuestion)
    .sort((left, right) => left.index - right.index);
}

export function questionsByType(
  questions: Question[],
  type: QuestionType | "all",
): Question[] {
  if (type === "all") {
    return questions;
  }
  return questions.filter((question) => question.type === type);
}

function isQuestion(value: unknown): value is Question {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Question;
  return (
    typeof candidate.id === "string" &&
    Number.isFinite(candidate.index) &&
    QUESTION_TYPES.includes(candidate.type) &&
    typeof candidate.stem === "string" &&
    Array.isArray(candidate.options) &&
    typeof candidate.analysis === "string"
  );
}
