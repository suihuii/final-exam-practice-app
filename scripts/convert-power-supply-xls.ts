import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { WorkBook } from "xlsx";
import type { AnswerValue, Question, QuestionOption, QuestionType } from "../src/types";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

type Row = string[];

interface HeaderMatch {
  sheetName: string;
  rows: Row[];
  headerRowIndex: number;
  typeColumn: number;
  stemColumn: number;
  answerColumn: number;
  analysisColumn: number;
  optionColumns: Array<{ column: number; label: string }>;
}

interface RawQuestionRow {
  row: Row;
  rowNumber: number;
}

const COURSE_ID = "power-supply";
const ID_PREFIX = "PS";
const workbookPath = findWorkbookPath();
const outputPath = path.resolve("src/data/questions/power-supply.json");
const workbook = XLSX.readFile(workbookPath, { cellDates: false });
const header = findBestHeader(workbook);
const formalRows = findFormalRows(header);
const questions = formalRows.map(({ row }, index) => parseQuestion(row, header, index + 1));
const counts = countTypes(questions);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");

console.log(`题库文件: ${path.basename(workbookPath)}`);
console.log(`Sheet: ${header.sheetName}`);
console.log(`正式数据起始 Excel 行: ${formalRows[0]?.rowNumber ?? "无"}`);
console.log(`总题数: ${questions.length}`);
console.log(`单选数量: ${counts.single}`);
console.log(`多选数量: ${counts.multiple}`);
console.log(`判断数量: ${counts.judge}`);
console.log(`填空数量: ${counts.blank}`);
console.log("前 3 题预览:");
console.log(
  JSON.stringify(
    questions.slice(0, 3).map((question) => ({
      id: question.id,
      courseId: question.courseId,
      index: question.index,
      type: question.type,
      stem: question.stem.slice(0, 100),
      options: question.options,
      answer: question.answer,
      analysis: question.analysis,
    })),
    null,
    2,
  ),
);

if (questions.length !== 500) {
  console.warn(`警告: 当前解析到 ${questions.length} 题，不是 500 题，请检查 Excel 格式。`);
}

function findWorkbookPath(): string {
  const preferredPath = path.resolve("questions.xls");
  if (fs.existsSync(preferredPath)) {
    return preferredPath;
  }

  const candidates = fs
    .readdirSync(".")
    .filter((filename) => /\.(xls|xlsx)$/i.test(filename))
    .map((filename) => path.resolve(filename));

  if (candidates.length === 0) {
    throw new Error("未找到 questions.xls 或其他 .xls/.xlsx 题库文件。");
  }
  return candidates[0];
}

function findBestHeader(workbook: WorkBook): HeaderMatch {
  const matches: HeaderMatch[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils
      .sheet_to_json<Row>(sheet, { header: 1, raw: false, defval: "" })
      .map((row) => row.map(cleanCell));

    rows.forEach((row, headerRowIndex) => {
      const typeColumn = findColumn(row, /题型|类型/);
      const stemColumn = findColumn(row, /题干|题目|试题|问题|内容/);
      const answerColumn = findColumn(row, /参考答案|正确答案|答案/);
      if (typeColumn < 0 || stemColumn < 0 || answerColumn < 0) {
        return;
      }

      const optionColumns = row
        .map((cell, column) => {
          const label = parseOptionLabel(cell);
          return label ? { column, label } : null;
        })
        .filter((item): item is { column: number; label: string } => item !== null);

      matches.push({
        sheetName,
        rows,
        headerRowIndex,
        typeColumn,
        stemColumn,
        answerColumn,
        analysisColumn: findColumn(row, /解析|解释|说明|备注/),
        optionColumns,
      });
    });
  }

  if (matches.length === 0) {
    throw new Error("未找到包含题型、题干、参考答案的表头行。");
  }

  return matches.sort((left, right) => scoreHeader(right) - scoreHeader(left))[0];
}

function scoreHeader(match: HeaderMatch): number {
  return collectCandidateRows(match).length * 10 + match.optionColumns.length;
}

function findFormalRows(header: HeaderMatch): RawQuestionRow[] {
  const candidates = collectCandidateRows(header);
  return candidates.length > 500 ? candidates.slice(candidates.length - 500) : candidates;
}

function collectCandidateRows(header: HeaderMatch): RawQuestionRow[] {
  return header.rows
    .slice(header.headerRowIndex + 1)
    .map((row, index) => ({ row, rowNumber: header.headerRowIndex + 2 + index }))
    .filter(({ row }) => {
      const type = parseType(readCell(row, header.typeColumn));
      const stem = readCell(row, header.stemColumn);
      const answer = readCell(row, header.answerColumn);
      return Boolean(type && stem && answer);
    });
}

