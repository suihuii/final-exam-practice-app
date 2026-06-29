import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Course, CourseProgress, ProgressData, Question, QuestionType } from "../types";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES } from "../types";
import { QuestionReviewCard } from "./QuestionReviewCard";
import { buildWrongBookCsv, downloadTextFile } from "../utils/csv";
import { markWrongMastered, updateWrongNote } from "../utils/storage";

interface WrongBookViewProps {
  activeCourse: Course;
  progress: CourseProgress;
  questions: Question[];
  setProgress: Dispatch<SetStateAction<ProgressData>>;
}

type FilterType = QuestionType | "all";

export function WrongBookView({
  activeCourse,
  progress,
  questions,
  setProgress,
}: WrongBookViewProps) {
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [hideMastered, setHideMastered] = useState(true);
  const wrongRows = useMemo(() => {
    return questions
      .map((question) => ({
        question,
        record: progress.wrong[question.id],
      }))
      .filter(({ question, record }) => {
        if (!record || record.count <= 0) {
          return false;
        }
        if (filterType !== "all" && question.type !== filterType) {
          return false;
        }
        return !(hideMastered && record.mastered);
      })
      .sort((left, right) => right.record.count - left.record.count);
  }, [filterType, hideMastered, progress.wrong, questions]);

  function exportCsv() {
    const csv = buildWrongBookCsv(wrongRows);
    downloadTextFile("wrong-book.csv", csv, "text/csv;charset=utf-8");
  }

  return (
    <div className="view-stack">
      <section className="panel toolbar-panel">
        <div className="segmented-wrap" aria-label="错题题型筛选">
          <button
            className={filterType === "all" ? "selected" : ""}
            onClick={() => setFilterType("all")}
            type="button"
          >
            全部
          </button>
          {QUESTION_TYPES.map((type) => (
            <button
              className={filterType === type ? "selected" : ""}
              key={type}
              onClick={() => setFilterType(type)}
              type="button"
            >
              {QUESTION_TYPE_LABEL[type]}
            </button>
          ))}
        </div>
        <label className="check-row inline-check">
          <input
            checked={hideMastered}
            onChange={(event) => setHideMastered(event.target.checked)}
            type="checkbox"
          />
          <span>隐藏已掌握</span>
        </label>
        <button className="secondary-button" onClick={exportCsv} type="button">
          导出 CSV
        </button>
      </section>

      <section className="panel wrong-table-panel">
        <div className="panel-heading">
          <h2>错题本</h2>
          <span>{wrongRows.length} 题</span>
        </div>

        {wrongRows.length === 0 ? (
          <p className="muted-text">当前筛选下没有错题。</p>
        ) : (
          <div className="wrong-review-list">
            {wrongRows.map(({ question, record }, index) => {
              const savedPracticeAnswer = progress.practice.answers[question.id]?.selectedAnswer;
              const userAnswer = record.lastAnswer ?? savedPracticeAnswer;
              return (
                <QuestionReviewCard
                  actions={(
                    <div className="wrong-review-actions">
                      <label className="field-stack">
                        <span>错因备注</span>
                        <textarea
                          onChange={(event) =>
                            setProgress((previous) =>
                              updateWrongNote(previous, question.id, event.target.value),
                            )
                          }
                          value={record.note}
                        />
                      </label>
                      <label className="check-row">
                        <input
                          checked={record.mastered}
                          onChange={(event) =>
                            setProgress((previous) =>
                              markWrongMastered(previous, question.id, event.target.checked),
                            )
                          }
                          type="checkbox"
                        />
                        <span>已掌握</span>
                      </label>
                    </div>
                  )}
                  courseName={activeCourse.name}
                  indexLabel={`${index + 1} / ${wrongRows.length}`}
                  key={question.id}
                  question={question}
                  questionId={question.id}
                  status="wrong"
                  titleSuffix={`${record.count} 次错误${record.lastWrongAt ? ` · ${new Date(record.lastWrongAt).toLocaleString()}` : ""}`}
                  userAnswer={userAnswer}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
