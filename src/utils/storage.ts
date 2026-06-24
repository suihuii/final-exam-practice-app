import type {
  AnswerValue,
  ExamSession,
  PracticeMode,
  ProgressData,
  QuestionType,
  WrongRecord,
} from "../types";

export const PROGRESS_KEY = "progress_v1";

export const defaultProgress: ProgressData = {
  version: 1,
  wrong: {},
  favorites: [],
  practice: {
    lastQuestionId: null,
    mode: "normal",
    filterTypes: [],
  },
  exams: {
    activeSessionId: null,
    sessions: {},
  },
};

export function loadProgress(): ProgressData {
  const raw = localStorage.getItem(PROGRESS_KEY);
  if (!raw) {
    return cloneProgress(defaultProgress);
  }

  try {
    return sanitizeProgress(JSON.parse(raw));
  } catch {
    return cloneProgress(defaultProgress);
  }
}

export function saveProgress(progress: ProgressData): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function clearProgress(): ProgressData {
  const next = cloneProgress(defaultProgress);
  saveProgress(next);
  return next;
}

export function exportProgress(progress: ProgressData): string {
  return JSON.stringify(progress, null, 2);
}

export function importProgress(text: string): ProgressData {
  const parsed = JSON.parse(text);
  const next = sanitizeProgress(parsed);
  saveProgress(next);
  return next;
}

export function isFavorite(progress: ProgressData, questionId: string): boolean {
  return progress.favorites.includes(questionId);
}

export function toggleFavorite(
  progress: ProgressData,
  questionId: string,
): ProgressData {
  const exists = progress.favorites.includes(questionId);
  const favorites = exists
    ? progress.favorites.filter((id) => id !== questionId)
    : [...progress.favorites, questionId];
  return persist({ ...progress, favorites });
}

export function addWrong(progress: ProgressData, questionId: string): ProgressData {
  const previous = progress.wrong[questionId];
  const record: WrongRecord = {
    count: (previous?.count ?? 0) + 1,
    lastWrongAt: new Date().toISOString(),
    note: previous?.note ?? "",
    mastered: false,
  };
  return persist({
    ...progress,
    wrong: {
      ...progress.wrong,
      [questionId]: record,
    },
  });
}

export function updateWrongNote(
  progress: ProgressData,
  questionId: string,
  note: string,
): ProgressData {
  const previous = progress.wrong[questionId];
  const record: WrongRecord = {
    count: previous?.count ?? 0,
    lastWrongAt: previous?.lastWrongAt ?? "",
    note,
    mastered: previous?.mastered ?? false,
  };
  return persist({
    ...progress,
    wrong: {
      ...progress.wrong,
      [questionId]: record,
    },
  });
}

export function markWrongMastered(
  progress: ProgressData,
  questionId: string,
  mastered: boolean,
): ProgressData {
  const previous = progress.wrong[questionId];
  if (!previous) {
    return progress;
  }
  return persist({
    ...progress,
    wrong: {
      ...progress.wrong,
      [questionId]: {
        ...previous,
        mastered,
      },
    },
  });
}

export function setPracticeState(
  progress: ProgressData,
  lastQuestionId: string | null,
  mode: PracticeMode,
  filterTypes: QuestionType[],
): ProgressData {
  return persist({
    ...progress,
    practice: {
      lastQuestionId,
      mode,
      filterTypes,
    },
  });
}

export function setExamSession(
  progress: ProgressData,
  session: ExamSession,
  active = true,
): ProgressData {
  return persist({
    ...progress,
    exams: {
      activeSessionId: active ? session.id : progress.exams.activeSessionId,
      sessions: {
        ...progress.exams.sessions,
        [session.id]: session,
      },
    },
  });
}

export function updateExamAnswer(
  progress: ProgressData,
  sessionId: string,
  questionId: string,
  answer: AnswerValue,
): ProgressData {
  const session = progress.exams.sessions[sessionId];
  if (!session || session.submittedAt) {
    return progress;
  }
  return setExamSession(progress, {
    ...session,
    answers: {
      ...session.answers,
      [questionId]: answer,
    },
  });
}

export function clearActiveExam(progress: ProgressData): ProgressData {
  return persist({
    ...progress,
    exams: {
      ...progress.exams,
      activeSessionId: null,
    },
  });
}

export function abandonActiveExam(progress: ProgressData): ProgressData {
  const activeId = progress.exams.activeSessionId;
  if (!activeId) {
    return progress;
  }
  const { [activeId]: omittedSession, ...sessions } = progress.exams.sessions;
  void omittedSession;
  return persist({
    ...progress,
    exams: {
      activeSessionId: null,
      sessions,
    },
  });
}

function persist(progress: ProgressData): ProgressData {
  saveProgress(progress);
  return progress;
}

