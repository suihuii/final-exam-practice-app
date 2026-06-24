import fs from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";
import { decode as decodeEntities } from "html-entities";
import type { AnswerValue, Question, QuestionOption, QuestionType } from "../src/types";

interface ParsedPaper {
  fileName: string;
  paperId: string;
  questions: Question[];
  missingAnswerIds: string[];
  unknownTypeIds: string[];
}

interface QuestionBlock {
  paperIndex: number;
  localIndex: number;
  stem: string;
  options: QuestionOption[];
  rawAnswer: string;
  analysis: string;
}

const COURSE_ID = "aesthetic-education";
const inputDir = path.resolve("raw/aesthetic");
const outputPath = path.resolve("src/data/questions/aesthetic-education.json");
const files = fs
  .readdirSync(inputDir)
  .filter((file) => file.toLowerCase().endsWith(".doc"))
  .sort((left, right) => left.localeCompare(right, "zh-CN"));

if (files.length === 0) {
  throw new Error("raw/aesthetic 目录下没有 .doc 文件。");
}

const papers = files.map((fileName) => parsePaper(fileName));
let globalIndex = 1;
const questions = papers.flatMap((paper) =>
  paper.questions.map((question) => ({
    ...question,
    index: globalIndex++,
  })),
);
const counts = countTypes(questions);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");

for (const paper of papers) {
  console.log(`${paper.fileName}: ${paper.questions.length} 题`);
  if (paper.missingAnswerIds.length > 0) {
    console.warn(`警告: ${paper.fileName} 以下题目没有答案: ${paper.missingAnswerIds.join(", ")}`);
  }
  if (paper.unknownTypeIds.length > 0) {
    console.warn(`警告: ${paper.fileName} 以下题目无法识别题型: ${paper.unknownTypeIds.join(", ")}`);
  }
}
console.log(`合并总题数: ${questions.length}`);
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
      paperId: question.paperId,
      index: question.index,
      paperIndex: question.paperIndex,
      type: question.type,
      stem: question.stem.slice(0, 100),
      answer: question.answer,
    })),
    null,
    2,
  ),
);

function parsePaper(fileName: string): ParsedPaper {
  const paperId = paperIdFromFileName(fileName);
  const fullPath = path.join(inputDir, fileName);
  const html = decodeDocument(fs.readFileSync(fullPath));
  const lines = htmlToLines(html);
  const blocks = splitQuestionBlocks(lines);
  const missingAnswerIds: string[] = [];
  const unknownTypeIds: string[] = [];

  const validBlocks = blocks.filter((block) => !isInlineAnsweredFragment(block));

  const questions = validBlocks.map((block, blockIndex) => {
    const localQuestionIndex = blockIndex + 1;
    const id = `${paperId}-Q${String(localQuestionIndex).padStart(4, "0")}`;
    if (!block.rawAnswer) {
      missingAnswerIds.push(id);
    }
    const type = inferType(block.options, block.rawAnswer);
    if (!type) {
      unknownTypeIds.push(id);
    }
    return {
      id,
      courseId: COURSE_ID,
      paperId,
      index: 0,
      paperIndex: block.paperIndex,
      type: type ?? "blank",
      stem: block.stem,
      options: type === "judge" || type === "blank" ? [] : block.options,
      answer: normalizeAnswer(type ?? "blank", block.rawAnswer),
      analysis: block.analysis,
    } satisfies Question;
  });

  return { fileName, paperId, questions, missingAnswerIds, unknownTypeIds };
}

