import type { Question, WrongRecord } from "../types";
import { normalizeAnswerForDisplay } from "./exam";
import { QUESTION_TYPE_LABEL } from "../types";

export interface WrongCsvRow {
  question: Question;
  record: WrongRecord;
}

export function buildWrongBookCsv(rows: WrongCsvRow[]): string {
  const headers = ["id", "题型", "题干", "正确答案", "错误次数", "错因备注"];
  const body = rows.map(({ question, record }) =>
    [
      question.id,
      QUESTION_TYPE_LABEL[question.type],
      question.stem,
      normalizeAnswerForDisplay(question.answer),
      String(record.count),
      record.note,
    ].map(escapeCsvField).join(","),
  );
  return `\uFEFF${headers.map(escapeCsvField).join(",")}\n${body.join("\n")}`;
}

export function downloadTextFile(
  filename: string,
  text: string,
  mimeType: string,
): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsvField(value: string): string {
  const needsEscape = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsEscape ? `"${escaped}"` : escaped;
}
