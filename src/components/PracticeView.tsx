import { useEffect, useMemo, useState } from "react";
import type {
  AnswerValue,
  PracticeMode,
  CourseProgress,
  ProgressData,
  Question,
  QuestionType,
} from "../types";
import { QuestionFigure } from "./QuestionFigure";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES } from "../types";
import {
  emptyAnswerFor,
  hasAnswer,
  isAnswerCorrect,
  normalizeAnswerForDisplay,
  shuffle,
} from "../utils/exam";
import {
  addWrong,
  isFavorite,
  recordPracticeAnswer,
  setPracticeState,
  toggleFavorite,
  updateWrongNote,
} from "../utils/storage";

interface PracticeViewProps {
  progress: CourseProgress;
  questions: Question[];
  setProgress: React.Dispatch<React.SetStateAction<ProgressData>>;
}

type PracticeOrder = "sequence" | "random";
type FilterType = QuestionType | "all";
type PracticeQuestionStatus = "todo" | "done" | "correct" | "wrong";

const STATUS_LABEL: Record<PracticeQuestionStatus, string> = {
  todo: "未做",
  done: "已做",
  correct: "对",
  wrong: "错",
};

export function PracticeView({
  progress,
  questions,
  setProgress,
}: PracticeViewProps) {
  const [filterType, setFilterType] = useState<FilterType>(
    progress.practice.filterTypes.length === 1
      ? progress.practice.filterTypes[0]
      : "all",
  );
  const [mode, setMode] = useState<PracticeMode>(progress.practice.mode);
  const [order, setOrder] = useState<PracticeOrder>("sequence");
  const [randomSeed, setRandomSeed] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(progress.practice.currentIndex);
  const [answer, setAnswer] = useState<AnswerValue>("");
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);

  const practiceQuestions = useMemo(() => {
    let source = filterType === "all"
      ? questions
      : questions.filter((question) => question.type === filterType);

    if (mode === "wrong") {
      source = source.filter((question) => (progress.wrong[question.id]?.count ?? 0) > 0);
    }

    if (mode === "favorite") {
      source = source.filter((question) => progress.favorites.includes(question.id));
    }

    return order === "random" ? shuffle(source) : source;
  }, [filterType, mode, order, progress.favorites, progress.wrong, questions, randomSeed]);

  useEffect(() => {
    if (practiceQuestions.length === 0) {
      setCurrentIndex(0);
      return;
    }

    const restoredIndex = resolvePracticeIndex(
      practiceQuestions,
      progress.practice.lastQuestionId,
      progress.practice.currentIndex,
    );
    setCurrentIndex((value) => (value === restoredIndex ? value : restoredIndex));
  }, [practiceQuestions, progress.practice.currentIndex, progress.practice.lastQuestionId]);

  const currentQuestion = practiceQuestions[currentIndex] ?? null;
  const savedAnswer = currentQuestion ? progress.practice.answers[currentQuestion.id] : undefined;
  const statusCounts = useMemo(
    () => countPracticeStatuses(practiceQuestions, progress.practice.answers),
    [practiceQuestions, progress.practice.answers],
  );

  useEffect(() => {
    if (!currentQuestion) {
      setAnswer("");
      setSubmitted(false);
      setResult(null);
      return;
    }

    if (savedAnswer) {
      setAnswer(normalizeSavedAnswer(currentQuestion, savedAnswer.selectedAnswer));
      setSubmitted(savedAnswer.answerVisible === true);
      setResult(savedAnswer.isCorrect);
      return;
    }

    setAnswer(emptyAnswerFor(currentQuestion));
    setSubmitted(false);
    setResult(null);
  }, [currentQuestion?.id, savedAnswer?.answeredAt]);

  function filterTypesFor(nextFilterType: FilterType): QuestionType[] {
    return nextFilterType === "all" ? [] : [nextFilterType];
  }

  function persistPractice(
    questionId: string | null,
    nextIndex: number,
    nextMode = mode,
    nextFilterType = filterType,
  ) {
    setProgress((previous) =>
      setPracticeState(
        previous,
        questionId,
        nextIndex,
        nextMode,
        filterTypesFor(nextFilterType),
      ),
    );
  }

  function changeFilter(nextFilterType: FilterType) {
    setFilterType(nextFilterType);
    setCurrentIndex(0);
    persistPractice(null, 0, mode, nextFilterType);
  }

  function changeMode(nextMode: PracticeMode) {
    setMode(nextMode);
    setCurrentIndex(0);
    persistPractice(null, 0, nextMode, filterType);
  }

  function changeOrder(nextOrder: PracticeOrder) {
    setOrder(nextOrder);
    setCurrentIndex(0);
    persistPractice(null, 0);
    if (nextOrder === "random") {
      setRandomSeed((value) => value + 1);
    }
  }

  function goToQuestion(nextIndex: number) {
    const boundedIndex = Math.min(Math.max(0, nextIndex), practiceQuestions.length - 1);
    const nextQuestion = practiceQuestions[boundedIndex];
    setCurrentIndex(boundedIndex);
    persistPractice(nextQuestion?.id ?? null, boundedIndex);
  }

  function handleAnswerChange(nextAnswer: AnswerValue) {
    setAnswer(nextAnswer);
    setSubmitted(false);
    setResult(null);
    if (!currentQuestion) {
      return;
    }
    setProgress((previous) =>
      recordPracticeAnswer(previous, currentQuestion.id, nextAnswer, null, false),
    );
  }

  function submitAnswer() {
    if (!currentQuestion) {
      return;
    }
    const correct = isAnswerCorrect(currentQuestion, answer);
    setSubmitted(true);
    setResult(correct);
    setProgress((previous) => {
      let next = recordPracticeAnswer(previous, currentQuestion.id, answer, correct, true);
      if (!correct) {
        next = addWrong(next, currentQuestion.id);
      }
      return next;
    });
  }

  function updateNote(note: string) {
    if (!currentQuestion) {
      return;
    }
    setProgress((previous) => updateWrongNote(previous, currentQuestion.id, note));
  }

  function handleFavorite() {
    if (!currentQuestion) {
      return;
    }
    setProgress((previous) => toggleFavorite(previous, currentQuestion.id));
  }

  return (
    <div className="view-stack">
      <section className="panel toolbar-panel">
        <div className="segmented-wrap" aria-label="题型筛选">
          <button
            className={filterType === "all" ? "selected" : ""}
            onClick={() => changeFilter("all")}
            type="button"
          >
            全部
          </button>
          {QUESTION_TYPES.map((type) => (
            <button
              className={filterType === type ? "selected" : ""}
              key={type}
              onClick={() => changeFilter(type)}
              type="button"
            >
              {QUESTION_TYPE_LABEL[type]}
            </button>
          ))}
        </div>

        <div className="segmented-wrap" aria-label="练习来源">
          <button
            className={mode === "normal" ? "selected" : ""}
            onClick={() => changeMode("normal")}
            type="button"
          >
            全部题
          </button>
          <button
            className={mode === "wrong" ? "selected" : ""}
            onClick={() => changeMode("wrong")}
            type="button"
          >
            只练错题
          </button>
          <button
            className={mode === "favorite" ? "selected" : ""}
            onClick={() => changeMode("favorite")}
            type="button"
          >
            只练收藏
          </button>
        </div>

        <div className="segmented-wrap" aria-label="出题顺序">
          <button
            className={order === "sequence" ? "selected" : ""}
            onClick={() => changeOrder("sequence")}
            type="button"
          >
            顺序
          </button>
          <button
            className={order === "random" ? "selected" : ""}
            onClick={() => changeOrder("random")}
            type="button"
          >
            随机
          </button>
        </div>
      </section>

      {!currentQuestion ? (
        <section className="panel empty-panel">
          <h2>没有可练习的题目</h2>
          <p>调整筛选条件后继续。</p>
        </section>
      ) : (
        <>
          <section className="panel question-panel">
            <div className="question-topline">
              <span>
                {currentIndex + 1} / {practiceQuestions.length}
              </span>
              <span>{QUESTION_TYPE_LABEL[currentQuestion.type]}</span>
            </div>

            <h2>{currentQuestion.stem}</h2>
            <QuestionFigure question={currentQuestion} />

            <AnswerEditor
              answer={answer}
              disabled={false}
              onChange={handleAnswerChange}
              question={currentQuestion}
            />

            {submitted && (
              <div className={result === false ? "result-box danger" : "result-box success"}>
                <strong>{result === null ? "已显示答案" : result ? "回答正确" : "回答错误"}</strong>
                <p>正确答案：{normalizeAnswerForDisplay(currentQuestion.answer)}</p>
                <p>我的答案：{normalizeAnswerForDisplay(answer)}</p>
                {currentQuestion.analysis && <p>解析：{currentQuestion.analysis}</p>}
              </div>
            )}

            <label className="field-stack">
              <span>错因备注</span>
              <textarea
                onChange={(event) => updateNote(event.target.value)}
                placeholder="可记录易错点"
                value={progress.wrong[currentQuestion.id]?.note ?? ""}
              />
            </label>

            <div className="button-row sticky-actions">
              <button
                className="ghost-button"
                disabled={currentIndex === 0}
                onClick={() => goToQuestion(currentIndex - 1)}
                type="button"
              >
                上一题
              </button>
              <button className="primary-button" onClick={submitAnswer} type="button">
                {submitted ? "重新提交" : "提交"}
              </button>
              <button className="secondary-button" onClick={handleFavorite} type="button">
                {isFavorite(progress, currentQuestion.id) ? "取消收藏" : "收藏"}
              </button>
              <button
                className="ghost-button"
                disabled={currentIndex >= practiceQuestions.length - 1}
                onClick={() => goToQuestion(currentIndex + 1)}
                type="button"
              >
                下一题
              </button>
            </div>
          </section>

          <section className="panel practice-nav-panel">
            <div className="panel-heading">
              <h2>题号导航</h2>
              <span>
                未做 {statusCounts.todo} · 已做 {statusCounts.done} · 正确 {statusCounts.correct} · 错误 {statusCounts.wrong}
              </span>
            </div>
            <div className="practice-number-grid" aria-label="练习题号导航">
              {practiceQuestions.map((question, index) => {
                const status = practiceStatusFor(progress.practice.answers[question.id]);
                return (
                  <button
                    className={[
                      "practice-number-button",
                      status,
                      index === currentIndex ? "current" : "",
                      isFavorite(progress, question.id) ? "favorite" : "",
                    ].filter(Boolean).join(" ")}
                    key={question.id}
                    onClick={() => goToQuestion(index)}
                    title={`${index + 1}. ${STATUS_LABEL[status]} ${question.id}`}
                    type="button"
                  >
                    <span>{index + 1}</span>
                    <small>{STATUS_LABEL[status]}</small>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function AnswerEditor({
  answer,
  disabled,
  onChange,
  question,
}: {
  answer: AnswerValue;
  disabled: boolean;
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
              disabled={disabled}
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
            disabled={disabled}
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
              disabled={disabled}
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
            disabled={disabled}
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

function resolvePracticeIndex(
  questions: Question[],
  questionId: string | null,
  storedIndex: number,
): number {
  if (questions.length === 0) {
    return 0;
  }

  const questionIndex = questionId
    ? questions.findIndex((question) => question.id === questionId)
    : -1;
  if (questionIndex >= 0) {
    return questionIndex;
  }
  return Math.min(Math.max(0, storedIndex), questions.length - 1);
}

function normalizeSavedAnswer(question: Question, value: AnswerValue): AnswerValue {
  if (question.type === "multiple" || question.type === "blank") {
    return Array.isArray(value) ? value : [value];
  }
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function practiceStatusFor(
  record: CourseProgress["practice"]["answers"][string] | undefined,
): PracticeQuestionStatus {
  if (!record || (!hasAnswer(record.selectedAnswer) && !record.answerVisible)) {
    return "todo";
  }
  if (record.isCorrect === true) {
    return "correct";
  }
  if (record.isCorrect === false) {
    return "wrong";
  }
  return "done";
}

function countPracticeStatuses(
  questions: Question[],
  answers: CourseProgress["practice"]["answers"],
): Record<PracticeQuestionStatus, number> {
  return questions.reduce(
    (counts, question) => {
      const status = practiceStatusFor(answers[question.id]);
      counts[status] += 1;
      return counts;
    },
    { todo: 0, done: 0, correct: 0, wrong: 0 },
  );
}