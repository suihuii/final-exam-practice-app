import type {
  AnswerValue,
  CourseId,
  CourseProgress,
  ExamSession,
  LegacyProgressData,
  PracticeMode,
  ProgressData,
  QuestionType,
  WrongRecord,
} from "../types";

export const PROGRESS_KEY = "progress_v2";
export const LEGACY_PROGRESS_KEY = "progress_v1";
export const DEFAULT_COURSE_ID = "power-supply";
export const COURSE_IDS = ["power-supply", "aesthetic-education", "power-plant"];

export const defaultCourseProgress: CourseProgress = {
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

export const defaultProgress: ProgressData = {
  version: 2,
  activeCourseId: DEFAULT_COURSE_ID,
  courses: Object.fromEntries(COURSE_IDS.map((courseId) => [courseId, cloneCourseProgress(defaultCourseProgress)])),
};

export function loadProgress(): ProgressData {
  const raw = localStorage.getItem(PROGRESS_KEY);
  if (raw) {
    try {
      return sanitizeProgress(JSON.parse(raw));
    } catch {
      return cloneProgress(defaultProgress);
    }
  }

  const legacyRaw = localStorage.getItem(LEGACY_PROGRESS_KEY);
  if (legacyRaw) {
    try {
      const migrated = migrateLegacyProgress(JSON.parse(legacyRaw));
      saveProgress(migrated);
      localStorage.removeItem(LEGACY_PROGRESS_KEY);
      return migrated;
    } catch {
      return cloneProgress(defaultProgress);
    }
  }

  return cloneProgress(defaultProgress);
}

export function saveProgress(progress: ProgressData): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function clearProgress(): ProgressData {
  const next = cloneProgress(defaultProgress);
  saveProgress(next);
  localStorage.removeItem(LEGACY_PROGRESS_KEY);
  return next;
}

export function exportProgress(progress: ProgressData): string {
  return JSON.stringify(progress, null, 2);
}

export function importProgress(text: string): ProgressData {
  const parsed = JSON.parse(text);
  const next = sanitizeProgress(parsed);
  saveProgress(next);
  localStorage.removeItem(LEGACY_PROGRESS_KEY);
  return next;
}

export function getCourseProgress(
  progress: ProgressData,
  courseId: CourseId = progress.activeCourseId,
): CourseProgress {
  return progress.courses[courseId] ?? cloneCourseProgress(defaultCourseProgress);
}

export function setActiveCourse(progress: ProgressData, courseId: CourseId): ProgressData {
  return persist({
    ...progress,
    activeCourseId: courseId,
    courses: ensureCourse(progress.courses, courseId),
  });
}

export function isFavorite(progress: CourseProgress, questionId: string): boolean {
  return progress.favorites.includes(questionId);
}

export function toggleFavorite(progress: ProgressData, questionId: string): ProgressData {
  const course = getCourseProgress(progress);
  const exists = course.favorites.includes(questionId);
  const favorites = exists
    ? course.favorites.filter((id) => id !== questionId)
    : [...course.favorites, questionId];
  return updateActiveCourse(progress, { ...course, favorites });
}

export function addWrong(progress: ProgressData, questionId: string): ProgressData {
  const course = getCourseProgress(progress);
  const previous = course.wrong[questionId];
  const record: WrongRecord = {
    count: (previous?.count ?? 0) + 1,
    lastWrongAt: new Date().toISOString(),
    note: previous?.note ?? "",
    mastered: false,
  };
  return updateActiveCourse(progress, {
    ...course,
    wrong: {
      ...course.wrong,
      [questionId]: record,
    },
  });
}

export function updateWrongNote(
  progress: ProgressData,
  questionId: string,
  note: string,
): ProgressData {
  const course = getCourseProgress(progress);
  const previous = course.wrong[questionId];
  const record: WrongRecord = {
    count: previous?.count ?? 0,
    lastWrongAt: previous?.lastWrongAt ?? "",
    note,
    mastered: previous?.mastered ?? false,
  };
  return updateActiveCourse(progress, {
    ...course,
    wrong: {
      ...course.wrong,
      [questionId]: record,
    },
  });
}

export function markWrongMastered(
  progress: ProgressData,
  questionId: string,
  mastered: boolean,
): ProgressData {
  const course = getCourseProgress(progress);
  const previous = course.wrong[questionId];
  if (!previous) {
    return progress;
  }
  return updateActiveCourse(progress, {
    ...course,
    wrong: {
      ...course.wrong,
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
  const course = getCourseProgress(progress);
  return updateActiveCourse(progress, {
    ...course,
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
  const course = getCourseProgress(progress);
  return updateActiveCourse(progress, {
    ...course,
    exams: {
      activeSessionId: active ? session.id : course.exams.activeSessionId,
      sessions: {
        ...course.exams.sessions,
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
  const course = getCourseProgress(progress);
  const session = course.exams.sessions[sessionId];
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
  const course = getCourseProgress(progress);
  return updateActiveCourse(progress, {
    ...course,
    exams: {
      ...course.exams,
      activeSessionId: null,
    },
  });
}

export function abandonActiveExam(progress: ProgressData): ProgressData {
  const course = getCourseProgress(progress);
  const activeId = course.exams.activeSessionId;
  if (!activeId) {
    return progress;
  }
  const { [activeId]: omittedSession, ...sessions } = course.exams.sessions;
  void omittedSession;
  return updateActiveCourse(progress, {
    ...course,
    exams: {
      activeSessionId: null,
      sessions,
    },
  });
}

function updateActiveCourse(progress: ProgressData, courseProgress: CourseProgress): ProgressData {
  return persist({
    ...progress,
    courses: {
      ...ensureCourse(progress.courses, progress.activeCourseId),
      [progress.activeCourseId]: courseProgress,
    },
  });
}

function persist(progress: ProgressData): ProgressData {
  saveProgress(progress);
  return progress;
}

function migrateLegacyProgress(value: unknown): ProgressData {
  const legacy = sanitizeLegacyProgress(value);
  const powerSupplyProgress = mapLegacyQuestionIds(legacy);
  return sanitizeProgress({
    version: 2,
    activeCourseId: DEFAULT_COURSE_ID,
    courses: {
      ...Object.fromEntries(COURSE_IDS.map((courseId) => [courseId, cloneCourseProgress(defaultCourseProgress)])),
      [DEFAULT_COURSE_ID]: powerSupplyProgress,
    },
  });
}

function sanitizeProgress(value: unknown): ProgressData {
  if (!isRecord(value) || value.version !== 2) {
    throw new Error("进度文件版本不正确");
  }

  const coursesSource = isRecord(value.courses) ? value.courses : null;
  if (!coursesSource) {
    throw new Error("进度文件缺少 courses 字段");
  }

  const courses = Object.fromEntries(
    COURSE_IDS.map((courseId) => [
      courseId,
      sanitizeCourseProgress(coursesSource[courseId]),
    ]),
  );

  for (const [courseId, courseProgress] of Object.entries(coursesSource)) {
    if (typeof courseId === "string" && !courses[courseId]) {
      courses[courseId] = sanitizeCourseProgress(courseProgress);
    }
  }

  if (typeof value.activeCourseId !== "string") {
    throw new Error("进度文件缺少 activeCourseId 字段");
  }
  if (!courses[value.activeCourseId]) {
    throw new Error("进度文件 activeCourseId 不在 courses 中");
  }

  return {
    version: 2,
    activeCourseId: value.activeCourseId,
    courses: ensureCourse(courses, value.activeCourseId),
  };
}

function sanitizeLegacyProgress(value: unknown): LegacyProgressData {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("旧进度文件版本不正确");
  }
  const course = sanitizeCourseProgress(value);
  return {
    version: 1,
    ...course,
  };
}

function sanitizeCourseProgress(value: unknown): CourseProgress {
  if (!isRecord(value)) {
    return cloneCourseProgress(defaultCourseProgress);
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

function mapLegacyQuestionIds(progress: CourseProgress): CourseProgress {
  const wrong = Object.fromEntries(
    Object.entries(progress.wrong).map(([questionId, record]) => [mapPowerSupplyId(questionId), record]),
  );
  const favorites = progress.favorites.map(mapPowerSupplyId);
  const sessions = Object.fromEntries(
    Object.entries(progress.exams.sessions).map(([sessionId, session]) => [
      sessionId,
      {
        ...session,
        questionIds: session.questionIds.map(mapPowerSupplyId),
        answers: Object.fromEntries(
          Object.entries(session.answers).map(([questionId, answer]) => [mapPowerSupplyId(questionId), answer]),
        ),
      },
    ]),
  );

  return {
    ...progress,
    wrong,
    favorites,
    practice: {
      ...progress.practice,
      lastQuestionId: progress.practice.lastQuestionId
        ? mapPowerSupplyId(progress.practice.lastQuestionId)
        : null,
    },
    exams: {
      ...progress.exams,
      sessions,
    },
  };
}

function sanitizeWrong(value: unknown): CourseProgress["wrong"] {
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

function ensureCourse(
  courses: Record<string, CourseProgress>,
  courseId: CourseId,
): Record<string, CourseProgress> {
  return courses[courseId]
    ? courses
    : {
        ...courses,
        [courseId]: cloneCourseProgress(defaultCourseProgress),
      };
}

function cloneProgress(progress: ProgressData): ProgressData {
  return JSON.parse(JSON.stringify(progress)) as ProgressData;
}

function cloneCourseProgress(progress: CourseProgress): CourseProgress {
  return JSON.parse(JSON.stringify(progress)) as CourseProgress;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isQuestionId(value: unknown): value is string {
  return typeof value === "string" && /^(Q\d{4}|PS-Q\d{4}|AE-P\d+-Q\d{4}|PP-Q\d{4})$/.test(value);
}

function mapPowerSupplyId(questionId: string): string {
  return /^Q\d{4}$/.test(questionId) ? `PS-${questionId}` : questionId;
}

function isQuestionType(value: unknown): value is QuestionType {
  return value === "single" || value === "multiple" || value === "judge" || value === "blank";
}

function isPracticeMode(value: unknown): value is PracticeMode {
  return value === "normal" || value === "wrong" || value === "favorite";
}

