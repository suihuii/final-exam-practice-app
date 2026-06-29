import { QUESTION_TYPES } from "../types";
import type {
  AnswerValue,
  CourseId,
  ExamGrade,
  ExamOrder,
  ExamSession,
  Question,
  QuestionType,
} from "../types";

const optionAnswerPattern = /[A-H]/gi;

export function shuffle<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function filterQuestions(
  questions: Question[],
  selectedTypes: QuestionType[],
): Question[] {
  if (selectedTypes.length === 0) {
    return questions;
  }
  return questions.filter((question) => selectedTypes.includes(question.type));
}

export function pickQuestionIds(
  questions: Question[],
  count: number,
  order: ExamOrder,
): string[] {
  const source = order === "random" ? shuffle(questions) : [...questions];
  return source.slice(0, Math.max(0, count)).map((question) => question.id);
}

export function allocateQuestionCountsByType(
  questions: Question[],
  count: number,
): Record<QuestionType, number> {
  const safeCount = Math.min(Math.max(0, count), questions.length);
  const groups = groupQuestionsByType(questions);
  const allocation = emptyTypeCounts();
  if (safeCount === 0 || questions.length === 0) {
    return allocation;
  }

  const ratios = QUESTION_TYPES
    .map((type, orderIndex) => {
      const available = groups[type].length;
      const exact = (safeCount * available) / questions.length;
      const base = Math.min(Math.floor(exact), available);
      allocation[type] = base;
      return {
        type,
        orderIndex,
        available,
        fraction: exact - base,
      };
    })
    .filter((item) => item.available > 0);

  let remaining = safeCount - QUESTION_TYPES.reduce((total, type) => total + allocation[type], 0);
  while (remaining > 0) {
    const candidate = ratios
      .filter((item) => allocation[item.type] < item.available)
      .sort((left, right) => right.fraction - left.fraction || left.orderIndex - right.orderIndex)[0];
    if (!candidate) {
      break;
    }
    allocation[candidate.type] += 1;
    remaining -= 1;
  }

  return allocation;
}

export function pickQuestionIdsByType(
  questions: Question[],
  count: number,
  order: ExamOrder,
): string[] {
  const allocation = allocateQuestionCountsByType(questions, count);
  const groups = groupQuestionsByType(questions);

  return QUESTION_TYPES.flatMap((type) => {
    const source = order === "random" ? shuffle(groups[type]) : [...groups[type]];
    return source.slice(0, allocation[type]).map((question) => question.id);
  });
}

export function countQuestionsByType(questions: Question[]): Record<QuestionType, number> {
  const counts = emptyTypeCounts();
  for (const question of questions) {
    counts[question.type] += 1;
  }
  return counts;
}

export function emptyAnswerFor(question: Question): AnswerValue {
  if (question.type === "multiple") {
    return [];
  }
  if (question.type === "blank") {
    const count = Array.isArray(question.answer) ? question.answer.length : 1;
    return Array.from({ length: Math.max(count, 1) }, () => "");
  }
  return "";
}

export function hasAnswer(value: AnswerValue | undefined): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => item.trim().length > 0);
  }
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeAnswerForDisplay(answer: AnswerValue): string {
  return Array.isArray(answer) ? answer.join("、") : answer;
}

export function isAnswerCorrect(question: Question, userAnswer: AnswerValue): boolean {
  if (!hasAnswer(userAnswer)) {
    return false;
  }

  if (question.type === "multiple") {
    const expected = normalizeOptionArray(question.answer);
    const actual = normalizeOptionArray(userAnswer);
    return expected.length === actual.length && expected.every((item, index) => item === actual[index]);
  }

  if (question.type === "blank") {
    const expected = normalizeBlankArray(question.answer);
    const actual = normalizeBlankArray(userAnswer);
    return expected.length === actual.length && expected.every((item, index) => item === actual[index]);
  }

  if (question.type === "judge") {
    return normalizeJudge(question.answer) === normalizeJudge(userAnswer);
  }

  return normalizeSingle(question.answer) === normalizeSingle(userAnswer);
}

