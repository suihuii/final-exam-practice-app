import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AnswerValue, ExamSession, CourseProgress,
  ProgressData, Question, ViewKey } from "../types";
import { QUESTION_TYPE_LABEL } from "../types";
import {
  emptyAnswerFor,
  formatDuration,
  getElapsedSeconds,
  getRemainingSeconds,
  gradeExam,
  normalizeAnswerForDisplay,
  pauseSession,
  resumeSession,
} from "../utils/exam";
import {
  addWrong,
  clearActiveExam,
  setExamSession,
  updateExamAnswer,
} from "../utils/storage";

interface ExamViewProps {
  leaveExamSession: () => void;
  progress: CourseProgress;
  questionsById: Map<string, Question>;
  setProgress: Dispatch<SetStateAction<ProgressData>>;
  setView: Dispatch<SetStateAction<ViewKey>>;
}

export function ExamView({
  leaveExamSession,
  progress,
  questionsById,
  setProgress,
  setView,
}: ExamViewProps) {
  const [now, setNow] = useState(() => new Date());
  const [finalizing, setFinalizing] = useState(false);
  const session = progress.exams.activeSessionId
    ? progress.exams.sessions[progress.exams.activeSessionId]
    : null;
  const currentQuestion = session
    ? questionsById.get(session.questionIds[session.currentIndex]) ?? null
    : null;
  const grade = useMemo(
    () => (session?.submittedAt ? gradeExam(session, questionsById) : null),
    [questionsById, session],
  );
  const remainingSeconds = session ? getRemainingSeconds(session, now) : 0;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      session &&
      !session.submittedAt &&
      !session.pausedAt &&
      remainingSeconds <= 0 &&
      !finalizing
    ) {
      finalizeExam(false);
    }
  }, [finalizing, remainingSeconds, session?.id, session?.pausedAt, session?.submittedAt]);

  if (!session) {
    return (
      <section className="panel empty-panel">
        <h2>没有进行中的考试</h2>
        <button className="primary-button" onClick={() => setView("exam")} type="button">
          返回考试设置
        </button>
      </section>
    );
  }

  function updateSession(nextSession: ExamSession) {
    setProgress((previous) => setExamSession(previous, nextSession, true));
  }

  function goToQuestion(nextIndex: number) {
    if (!session) {
      return;
    }
    updateSession({
      ...session,
      currentIndex: Math.min(Math.max(0, nextIndex), session.questionIds.length - 1),
    });
  }

  function finalizeExam(requireConfirm: boolean) {
    if (!session || session.submittedAt || finalizing) {
      return;
    }
    if (requireConfirm && !window.confirm("确定交卷吗？交卷后不能修改答案。")) {
      return;
    }

    setFinalizing(true);
    const finishedSession = {
      ...session,
      elapsedSeconds: getElapsedSeconds(session),
      pausedAt: null,
      submittedAt: new Date().toISOString(),
      score: gradeExam(session, questionsById).score,
    };
    const finishedGrade = gradeExam(finishedSession, questionsById);
    setProgress((previous) => {
      let next = setExamSession(previous, finishedSession, true);
      for (const questionId of finishedGrade.wrongIds) {
        next = addWrong(next, questionId);
      }
      return next;
    });
    setFinalizing(false);
  }

  function closeSubmittedExam(nextView: ViewKey) {
    setProgress((previous) => clearActiveExam(previous));
    leaveExamSession();
    setView(nextView);
  }

  function leavePage() {
    leaveExamSession();
    setView("home");
  }

  if (session.submittedAt && grade) {
    const wrongQuestions = grade.wrongIds
      .map((questionId) => questionsById.get(questionId))
      .filter((question): question is Question => Boolean(question));

    return (
      <div className="view-stack">
        <section className="panel result-summary-panel">
          <div className="panel-heading">
            <h2>考试结果</h2>
            <span>{new Date(session.submittedAt).toLocaleString()}</span>
          </div>
          <div className="dashboard-grid">
            <article className="metric-card accent">
              <span>分数</span>
              <strong>{grade.score}</strong>
            </article>
            <article className="metric-card">
              <span>正确</span>
              <strong>{grade.correct}</strong>
            </article>
            <article className="metric-card">
              <span>错误</span>
              <strong>{grade.wrong}</strong>
            </article>
            <article className="metric-card">
              <span>未答</span>
              <strong>{grade.unanswered}</strong>
            </article>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>错题列表</h2>
            <span>{wrongQuestions.length} 题</span>
          </div>
          <div className="card-list">
            {wrongQuestions.length === 0 ? (
              <p className="muted-text">本次考试没有答错题。</p>
            ) : (
              wrongQuestions.map((question) => (
                <article className="compact-card" key={question.id}>
                  <strong>
                    {question.id} · {QUESTION_TYPE_LABEL[question.type]}
                  </strong>
                  <p>{question.stem}</p>
                  <p>正确答案：{normalizeAnswerForDisplay(question.answer)}</p>
                  <p>我的答案：{normalizeAnswerForDisplay(session.answers[question.id] ?? "")}</p>
                </article>
              ))
            )}
          </div>
          <div className="button-row">
            <button className="primary-button" onClick={() => closeSubmittedExam("stats")} type="button">
              查看统计
            </button>
            <button className="secondary-button" onClick={() => closeSubmittedExam("exam")} type="button">
              新建考试
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (session.pausedAt) {
    return (
      <section className="panel pause-panel">
        <h2>考试已暂停</h2>
        <p>剩余时间：{formatDuration(remainingSeconds)}</p>
        <div className="button-row">
          <button
            className="primary-button"
            onClick={() => updateSession(resumeSession(session))}
            type="button"
          >
            继续
          </button>
          <button className="ghost-button" onClick={leavePage} type="button">
            退出页面
          </button>
        </div>
      </section>
    );
  }

  if (!currentQuestion) {
    return (
      <section className="panel empty-panel">
        <h2>题目缺失</h2>
        <p>当前考试引用的题目不在题库中。</p>
      </section>
    );
  }

  const currentAnswer = session.answers[currentQuestion.id] ?? emptyAnswerFor(currentQuestion);

  return (
    <div className="view-stack">
      <section className="panel exam-status-panel">
        <div className="exam-status">
          <div>
            <span>剩余时间</span>
            <strong>{formatDuration(remainingSeconds)}</strong>
          </div>
          <div>
            <span>当前题号</span>
            <strong>
              {session.currentIndex + 1} / {session.questionIds.length}
            </strong>
          </div>
          <div>
            <span>已用时间</span>
            <strong>{formatDuration(getElapsedSeconds(session, now))}</strong>
          </div>
        </div>
        <div className="button-row">
          <button
            className="secondary-button"
            onClick={() => updateSession(pauseSession(session))}
            type="button"
          >
            暂停
          </button>
          <button className="ghost-button" onClick={leavePage} type="button">
            退出页面
          </button>
          <button className="danger-button" onClick={() => finalizeExam(true)} type="button">
            交卷
          </button>
        </div>
      </section>

      <section className="panel question-panel">
        <div className="question-topline">
          <span>{currentQuestion.id}</span>
          <span>{QUESTION_TYPE_LABEL[currentQuestion.type]}</span>
        </div>
        <h2>{currentQuestion.stem}</h2>

        <ExamAnswerEditor
          answer={currentAnswer}
          onChange={(nextAnswer) =>
            setProgress((previous) =>
              updateExamAnswer(previous, session.id, currentQuestion.id, nextAnswer),
            )
          }
          question={currentQuestion}
        />

        <div className="button-row sticky-actions">
          <button
            className="ghost-button"
            disabled={session.currentIndex === 0}
            onClick={() => goToQuestion(session.currentIndex - 1)}
            type="button"
          >
            上一题
          </button>
          <button
            className="ghost-button"
            disabled={session.currentIndex >= session.questionIds.length - 1}
            onClick={() => goToQuestion(session.currentIndex + 1)}
            type="button"
          >
            下一题
          </button>
        </div>
      </section>

      <section className="panel question-nav-panel">
        <div className="question-number-grid">
          {session.questionIds.map((questionId, index) => (
            <button
              className={[
                index === session.currentIndex ? "current" : "",
                session.answers[questionId] ? "answered" : "",
              ].join(" ")}
              key={questionId}
              onClick={() => goToQuestion(index)}
              type="button"
            >
              {index + 1}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ExamAnswerEditor({
  answer,
  onChange,
  question,
}: {
  answer: AnswerValue;
  onChange: (answer: AnswerValue) => void;
  question: Question;
}) {
  if (question.type === "judge") {
    return (
      <div className="option-list">
        {["正确", "错误"].map((value) => (
          <label className="option-row" key={value}>
            <input
              checked={answer === value}
              name={question.id}
              onChange={() => onChange(value)}
              type="radio"
            />
            <span>{value}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "blank") {
    const values = Array.isArray(answer) ? answer : [answer];
    const count = Math.max(values.length, Array.isArray(question.answer) ? question.answer.length : 1);
    return (
      <div className="blank-list">
        {Array.from({ length: count }, (_, index) => (
          <input
            key={index}
            onChange={(event) => {
              const next = [...values];
              next[index] = event.target.value;
              onChange(next);
            }}
            placeholder={`填空 ${index + 1}`}
            type="text"
            value={values[index] ?? ""}
          />
        ))}
      </div>
    );
  }

  if (question.type === "multiple") {
    const selected = Array.isArray(answer) ? answer : [];
    return (
      <div className="option-list">
        {question.options.map((option) => (
          <label className="option-row" key={option.label}>
            <input
              checked={selected.includes(option.label)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...selected, option.label]
                  : selected.filter((item) => item !== option.label);
                onChange(next.sort());
              }}
              type="checkbox"
            />
            <span>
              <strong>{option.label}.</strong> {option.text}
            </span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="option-list">
      {question.options.map((option) => (
        <label className="option-row" key={option.label}>
          <input
            checked={answer === option.label}
            name={question.id}
            onChange={() => onChange(option.label)}
            type="radio"
          />
          <span>
            <strong>{option.label}.</strong> {option.text}
          </span>
        </label>
      ))}
    </div>
  );
}



