import type { ReactNode } from "react";
import type { AnswerValue, Question } from "../types";
import { QUESTION_TYPE_LABEL } from "../types";
import { hasAnswer, normalizeAnswerForDisplay } from "../utils/exam";
import { QuestionFigure } from "./QuestionFigure";

export type ReviewStatus = "correct" | "wrong" | "unanswered" | "missing" | "neutral";

interface QuestionReviewCardProps {
  actions?: ReactNode;
  courseName?: string;
  indexLabel?: string;
  question?: Question;
  questionId: string;
  status?: ReviewStatus;
  titleSuffix?: string;
  userAnswer?: AnswerValue;
}

const STATUS_LABEL: Record<ReviewStatus, string> = {
  correct: "正确",
  wrong: "错误",
  unanswered: "未答",
  missing: "题目缺失",
  neutral: "已记录",
};

const DEFAULT_ANALYSIS_TEXT = [
  "答题思路：",
  "本题缺少可直接展示的解析。复习时应回到教材定义、设备用途和运行限制，先确认判断依据。",
  "关键点：",
  "掌握定义和适用场景比单独记答案更可靠。",
].join("\n");

export function QuestionReviewCard({
  actions,
  courseName,
  indexLabel,
  question,
  questionId,
  status = "neutral",
  titleSuffix,
  userAnswer,
}: QuestionReviewCardProps) {
  if (!question) {
    return (
      <article className="question-review-card missing">
        <div className="question-topline">
          <span>{indexLabel ?? questionId}</span>
          <span>{STATUS_LABEL.missing}</span>
        </div>
        <h2>题目数据缺失</h2>
        <p className="muted-text">当前考试记录引用的题目 {questionId} 不在本课程题库中，可能是题库去重或更新后产生的旧记录。</p>
        {actions && <div className="review-actions">{actions}</div>}
      </article>
    );
  }

  const selectedLabels = answerLabels(question, userAnswer);
  const correctLabels = answerLabels(question, question.answer);
  const showOptionList = question.options.length > 0 || question.type === "judge";

  return (
    <article className={`question-review-card ${status}`}>
      <div className="question-topline review-topline">
        <span>{indexLabel ?? question.id}</span>
        <span>{QUESTION_TYPE_LABEL[question.type]}</span>
      </div>
      <div className="review-meta-row">
        <span>{question.id}</span>
        {courseName && <span>所属课程：{courseName}</span>}
        <strong>{titleSuffix ?? STATUS_LABEL[status]}</strong>
      </div>

      <h2>{question.stem}</h2>
      <QuestionFigure question={question} />

      {showOptionList && (
        <div className="review-option-list">
          {optionRowsFor(question).map((option) => {
            const selected = selectedLabels.has(option.label);
            const correct = correctLabels.has(option.label);
            return (
              <div
                className={[
                  "review-option-row",
                  selected ? "selected" : "",
                  correct ? "correct" : "",
                  selected && !correct ? "wrong" : "",
                ].filter(Boolean).join(" ")}
                key={option.label}
              >
                <strong>{option.label}.</strong>
                <span>{option.text}</span>
                {selected && <em>我的选择</em>}
                {correct && <em>正确答案</em>}
              </div>
            );
          })}
        </div>
      )}

      <div className="answer-review-grid">
        <div>
          <span>我的答案</span>
          <strong>{formatAnswer(question, userAnswer, "未作答")}</strong>
        </div>
        <div>
          <span>正确答案</span>
          <strong>{formatAnswer(question, question.answer, "无")}</strong>
        </div>
        <div>
          <span>结果</span>
          <strong>{STATUS_LABEL[status]}</strong>
        </div>
      </div>

      <div className="analysis-box">
        <strong>解析/答题思路</strong>
        <AnalysisContent text={validAnalysis(question.analysis) ? question.analysis : DEFAULT_ANALYSIS_TEXT} />
      </div>

      {actions && <div className="review-actions">{actions}</div>}
    </article>
  );
}

export function formatAnswer(question: Question, answer: AnswerValue | undefined, emptyText = "未记录"): string {
  if (answer === undefined || !hasAnswer(answer)) {
    return emptyText;
  }

  if (question.type === "single" || question.type === "multiple") {
    const optionMap = new Map(question.options.map((option) => [option.label, option.text]));
    return [...answerLabels(question, answer)]
      .map((label) => `${label}. ${optionMap.get(label) ?? "未找到选项文本"}`)
      .join("；");
  }

  return normalizeAnswerForDisplay(answer);
}

function optionRowsFor(question: Question): Array<{ label: string; text: string }> {
  if (question.type === "judge" && question.options.length === 0) {
    return [
      { label: "正确", text: "正确" },
      { label: "错误", text: "错误" },
    ];
  }
  return question.options;
}

function answerLabels(question: Question, answer: AnswerValue | undefined): Set<string> {
  if (answer === undefined || !hasAnswer(answer)) {
    return new Set();
  }

  if (question.type === "judge") {
    const text = normalizeAnswerForDisplay(answer).trim();
    if (["正确", "对", "true", "√", "✓"].includes(text)) {
      return new Set(["正确"]);
    }
    if (["错误", "错", "false", "×", "x"].includes(text.toLowerCase())) {
      return new Set(["错误"]);
    }
    return new Set([text]);
  }

  if (question.type === "single" || question.type === "multiple") {
    const text = normalizeAnswerForDisplay(answer).toUpperCase();
    return new Set(text.match(/[A-H]/g) ?? []);
  }

  return new Set();
}

function validAnalysis(value: string | undefined): boolean {
  const text = value?.trim() ?? "";
  return text.length >= 8 && !/^p\d+(\s*-\s*p?\d+)?$/i.test(text);
}

function AnalysisContent({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="analysis-content">
      {lines.map((line, index) => {
        const match = line.match(/^(答题思路|关键点|易错点|记忆点|参考答案要点|背诵关键词)[:：]\s*(.*)$/);
        if (!match) {
          return <p key={`${index}-${line}`}>{line}</p>;
        }

        return (
          <div className="analysis-section" key={`${index}-${line}`}>
            <strong>{match[1]}：</strong>
            {match[2] && <p>{match[2]}</p>}
          </div>
        );
      })}
    </div>
  );
}
