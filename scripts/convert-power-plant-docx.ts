import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { decode as decodeEntities } from "html-entities";
import type { AnswerValue, Question, QuestionOption, QuestionType } from "../src/types";

interface ZipEntry {
  compressedSize: number;
  localHeaderOffset: number;
  method: number;
  name: string;
}

interface DraftQuestion {
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  rawAnswer: string;
}

const COURSE_ID = "power-plant";
const ID_PREFIX = "PP";
const inputPath = path.resolve("raw/power-plant/发电厂题库.docx");
const outputPath = path.resolve("src/data/questions/power-plant.json");

if (!fs.existsSync(inputPath)) {
  throw new Error(`未找到发电厂题库文件: ${inputPath}`);
}

const lines = docxToLines(fs.readFileSync(inputPath));
const { questions, missingAnswerIds, unknownTypeIds } = parseQuestions(lines);
const counts = countTypes(questions);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");

console.log(`题库文件: ${path.basename(inputPath)}`);
console.log(`总题数: ${questions.length}`);
console.log(`单选数量: ${counts.single}`);
console.log(`多选数量: ${counts.multiple}`);
console.log(`判断数量: ${counts.judge}`);
console.log(`简答数量: ${counts.blank}`);
if (missingAnswerIds.length > 0) {
  console.warn(`警告: 以下题目没有答案: ${missingAnswerIds.join(", ")}`);
}
if (unknownTypeIds.length > 0) {
  console.warn(`警告: 以下题目无法识别题型: ${unknownTypeIds.join(", ")}`);
}
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
    })),
    null,
    2,
  ),
);

function docxToLines(buffer: Buffer): string[] {
  const documentXml = readZipEntry(buffer, "word/document.xml").toString("utf8");
  return decodeEntities(documentXml)
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function readZipEntry(buffer: Buffer, entryName: string): Buffer {
  const endOfCentralDirectoryOffset = findEndOfCentralDirectory(buffer);
  const centralDirectorySize = buffer.readUInt32LE(endOfCentralDirectoryOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(endOfCentralDirectoryOffset + 16);
  const entry = findZipEntry(buffer, centralDirectoryOffset, centralDirectorySize, entryName);

  if (!entry) {
    throw new Error(`docx 中没有找到 ${entryName}`);
  }

  const fileNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataOffset = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);

  if (entry.method === 0) {
    return compressed;
  }
  if (entry.method === 8) {
    return zlib.inflateRawSync(compressed);
  }
  throw new Error(`${entry.name} 使用了暂不支持的 zip 压缩方式: ${entry.method}`);
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 66000);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("不是有效的 docx/zip 文件。");
}

