import { useEffect, useMemo, useState } from "react";
import type { Course, CourseProgress, ExamReviewFilter, ExamSession, Question } from "../types";
import { hasAnswer, isAnswerCorrect, gradeExam } from "../utils/exam";
import { QuestionReviewCard, type ReviewStatus } from "./QuestionReviewCard";

interface ExamReviewViewProps {
  activeCourse: Course;
  initialFilter?: ExamReviewFilter;
  onBack: () => void;
  progress: CourseProgress;
  questionsById: Map<string, Question>;
  sessionId: string;
}

interface ReviewItem {
  answer: ExamSession["answers"][string] | undefined;
  originalIndex: number;
  question?: Question;
  questionId: string;
  status: ReviewStatus;
}

const FILTER_LABEL: Record<ExamReviewFilter, string> = {
  all: "\u67e5\u770b\u5168\u90e8",
  wrong: "\u53ea\u770b\u9519\u9898",
  unanswered: "\u53ea\u770b\u672a\u7b54",
};

const COPY = {
  reviewTitle: "\u590d\u76d8\u8bd5\u5377",
  missingRecordTitle: "\u8003\u8bd5\u8bb0\u5f55\u4e0d\u5b58\u5728\u6216\u5df2\u88ab\u6e05\u9664",
  missingRecordText: "\u8bf7\u8fd4\u56de\u5386\u53f2\u8003\u8bd5\u5217\u8868\u91cd\u65b0\u9009\u62e9\u4e00\u6761\u8bb0\u5f55\u3002",
  missingPaperTitle: "\u65e0\u6cd5\u5b8c\u6574\u590d\u76d8",
  missingPaperText: "\u8be5\u5386\u53f2\u8bb0\u5f55\u7f3a\u5c11\u8bd5\u5377\u9898\u76ee\u6570\u636e\uff0c\u65e0\u6cd5\u5b8c\u6574\u590d\u76d8\u3002",
  score: "\u5206\u6570",
  correct: "\u6b63\u786e",
  wrong: "\u9519\u8bef",
  unanswered: "\u672a\u7b54",
  total: "\u603b\u9898\u6570",
  course: "\u6240\u5c5e\u8bfe\u7a0b",
  historyPaper: "\u5386\u53f2\u8bd5\u5377",
  unknown: "\u672a\u77e5",
  back: "\u8fd4\u56de",
  previous: "\u4e0a\u4e00\u9898",
  next: "\u4e0b\u4e00\u9898",
  noMatchingTitle: "\u5f53\u524d\u7b5b\u9009\u4e0b\u6ca1\u6709\u53ef\u590d\u76d8\u7684\u9898\u76ee",
  noWrongText: "\u8fd9\u573a\u8003\u8bd5\u6ca1\u6709\u9519\u9898\u3002",
  noUnansweredText: "\u8fd9\u573a\u8003\u8bd5\u6ca1\u6709\u672a\u7b54\u9898\u3002",
  navTitle: "\u9898\u53f7\u8df3\u8f6c",
  originalQuestionPrefix: "\u539f\u5377\u7b2c",
  questionSuffix: "\u9898",
  submittedAtFallback: "\u672a\u63d0\u4ea4",
};