function sanitizeProgress(value: unknown): ProgressData {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("进度文件版本不正确");
  }

  const wrong = sanitizeWrong(value.wrong);
  const favorites = Array.isArray(value.favorites)
    ? value.favorites.filter(isQuestionId)
    : [];
  const practiceSource = isRecord(value.practice) ? value.practice : {};
  const examsSource = isRecord(value.exams) ? value.exams : {};
  const sessions = sanitizeSessions(examsSource.sessions);
  const activeSessionId =
    typeof examsSource.activeSessionId === "string" &&
    sessions[examsSource.activeSessionId] &&
    !sessions[examsSource.activeSessionId].submittedAt
      ? examsSource.activeSessionId
      : null;

  return {
    version: 1,
    wrong,
    favorites,
    practice: {
      lastQuestionId:
        typeof practiceSource.lastQuestionId === "string"
          ? practiceSource.lastQuestionId
          : null,
      mode: isPracticeMode(practiceSource.mode)
        ? practiceSource.mode
        : "normal",
      filterTypes: Array.isArray(practiceSource.filterTypes)
        ? practiceSource.filterTypes.filter(isQuestionType)
        : [],
    },
    exams: {
      activeSessionId,
      sessions,
    },
  };
}

function sanitizeWrong(value: unknown): ProgressData["wrong"] {
  if (!isRecord(value)) {
    return {};
  }

  const entries = Object.entries(value).flatMap(([questionId, record]) => {
    if (!isQuestionId(questionId) || !isRecord(record)) {
      return [];
    }

    return [
      [
        questionId,
        {
          count: Number.isFinite(record.count) ? Math.max(0, Number(record.count)) : 0,
          lastWrongAt: typeof record.lastWrongAt === "string" ? record.lastWrongAt : "",
          note: typeof record.note === "string" ? record.note : "",
          mastered: record.mastered === true,
        },
      ],
    ];
  });

  return Object.fromEntries(entries);
}

function sanitizeSessions(value: unknown): Record<string, ExamSession> {
  if (!isRecord(value)) {
    return {};
  }

  const sessions: Record<string, ExamSession> = {};
  for (const [sessionId, session] of Object.entries(value)) {
    if (!isRecord(session) || typeof sessionId !== "string") {
      continue;
    }
    const questionIds = Array.isArray(session.questionIds)
      ? session.questionIds.filter(isQuestionId)
      : [];
    if (questionIds.length === 0) {
      continue;
    }
    sessions[sessionId] = {
      id: sessionId,
      questionIds,
      currentIndex: Number.isFinite(session.currentIndex)
        ? Math.min(Math.max(0, Number(session.currentIndex)), questionIds.length - 1)
        : 0,
      answers: sanitizeAnswers(session.answers),
      startedAt: typeof session.startedAt === "string" ? session.startedAt : new Date().toISOString(),
      pausedAt: typeof session.pausedAt === "string" ? session.pausedAt : null,
      elapsedSeconds: Number.isFinite(session.elapsedSeconds) ? Math.max(0, Number(session.elapsedSeconds)) : 0,
      durationSeconds: Number.isFinite(session.durationSeconds) ? Math.max(60, Number(session.durationSeconds)) : 600,
      submittedAt: typeof session.submittedAt === "string" ? session.submittedAt : null,
      score: Number.isFinite(session.score) ? Number(session.score) : null,
      settings: {
        count: questionIds.length,
        selectedTypes: [],
        order: "random",
        durationSeconds: Number.isFinite(session.durationSeconds) ? Math.max(60, Number(session.durationSeconds)) : 600,
      },
    };
  }
  return sessions;
}

function sanitizeAnswers(value: unknown): Record<string, AnswerValue> {
  if (!isRecord(value)) {
    return {};
  }
  const answers: Record<string, AnswerValue> = {};
  for (const [questionId, answer] of Object.entries(value)) {
    if (!isQuestionId(questionId)) {
      continue;
    }
    if (typeof answer === "string") {
      answers[questionId] = answer;
    } else if (Array.isArray(answer)) {
      answers[questionId] = answer.filter((item): item is string => typeof item === "string");
    }
  }
  return answers;
}

function cloneProgress(progress: ProgressData): ProgressData {
  return JSON.parse(JSON.stringify(progress)) as ProgressData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isQuestionId(value: unknown): value is string {
  return typeof value === "string" && /^Q\d{4}$/.test(value);
}

function isQuestionType(value: unknown): value is QuestionType {
  return value === "single" || value === "multiple" || value === "judge" || value === "blank";
}

function isPracticeMode(value: unknown): value is PracticeMode {
  return value === "normal" || value === "wrong" || value === "favorite";
}