function decodeDocument(buffer: Buffer): string {
  const asciiHead = buffer.subarray(0, 4096).toString("latin1");
  const utf8Head = buffer.subarray(0, 4096).toString("utf8");
  const charset =
    asciiHead.match(/charset\s*=\s*["']?([^\s"'>;]+)/i)?.[1] ??
    utf8Head.match(/charset\s*=\s*["']?([^\s"'>;]+)/i)?.[1] ??
    "utf-8";

  if (/gb2312|gbk|gb18030/i.test(charset)) {
    return iconv.decode(buffer, "gb18030");
  }
  return iconv.decode(buffer, "utf8");
}

function htmlToLines(html: string): string[] {
  return decodeEntities(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<\/?(p|div|br|tr|td|li|h\d|table|section|article|body|html)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitQuestionBlocks(lines: string[]): QuestionBlock[] {
  const questionStarts = lines.flatMap((line, lineIndex) => {
    const match = line.match(/^\s*(\d+)[、.．]\s*(.+)$/);
    if (!match || /^(单选题|多选题|判断题|填空题|问答题)/.test(match[2].trim())) {
      return [];
    }
    return [{ line, lineIndex, match }];
  });
  const blocks: QuestionBlock[] = [];

  questionStarts.forEach((start, startIndex) => {
    const endLineIndex = questionStarts[startIndex + 1]?.lineIndex ?? lines.length;
    const blockLines = lines.slice(start.lineIndex + 1, endLineIndex);
    blocks.push(parseBlock(Number(start.match[1]), startIndex + 1, start.match[2], blockLines));
  });

  return blocks;
}

function parseBlock(
  paperIndex: number,
  localIndex: number,
  rawStem: string,
  lines: string[],
): QuestionBlock {
  const options: QuestionOption[] = [];
  let rawAnswer = "";
  let analysis = "";
  let stem = cleanupStem(rawStem);
  let activeField: "stem" | "option" | "answer" | "analysis" = "stem";

  for (const line of lines) {
    if (isSectionHeading(line)) {
      continue;
    }

    const optionMatch = line.match(/^\s*([A-H])[、.．]\s*(.+)$/i);
    if (optionMatch) {
      options.push({ label: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() });
      activeField = "option";
      continue;
    }

    const answerMatch = line.match(/^\s*正确答案[:：]\s*(.+)$/);
    if (answerMatch) {
      rawAnswer = answerMatch[1].trim();
      activeField = "answer";
      continue;
    }

    const analysisMatch = line.match(/^\s*解析[:：]\s*(.+)$/);
    if (analysisMatch) {
      analysis = analysisMatch[1].trim();
      activeField = "analysis";
      continue;
    }

    if (activeField === "analysis") {
      analysis = appendText(analysis, line);
    } else if (activeField === "option" && options.length > 0) {
      const last = options[options.length - 1];
      last.text = appendText(last.text, line);
    } else if (activeField === "answer") {
      rawAnswer = appendText(rawAnswer, line);
    } else {
      stem = appendText(stem, cleanupStem(line));
    }
  }

  return { paperIndex, localIndex, stem, options, rawAnswer, analysis };
}

function isInlineAnsweredFragment(block: QuestionBlock): boolean {
  return !block.rawAnswer && /^[\s\S]*[（(]\s*[×√✓]\s*[)）]/.test(block.stem);
}

function isSectionHeading(line: string): boolean {
  return /^(?:[一二三四五六七八九十]+[、.．]\s*)?(?:单选题|多选题|判断题|填空题|问答题)/.test(line.trim()) || /^\d+[.．]\s*(?:单选题|多选题|判断题|填空题|问答题)/.test(line.trim());
}

function inferType(options: QuestionOption[], rawAnswer: string): QuestionType | null {
  const optionAnswers = normalizeOptionAnswer(rawAnswer);
  const judgeAnswer = normalizeJudgeAnswer(rawAnswer);
  if (options.length > 0 && optionAnswers.length === 1) {
    return "single";
  }
  if (options.length > 0 && optionAnswers.length > 1) {
    return "multiple";
  }
  if (options.length === 0 && judgeAnswer) {
    return "judge";
  }
  if (options.length === 0 && rawAnswer.trim()) {
    return "blank";
  }
  return null;
}

function normalizeAnswer(type: QuestionType, rawAnswer: string): AnswerValue {
  if (type === "single") {
    return normalizeOptionAnswer(rawAnswer)[0] ?? rawAnswer.trim();
  }
  if (type === "multiple") {
    return normalizeOptionAnswer(rawAnswer);
  }
  if (type === "judge") {
    return normalizeJudgeAnswer(rawAnswer) ?? "错误";
  }
  return rawAnswer.trim() ? [rawAnswer.trim()] : [];
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

function paperIdFromFileName(fileName: string): string {
  const match = fileName.match(/考查卷\((\d+)\)/);
  const paperNumber = match?.[1] ?? "1";
  return `AE-P${paperNumber}`;
}

function cleanupStem(value: string): string {
  return value.replace(/\s*[（(]\s*\d+(?:\.\d+)?\s*[)）]\s*$/g, "").replace(/\s+/g, " ").trim();
}

function appendText(base: string, addition: string): string {
  return [base, addition.trim()].filter(Boolean).join(" ").trim();
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




