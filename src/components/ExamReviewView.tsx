import { useEffect, useMemo, useState } from "react";
import type { ExamSession, Question } from "../types";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES } from "../types";
import { hasAnswer, isAnswerCorrect } from "../utils/exam";
import { QuestionReviewCard, type ReviewStatus } from "./QuestionReviewCard";

interface ExamReviewViewProps {
  initialOnlyWrong?: boolean;
  onBack: () => void;
  questionsById: Map<string, Question>;
  session: ExamSession;
}

interface ReviewItem {
  answer: ExamSession["answers"][string] | undefined;
  originalIndex: number;
  question?: Question;
  questionId: string;
  status: ReviewStatus;
}

export function ExamReviewView({
  initialOnlyWrong = false,
  onBack,
  questionsById,
  session,
}: ExamReviewViewProps) {
  const [onlyWrong, setOnlyWrong] = useState(initialOnlyWrong);
  const [currentIndex, setCurrentIndex] = useState(0);

  const allItems = useMemo(
    () => session.questionIds.map((questionId, index) => {
      const question = questionsById.get(questionId);
      return {
        answer: session.answers[questionId],
        originalIndex: index,
        question,
        questionId,
        status: statusFor(session, questionId, question),
      } satisfies ReviewItem;
    }),
    [questionsById, session],
  );

  const visibleItems = useMemo(
    () => onlyWrong
      ? allItems.filter((item) => item.status === "wrong" || item.status === "unanswered" || item.status === "missing")
      : allItems,
    [allItems, onlyWrong],
  );

  const sections = useMemo(() => buildSections(visibleItems), [visibleItems]);
  const currentItem = visibleItems[currentIndex] ?? null;

  useEffect(() => {
    setCurrentIndex(0);
  }, [onlyWrong, session.id]);

  useEffect(() => {
    if (currentIndex >= visibleItems.length) {
      setCurrentIndex(Math.max(0, visibleItems.length - 1));
    }
  }, [currentIndex, visibleItems.length]);

  function goToQuestion(nextIndex: number) {
    setCurrentIndex(Math.min(Math.max(0, nextIndex), visibleItems.length - 1));
  }

  return (
    <div className="view-stack exam-review-view">
      <section className="panel exam-review-toolbar">
        <div className="panel-heading">
          <h2>复盘试卷</h2>
          <span>{session.submittedAt ? new Date(session.submittedAt).toLocaleString() : "未提交"}</span>
        </div>
        <div className="button-row">
          <button className={!onlyWrong ? "primary-button" : "secondary-button"} onClick={() => setOnlyWrong(false)} type="button">
            查看全部
          </button>
          <button className={onlyWrong ? "primary-button" : "secondary-button"} onClick={() => setOnlyWrong(true)} type="button">
            只看错题/未答
          </button>
          <button className="ghost-button" onClick={onBack} type="button">
            返回
          </button>
        </div>
      </section>

      {!currentItem ? (
        <section className="panel empty-panel">
          <h2>没有可复盘的题目</h2>
          <p>当前筛选下没有错题或未答题。</p>
        </section>
      ) : (
        <>
          <QuestionReviewCard
            indexLabel={`${currentIndex + 1} / ${visibleItems.length}`}
            question={currentItem.question}
            questionId={currentItem.questionId}
            status={currentItem.status}
            titleSuffix={`原卷第 ${currentItem.originalIndex + 1} 题`}
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
                上一题
              </button>
              <button
                className="ghost-button"
                disabled={currentIndex >= visibleItems.length - 1}
                onClick={() => goToQuestion(currentIndex + 1)}
                type="button"
              >
                下一题
              </button>
            </div>
          </section>
        </>
      )}

      <section className="panel question-nav-panel">
        <div className="panel-heading">
          <h2>题型导航</h2>
          <span>单选 → 多选 → 判断 → 填空/简答</span>
        </div>
        <div className="exam-type-sections">
          {sections.map((section) => (
            <div className="exam-type-section" key={section.key}>
              <div className="exam-type-section-heading">
                <strong>{section.label}</strong>
                <span>{section.items.length} 题</span>
              </div>
              <div className="question-number-grid review-number-grid">
                {section.items.map((item) => {
                  const visibleIndex = visibleItems.findIndex((candidate) => candidate.questionId === item.questionId && candidate.originalIndex === item.originalIndex);
                  return (
                    <button
                      className={[
                        visibleIndex === currentIndex ? "current" : "",
                        item.status,
                      ].filter(Boolean).join(" ")}
                      key={`${item.questionId}-${item.originalIndex}`}
                      onClick={() => goToQuestion(visibleIndex)}
                      type="button"
                    >
                      {item.originalIndex + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
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

function buildSections(items: ReviewItem[]): Array<{ key: string; label: string; items: ReviewItem[] }> {
  const typedSections: Array<{ key: string; label: string; items: ReviewItem[] }> = QUESTION_TYPES.map((type) => ({
    key: type,
    label: QUESTION_TYPE_LABEL[type],
    items: items.filter((item) => item.question?.type === type),
  })).filter((section) => section.items.length > 0);

  const missingItems = items.filter((item) => !item.question);
  if (missingItems.length > 0) {
    typedSections.push({
      key: "missing",
      label: "题目缺失",
      items: missingItems,
    });
  }
  return typedSections;
}