function findZipEntry(
  buffer: Buffer,
  offset: number,
  size: number,
  entryName: string,
): ZipEntry | null {
  let cursor = offset;
  const end = offset + size;

  while (cursor < end) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("docx central directory 结构异常。");
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");

    if (name === entryName) {
      return { compressedSize, localHeaderOffset, method, name };
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function parseQuestions(lines: string[]): {
  questions: Question[];
  missingAnswerIds: string[];
  unknownTypeIds: string[];
} {
  const drafts: DraftQuestion[] = [];
  let activeType: QuestionType | null = null;
  let draft: DraftQuestion | null = null;

  function flushDraft() {
    if (!draft) {
      return;
    }
    draft.stem = cleanupStem(draft.stem);
    draft.rawAnswer = stripAnswerPrefix(draft.rawAnswer);
    drafts.push(draft);
    draft = null;
  }

  for (const line of lines) {
    const sectionType = parseSectionHeading(line);
    if (sectionType) {
      flushDraft();
      activeType = sectionType;
      continue;
    }
    if (!activeType) {
      continue;
    }

    const answer = parseAnswerLine(line);
    if (answer !== null) {
      if (draft) {
        draft.rawAnswer = answer;
        flushDraft();
      }
      continue;
    }

    const option = parseOptionLine(line);
    if (option && draft && (activeType === "single" || activeType === "multiple")) {
      draft.options.push(option);
      continue;
    }

    if (
      draft &&
      (activeType === "single" || activeType === "multiple") &&
      draft.options.length > 0
    ) {
      const lastOption = draft.options[draft.options.length - 1];
      lastOption.text = appendText(lastOption.text, line);
      continue;
    }

    if (activeType === "blank") {
      const inline = splitInlineShortAnswer(line);
      if (draft && looksLikeQuestionStart(line)) {
        flushDraft();
      }
      draft = {
        type: activeType,
        stem: draft ? appendText(draft.stem, inline.stem) : inline.stem,
        options: [],
        rawAnswer: inline.answer ?? "",
      };
      if (inline.answer) {
        flushDraft();
      }
      continue;
    }

    if (!draft) {
      draft = {
        type: activeType,
        stem: cleanupStem(line),
        options: [],
        rawAnswer: "",
      };
      continue;
    }

    draft.stem = appendText(draft.stem, cleanupStem(line));
  }

  flushDraft();

  const missingAnswerIds: string[] = [];
  const unknownTypeIds: string[] = [];
  const questions = drafts.map((item, index) => {
    const id = `${ID_PREFIX}-Q${String(index + 1).padStart(4, "0")}`;
    if (!item.rawAnswer) {
      missingAnswerIds.push(id);
    }
    if (!isKnownQuestionShape(item)) {
      unknownTypeIds.push(id);
    }

    return {
      id,
      courseId: COURSE_ID,
      index: index + 1,
      type: item.type,
      stem: item.stem,
      options: item.type === "judge" || item.type === "blank" ? [] : item.options,
      answer: normalizeAnswer(item.type, item.rawAnswer),
      analysis: "",
    } satisfies Question;
  });

  return { questions, missingAnswerIds, unknownTypeIds };
}

function parseSectionHeading(line: string): QuestionType | null {
  const text = line.replace(/\s+/g, "");
  if (/^单选题$/.test(text)) {
    return "single";
  }
  if (/^多选题$/.test(text)) {
    return "multiple";
  }
  if (/^判断题$/.test(text)) {
    return "judge";
  }
  if (/^简答题$/.test(text)) {
    return "blank";
  }
  return null;
}

function parseAnswerLine(line: string): string | null {
  const match = line.match(/^(?:参考答案|正确答案|答案)\s*[:：]?\s*(.+)$/);
  return match ? match[1].trim() : null;
}

function parseOptionLine(line: string): QuestionOption | null {
  const match = line.match(/^([A-H])\s*[.．、]\s*(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    label: match[1].toUpperCase(),
    text: match[2].trim(),
  };
}

function splitInlineShortAnswer(line: string): { stem: string; answer?: string } {
  const stem = cleanupStem(line);
  const match = stem.match(/^(.*?[？?])\s*([Pp]\s*\d+(?:\s*[-~—－]\s*[Pp]?\s*\d+)?)$/);
  if (!match) {
    return { stem };
  }
  return {
    stem: cleanupStem(match[1]),
    answer: normalizePageReference(match[2]),
  };
}

function normalizeAnswer(type: QuestionType, rawAnswer: string): AnswerValue {
  if (type === "single") {
    return normalizeOptionAnswer(rawAnswer)[0] ?? rawAnswer.trim();
  }
  if (type === "multiple") {
    return normalizeOptionAnswer(rawAnswer);
  }
  if (type === "judge") {
    return normalizeJudgeAnswer(rawAnswer) ?? rawAnswer.trim();
  }
  return rawAnswer.trim() ? [normalizePageReference(rawAnswer)] : [];
}

function normalizeOptionAnswer(rawAnswer: string): string[] {
  const matches = rawAnswer.toUpperCase().match(/[A-H]/g) ?? [];
  return Array.from(new Set(matches)).sort();
}

function normalizeJudgeAnswer(rawAnswer: string): string | null {
  const text = rawAnswer.trim().toLowerCase();
  if (/^(正确|对|是|true|t|yes|y|√|✓)$/.test(text)) {
    return "正确";
  }
  if (/^(错误|错|否|false|f|no|n|×|x)$/.test(text)) {
    return "错误";
  }
  return null;
}

function isKnownQuestionShape(question: DraftQuestion): boolean {
  if (question.type === "single") {
    return question.options.length > 0 && normalizeOptionAnswer(question.rawAnswer).length === 1;
  }
  if (question.type === "multiple") {
    return question.options.length > 0 && normalizeOptionAnswer(question.rawAnswer).length > 1;
  }
  if (question.type === "judge") {
    return normalizeJudgeAnswer(question.rawAnswer) !== null;
  }
  return question.stem.length > 0 && question.rawAnswer.trim().length > 0;
}

function stripAnswerPrefix(value: string): string {
  return value.replace(/^(?:参考答案|正确答案|答案)\s*[:：]?\s*/, "").trim();
}

function cleanupStem(value: string): string {
  return value
    .replace(/^\d+\s*[.．、]\s*/, "")
    .replace(/^\d+\s+(?=\S)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function appendText(base: string, addition: string): string {
  return [base, addition.trim()].filter(Boolean).join(" ").trim();
}

function looksLikeQuestionStart(line: string): boolean {
  return /^\d+\s*[.．、]?\s*\S/.test(line) || /[？?]\s*(?:[Pp]\d+)?$/.test(line);
}

function normalizePageReference(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/[—－~]/g, "-")
    .replace(/^P/i, "p")
    .replace(/-P/i, "-p");
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