function parseQuestion(row: Row, header: HeaderMatch, index: number): Question {
  const rawType = readCell(row, header.typeColumn);
  const type = parseType(rawType) ?? "blank";
  const stem = cleanupStem(readCell(row, header.stemColumn));
  const rawAnswer = stripAnswerPrefix(readCell(row, header.answerColumn));
  const allOptions = collectOptions(row, header);
  const options = type === "judge" || type === "blank" ? [] : allOptions;
  const answer = normalizeAnswer(type, rawAnswer, allOptions);

  return {
    id: `${ID_PREFIX}-Q${String(index).padStart(4, "0")}`,
    courseId: COURSE_ID,
    index,
    type,
    stem,
    options,
    answer,
    analysis: readCell(row, header.analysisColumn),
  };
}

function collectOptions(row: Row, header: HeaderMatch): QuestionOption[] {
  return header.optionColumns
    .map(({ column, label }) => ({
      label,
      text: stripOptionPrefix(readCell(row, column), label),
    }))
    .filter((option) => option.text.length > 0);
}

function parseType(value: string): QuestionType | null {
  const text = value.replace(/\s+/g, "");
  if (/单选|单项/.test(text)) {
    return "single";
  }
  if (/多选|多项/.test(text)) {
    return "multiple";
  }
  if (/判断|是非|对错/.test(text)) {
    return "judge";
  }
  if (/填空|问答|简答/.test(text)) {
    return "blank";
  }
  return null;
}

function normalizeAnswer(type: QuestionType, rawAnswer: string, options: QuestionOption[]): AnswerValue {
  if (type === "multiple") {
    return normalizeOptionAnswer(rawAnswer);
  }
  if (type === "single") {
    return normalizeOptionAnswer(rawAnswer)[0] ?? rawAnswer.trim();
  }
  if (type === "judge") {
    return normalizeJudgeAnswer(rawAnswer, options);
  }
  return splitBlankAnswer(rawAnswer);
}

function normalizeOptionAnswer(rawAnswer: string): string[] {
  const matches = rawAnswer.toUpperCase().match(/[A-J]/g) ?? [];
  return Array.from(new Set(matches)).sort();
}

function normalizeJudgeAnswer(rawAnswer: string, options: QuestionOption[]): string {
  const optionAnswer = normalizeOptionAnswer(rawAnswer)[0];
  const optionText = optionAnswer
    ? options.find((option) => option.label === optionAnswer)?.text ?? rawAnswer
    : rawAnswer;
  const text = optionText.trim().toLowerCase();
  if (/^(正确|对|是|true|t|yes|y|√|✓)$/.test(text)) {
    return "正确";
  }
  if (/^(错误|错|否|不是|false|f|no|n|×|x)$/.test(text)) {
    return "错误";
  }
  return /正确|对|是|true|√|✓/.test(text) ? "正确" : "错误";
}

function splitBlankAnswer(rawAnswer: string): string[] {
  return rawAnswer
    .replace(/^答案[:：]?\s*/, "")
    .split(/[;；|、,\n，]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function countTypes(questions: Question[]): Record<QuestionType, number> {
  return questions.reduce(
    (counts, question) => {
      counts[question.type] += 1;
      return counts;
    },
    { single: 0, multiple: 0, judge: 0, blank: 0 },
  );
}

function findColumn(row: Row, pattern: RegExp): number {
  return row.findIndex((cell) => pattern.test(cell));
}

function parseOptionLabel(value: string): string | null {
  const match = value.match(/选项\s*\d*\s*[（(]\s*([A-J])\s*[)）]/i) ?? value.match(/^([A-J])$/i);
  return match ? match[1].toUpperCase() : null;
}

function readCell(row: Row, column: number): string {
  return column >= 0 ? row[column]?.trim() ?? "" : "";
}

function stripOptionPrefix(value: string, label: string): string {
  return value.replace(new RegExp(`^${label}[\\s]*[.．、:：]\\s*`, "i"), "").trim();
}

function stripAnswerPrefix(value: string): string {
  return value.replace(/^(正确答案|参考答案|答案|答)[:：]?\s*/g, "").trim();
}

function cleanupStem(stem: string): string {
  return stem.replace(/\s+/g, " ").trim();
}

function cleanCell(value: unknown): string {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}
