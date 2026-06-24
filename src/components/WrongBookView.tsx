import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ProgressData, Question, QuestionType } from "../types";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES } from "../types";
import { buildWrongBookCsv, downloadTextFile } from "../utils/csv";
import { normalizeAnswerForDisplay } from "../utils/exam";
import { markWrongMastered, updateWrongNote } from "../utils/storage";

interface WrongBookViewProps {
  progress: ProgressData;
  questions: Question[];
  setProgress: Dispatch<SetStateAction<ProgressData>>;
}

type FilterType = QuestionType | "all";

export function WrongBookView({
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
          <>
            <div className="wrong-table desktop-table" role="table">
              <div className="table-row table-head" role="row">
                <span>题号</span>
                <span>题型</span>
                <span>题干</span>
                <span>答案</span>
                <span>次数</span>
                <span>备注</span>
                <span>掌握</span>
              </div>
              {wrongRows.map(({ question, record }) => (
                <div className="table-row" key={question.id} role="row">
                  <span>{question.id}</span>
                  <span>{QUESTION_TYPE_LABEL[question.type]}</span>
                  <span>{question.stem}</span>
                  <span>{normalizeAnswerForDisplay(question.answer)}</span>
                  <span>
                    {record.count}
                    <small>{record.lastWrongAt ? new Date(record.lastWrongAt).toLocaleString() : ""}</small>
                  </span>
                  <span>
                    <textarea
                      onChange={(event) =>
                        setProgress((previous) =>
                          updateWrongNote(previous, question.id, event.target.value),
                        )
                      }
                      value={record.note}
                    />
                  </span>
                  <span>
                    <input
                      checked={record.mastered}
                      onChange={(event) =>
                        setProgress((previous) =>
                          markWrongMastered(previous, question.id, event.target.checked),
                        )
                      }
                      type="checkbox"
                    />
                  </span>
                </div>
              ))}
            </div>

            <div className="card-list mobile-cards">
              {wrongRows.map(({ question, record }) => (
                <article className="compact-card" key={question.id}>
                  <strong>
                    {question.id} · {QUESTION_TYPE_LABEL[question.type]} · {record.count} 次
                  </strong>
                  <p>{question.stem}</p>
                  <p>正确答案：{normalizeAnswerForDisplay(question.answer)}</p>
                  <p>上次错误：{record.lastWrongAt ? new Date(record.lastWrongAt).toLocaleString() : "无"}</p>
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
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
