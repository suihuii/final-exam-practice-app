import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ExamOrder, ProgressData, Question, QuestionType, ViewKey } from "../types";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES } from "../types";
import { createExamSession, filterQuestions, pickQuestionIds } from "../utils/exam";
import { abandonActiveExam, setExamSession } from "../utils/storage";

interface ExamSetupViewProps {
  openExamSession: () => void;
  progress: ProgressData;
  questions: Question[];
  setProgress: Dispatch<SetStateAction<ProgressData>>;
  setView: Dispatch<SetStateAction<ViewKey>>;
}

type CountChoice = "10" | "20" | "50" | "100" | "200" | "all" | "custom";

const countChoices: Array<{ value: CountChoice; label: string }> = [
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "200", label: "200" },
  { value: "all", label: "全部" },
  { value: "custom", label: "自定义" },
];

export function ExamSetupView({
  openExamSession,
  progress,
  questions,
  setProgress,
  setView,
}: ExamSetupViewProps) {
  const [showNewSetup, setShowNewSetup] = useState(false);
  const [countChoice, setCountChoice] = useState<CountChoice>("20");
  const [customCount, setCustomCount] = useState(20);
  const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>([]);
  const [order, setOrder] = useState<ExamOrder>("random");
  const [manualMinutes, setManualMinutes] = useState("");
  const activeSession = progress.exams.activeSessionId
    ? progress.exams.sessions[progress.exams.activeSessionId]
    : null;
  const unsubmittedSession = activeSession?.submittedAt ? null : activeSession;

  const availableQuestions = useMemo(
    () => filterQuestions(questions, selectedTypes),
    [questions, selectedTypes],
  );
  const resolvedCount = resolveCount(countChoice, customCount, availableQuestions.length);
  const durationSeconds = manualMinutes
    ? Math.max(60, Math.round(Number(manualMinutes) * 60))
    : Math.max(60, resolvedCount * 60);

  if (unsubmittedSession && !showNewSetup) {
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>未提交考试</h2>
          <span>{unsubmittedSession.questionIds.length} 题</span>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={openExamSession} type="button">
            继续考试
          </button>
          <button
            className="danger-button"
            onClick={() => {
              if (window.confirm("确定放弃当前未提交考试吗？")) {
                setProgress((previous) => abandonActiveExam(previous));
              }
            }}
            type="button"
          >
            放弃考试
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              if (window.confirm("新建考试会放弃当前未提交考试，是否继续？")) {
                setProgress((previous) => abandonActiveExam(previous));
                setShowNewSetup(true);
              }
            }}
            type="button"
          >
            新建考试
          </button>
        </div>
      </section>
    );
  }

  function toggleType(type: QuestionType) {
    setSelectedTypes((previous) =>
      previous.includes(type)
        ? previous.filter((item) => item !== type)
        : [...previous, type],
    );
  }

  function startExam() {
    if (availableQuestions.length === 0 || resolvedCount === 0) {
      return;
    }
    const questionIds = pickQuestionIds(availableQuestions, resolvedCount, order);
    const session = createExamSession(questionIds, durationSeconds, selectedTypes, order);
    setProgress((previous) => setExamSession(previous, session, true));
    openExamSession();
    setView("exam");
  }

  return (
    <section className="panel setup-panel">
      <div className="panel-heading">
        <h2>考试设置</h2>
        <span>{availableQuestions.length} 题可选</span>
      </div>

      <div className="form-grid">
        <label className="field-stack">
          <span>题量</span>
          <select
            onChange={(event) => setCountChoice(event.target.value as CountChoice)}
            value={countChoice}
          >
            {countChoices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>

        {countChoice === "custom" && (
          <label className="field-stack">
            <span>自定义题量</span>
            <input
              min={1}
              onChange={(event) => setCustomCount(Number(event.target.value))}
              type="number"
              value={customCount}
            />
          </label>
        )}

        <label className="field-stack">
          <span>出题方式</span>
          <select
            onChange={(event) => setOrder(event.target.value as ExamOrder)}
            value={order}
          >
            <option value="random">随机</option>
            <option value="sequence">顺序</option>
          </select>
        </label>

        <label className="field-stack">
          <span>考试分钟数</span>
          <input
            min={1}
            onChange={(event) => setManualMinutes(event.target.value)}
            placeholder={`${Math.ceil((resolvedCount * 60) / 60)} 分钟`}
            type="number"
            value={manualMinutes}
          />
        </label>
      </div>

      <div className="check-grid">
        {QUESTION_TYPES.map((type) => (
          <label className="check-row" key={type}>
            <input
              checked={selectedTypes.includes(type)}
              onChange={() => toggleType(type)}
              type="checkbox"
            />
            <span>{QUESTION_TYPE_LABEL[type]}</span>
          </label>
        ))}
      </div>

      <div className="setup-summary">
        <span>实际题量：{resolvedCount}</span>
        <span>考试时间：{Math.ceil(durationSeconds / 60)} 分钟</span>
      </div>

      <button
        className="primary-button wide-button"
        disabled={availableQuestions.length === 0 || resolvedCount === 0}
        onClick={startExam}
        type="button"
      >
        开始考试
      </button>
    </section>
  );
}

function resolveCount(choice: CountChoice, customCount: number, availableCount: number): number {
  if (choice === "all") {
    return availableCount;
  }
  if (choice === "custom") {
    return Math.min(Math.max(1, customCount || 1), availableCount);
  }
  return Math.min(Number(choice), availableCount);
}