export function createExamSession(
  questionIds: string[],
  durationSeconds: number,
  selectedTypes: QuestionType[],
  order: ExamOrder,
  courseId?: CourseId,
): ExamSession {
  const now = new Date().toISOString();
  return {
    id: `exam_${Date.now()}`,
    courseId,
    questionIds,
    currentIndex: 0,
    answers: {},
    startedAt: now,
    pausedAt: null,
    elapsedSeconds: 0,
    durationSeconds,
    submittedAt: null,
    score: null,
    settings: {
      count: questionIds.length,
      selectedTypes,
      order,
      durationSeconds,
    },
  };
}

export function getElapsedSeconds(session: ExamSession, now = new Date()): number {
  if (session.pausedAt || session.submittedAt) {
    return Math.max(0, Math.floor(session.elapsedSeconds));
  }

  const started = new Date(session.startedAt).getTime();
  const liveSeconds = Math.max(0, Math.floor((now.getTime() - started) / 1000));
  return Math.max(0, Math.floor(session.elapsedSeconds + liveSeconds));
}

export function getRemainingSeconds(session: ExamSession, now = new Date()): number {
  return Math.max(0, session.durationSeconds - getElapsedSeconds(session, now));
}

export function pauseSession(session: ExamSession): ExamSession {
  return {
    ...session,
    elapsedSeconds: getElapsedSeconds(session),
    pausedAt: new Date().toISOString(),
  };
}

export function resumeSession(session: ExamSession): ExamSession {
  return {
    ...session,
    startedAt: new Date().toISOString(),
    pausedAt: null,
  };
}

export function gradeExam(
  session: ExamSession,
  questionsById: Map<string, Question>,
): ExamGrade {
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  const wrongIds: string[] = [];
  const unansweredIds: string[] = [];

  for (const questionId of session.questionIds) {
    const question = questionsById.get(questionId);
    const answer = session.answers[questionId];
    if (!question || !hasAnswer(answer)) {
      unanswered += 1;
      unansweredIds.push(questionId);
      continue;
    }

    if (isAnswerCorrect(question, answer)) {
      correct += 1;
    } else {
      wrong += 1;
      wrongIds.push(questionId);
    }
  }

  const total = session.questionIds.length || 1;
  return {
    score: Math.round((correct / total) * 100),
    correct,
    wrong,
    unanswered,
    wrongIds,
    unansweredIds,
  };
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}


function groupQuestionsByType(questions: Question[]): Record<QuestionType, Question[]> {
  return questions.reduce(
    (groups, question) => {
      groups[question.type].push(question);
      return groups;
    },
    { single: [], multiple: [], judge: [], blank: [] } as Record<QuestionType, Question[]>,
  );
}

function emptyTypeCounts(): Record<QuestionType, number> {
  return { single: 0, multiple: 0, judge: 0, blank: 0 };
}
function normalizeSingle(answer: AnswerValue): string {
  const text = normalizeAnswerForDisplay(answer).trim().toUpperCase();
  const match = text.match(optionAnswerPattern);
  return match?.[0]?.toUpperCase() ?? text;
}

function normalizeOptionArray(answer: AnswerValue): string[] {
  const text = normalizeAnswerForDisplay(answer).toUpperCase();
  const matches = text.match(optionAnswerPattern) ?? [];
  return Array.from(new Set(matches.map((item) => item.toUpperCase()))).sort();
}

function normalizeBlankArray(answer: AnswerValue): string[] {
  const values = Array.isArray(answer)
    ? answer
    : answer.split(/[;；|、,，\n]/g);
  return values.map(normalizeText).filter(Boolean);
}

function normalizeJudge(answer: AnswerValue): string {
  const text = normalizeAnswerForDisplay(answer).trim().toLowerCase();
  if (["正确", "对", "true", "t", "yes", "y", "√", "✓"].includes(text)) {
    return "正确";
  }
  if (["错误", "错", "false", "f", "no", "n", "×", "x"].includes(text)) {
    return "错误";
  }
  return text.includes("正确") || text.includes("对") ? "正确" : "错误";
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}