export function ExamReviewView({
  activeCourse,
  initialFilter = "all",
  onBack,
  progress,
  questionsById,
  sessionId,
}: ExamReviewViewProps) {
  const [filter, setFilter] = useState<ExamReviewFilter>(initialFilter);
  const [currentIndex, setCurrentIndex] = useState(0);
  const session = progress.exams.sessions[sessionId] ?? null;

  const submittedSessions = useMemo(
    () =>
      Object.values(progress.exams.sessions)
        .filter((item) => Boolean(item.submittedAt))
        .sort((left, right) => {
          const leftTime = new Date(left.submittedAt ?? left.startedAt).getTime();
          const rightTime = new Date(right.submittedAt ?? right.startedAt).getTime();
          return rightTime - leftTime;
        }),
    [progress.exams.sessions],
  );

  const historyIndex = session ? submittedSessions.findIndex((item) => item.id === session.id) : -1;
  const historyLabel = historyIndex >= 0
    ? String(historyIndex + 1) + " / " + submittedSessions.length
    : COPY.unknown;
  const grade = useMemo(
    () => (session ? session.review ?? gradeExam(session, questionsById) : null),
    [questionsById, session],
  );

  const allItems = useMemo(
    () =>
      session?.questionIds.map((questionId, index) => {
        const question = questionsById.get(questionId);
        return {
          answer: session.answers[questionId],
          originalIndex: index,
          question,
          questionId,
          status: statusFor(session, questionId, question),
        } satisfies ReviewItem;
      }) ?? [],
    [questionsById, session],
  );

  const visibleItems = useMemo(() => {
    if (filter === "wrong") {
      return allItems.filter((item) => item.status === "wrong");
    }
    if (filter === "unanswered") {
      return allItems.filter((item) => item.status === "unanswered");
    }
    return allItems;
  }, [allItems, filter]);

  const currentItem = visibleItems[currentIndex] ?? null;

  useEffect(() => {
    setFilter(initialFilter);
    setCurrentIndex(0);
  }, [initialFilter, sessionId]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [filter, sessionId]);

  useEffect(() => {
    if (currentIndex >= visibleItems.length) {
      setCurrentIndex(Math.max(0, visibleItems.length - 1));
    }
  }, [currentIndex, visibleItems.length]);

  function goToQuestion(nextIndex: number) {
    setCurrentIndex(Math.min(Math.max(0, nextIndex), visibleItems.length - 1));
  }

  if (!session) {
    return (
      <section className="panel empty-panel">
        <h2>{COPY.missingRecordTitle}</h2>
        <p className="muted-text">{COPY.missingRecordText}</p>
        <button className="ghost-button" onClick={onBack} type="button">
          {COPY.back}
        </button>
      </section>
    );
  }

  if (session.questionIds.length === 0) {
    return (
      <div className="view-stack exam-review-view">
        <ReviewSummary
          activeCourse={activeCourse}
          filter={filter}
          grade={grade}
          historyLabel={historyLabel}
          onBack={onBack}
          onFilterChange={setFilter}
          session={session}
        />
        <section className="panel empty-panel">
          <h2>{COPY.missingPaperTitle}</h2>
          <p className="muted-text">{COPY.missingPaperText}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="view-stack exam-review-view">
      <ReviewSummary
        activeCourse={activeCourse}
        filter={filter}
        grade={grade}
        historyLabel={historyLabel}
        onBack={onBack}
        onFilterChange={setFilter}
        session={session}
      />

      {!currentItem ? (
        <section className="panel empty-panel">
          <h2>{COPY.noMatchingTitle}</h2>
          <p className="muted-text">{filter === "wrong" ? COPY.noWrongText : COPY.noUnansweredText}</p>
        </section>
      ) : (
        <>
          <QuestionReviewCard
            courseName={activeCourse.name}
            indexLabel={String(currentIndex + 1) + " / " + visibleItems.length}
            question={currentItem.question}
            questionId={currentItem.questionId}
            status={currentItem.status}
            titleSuffix={COPY.originalQuestionPrefix + " " + (currentItem.originalIndex + 1) + " " + COPY.questionSuffix}
            userAnswer={currentItem.answer}
          />

          <section className="panel">
            <div className="button-row sticky-actions">
              <button
                className="ghost-button"
                disabled={currentIndex === 0}
                onClick={() => goToQuestion(currentIndex - 1)}
                type="button"
              >
                {COPY.previous}
              </button>
              <button
                className="ghost-button"
                disabled={currentIndex >= visibleItems.length - 1}
                onClick={() => goToQuestion(currentIndex + 1)}
                type="button"
              >
                {COPY.next}
              </button>
            </div>
          </section>
        </>
      )}

      <section className="panel question-nav-panel">
        <div className="panel-heading">
          <h2>{COPY.navTitle}</h2>
          <span>{FILTER_LABEL[filter]}</span>
        </div>
        <div className="question-number-grid review-number-grid">
          {visibleItems.map((item, visibleIndex) => (
            <button
              className={[
                visibleIndex === currentIndex ? "current" : "",
                item.status,
              ].filter(Boolean).join(" ")}
              key={item.questionId + "-" + item.originalIndex}
              onClick={() => goToQuestion(visibleIndex)}
              type="button"
            >
              {item.originalIndex + 1}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReviewSummary({
  activeCourse,
  filter,
  grade,
  historyLabel,
  onBack,
  onFilterChange,
  session,
}: {
  activeCourse: Course;
  filter: ExamReviewFilter;
  grade: ReturnType<typeof gradeExam> | ExamSession["review"] | null;
  historyLabel: string;
  onBack: () => void;
  onFilterChange: (filter: ExamReviewFilter) => void;
  session: ExamSession;
}) {
  return (
    <section className="panel exam-review-toolbar">
      <div className="panel-heading">
        <h2>{COPY.reviewTitle}</h2>
        <span>{session.submittedAt ? new Date(session.submittedAt).toLocaleString() : COPY.submittedAtFallback}</span>
      </div>
      <div className="dashboard-grid">
        <article className="metric-card accent">
          <span>{COPY.score}</span>
          <strong>{session.score ?? grade?.score ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>{COPY.correct}</span>
          <strong>{grade?.correct ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>{COPY.wrong}</span>
          <strong>{grade?.wrong ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>{COPY.unanswered}</span>
          <strong>{grade?.unanswered ?? 0}</strong>
        </article>
      </div>
      <p className="muted-text">
        {COPY.course}{"\uff1a"}{activeCourse.name}{" \u00b7 "}{COPY.historyPaper} {historyLabel}{" \u00b7 "}{COPY.total} {session.questionIds.length || session.settings.count || 0}
      </p>
      <div className="button-row">
        {(["all", "wrong", "unanswered"] as ExamReviewFilter[]).map((item) => (
          <button
            className={filter === item ? "primary-button" : "secondary-button"}
            key={item}
            onClick={() => onFilterChange(item)}
            type="button"
          >
            {FILTER_LABEL[item]}
          </button>
        ))}
        <button className="ghost-button" onClick={onBack} type="button">
          {COPY.back}
        </button>
      </div>
    </section>
  );
}

function statusFor(session: ExamSession, questionId: string, question: Question | undefined): ReviewStatus {
  if (!question) {
    return "missing";
  }

  const answer = session.answers[questionId];
  if (session.review) {
    if (session.review.unansweredIds.includes(questionId)) {
      return "unanswered";
    }
    if (session.review.wrongIds.includes(questionId)) {
      return "wrong";
    }
    return "correct";
  }

  if (!hasAnswer(answer)) {
    return "unanswered";
  }
  return isAnswerCorrect(question, answer) ? "correct" : "wrong";
}
