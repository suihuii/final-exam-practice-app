import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Course, Question, QuestionOption, QuestionType } from "../src/types";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

type CsvRow = Record<string, unknown>;

type ImportedQuestion = Question & {
  sourceGroup: string;
  sourceId: string;
  sourceIndex: string;
};

type CheckStatus = "PASS" | "FAIL";

interface VerifyCheck {
  detail?: string;
  name: string;
  status: CheckStatus;
}

const COURSE_ID = "photovoltaic-operations";
const COURSE: Course = {
  id: COURSE_ID,
  name: "光伏电站运行与维护",
  shortName: "光伏运维",
  description: "学习通光伏电站运行、生产管理、设备故障与安全运维题库。",
  questionFile: "questions/photovoltaic-operations.json",
};

const EXPECTED_COUNTS: Record<QuestionType | "total", number> = {
  total: 210,
  single: 78,
  multiple: 58,
  judge: 64,
  blank: 10,
};

const SAMPLE_SEED = 20260702;
const inputDir = path.resolve("raw/photovoltaic-operations");
const csvPath = path.join(inputDir, "学习通光伏题库_审核清理版.csv");
const deletionReportPath = path.join(inputDir, "学习通光伏题库_删除与疑似重复报告.csv");
const outputPath = path.resolve("src/data/questions/photovoltaic-operations.json");
const coursesPath = path.resolve("src/data/courses.json");
const verifyReportPath = path.join(inputDir, "import_verify_report.md");
const sampleReportPath = path.join(inputDir, "random_sample_review.md");

main();

function main() {
  assertFileExists(csvPath);
  assertFileExists(deletionReportPath);

  const rows = readCsvRows(csvPath);
  const activeRows = rows.filter((row) => !isDeleted(row.deleted));
  const questions = activeRows.map((row, index) => parseQuestion(row, index + 1));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(questions, null, 2)}\n`, "utf8");
  ensureCourse();

  const checks = verifyImport();
  fs.writeFileSync(verifyReportPath, buildVerifyReport(checks), "utf8");
  fs.writeFileSync(sampleReportPath, buildSampleReport(readQuestions()), "utf8");

  const failed = checks.filter((check) => check.status === "FAIL");
  if (failed.length > 0) {
    throw new Error(`光伏题库导入校验失败: ${failed.map((check) => check.name).join(", ")}`);
  }

  const counts = countTypes(questions);
  console.log(`课程: ${COURSE.name}(${COURSE.id})`);
  console.log(`题库文件: ${path.relative(process.cwd(), outputPath)}`);
  console.log(`总题数: ${questions.length}`);
  console.log(`单选数量: ${counts.single}`);
  console.log(`多选数量: ${counts.multiple}`);
  console.log(`判断数量: ${counts.judge}`);
  console.log(`填空/简答数量: ${counts.blank}`);
  console.log(`校验报告: ${path.relative(process.cwd(), verifyReportPath)}`);
  console.log(`抽查报告: ${path.relative(process.cwd(), sampleReportPath)}`);
}

function readCsvRows(filePath: string): CsvRow[] {
  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<CsvRow>(sheet, { defval: "", raw: false });
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [stripBom(key), value]),
    ),
  );
}

function parseQuestion(row: CsvRow, index: number): ImportedQuestion {
  const type = normalizeType(row.finalType, row.finalTypeCn, row.originalType);
  const sourceIndex = cell(row.sourceIndex);
  const sourceId = cell(row.id);
  const sourceGroup = cell(row.sourceGroup);
  const originalOrder = originalOrderFor(sourceIndex);
  const options = type === "single" || type === "multiple" ? parseOptions(row) : [];
  const answer = parseAnswer(type, row.answer);
  const analysis = buildAnalysis(row);

  if (!sourceIndex) {
    throw new Error(`第 ${index} 行缺少 sourceIndex。`);
  }

  return {
    id: questionIdFor(type, sourceIndex),
    courseId: COURSE_ID,
    paperId: "PVOPS-BANK",
    paperIndex: originalOrder,
    index,
    type,
    stem: cleanupText(cell(row.stem)),
    options,
    answer,
    analysis,
    sourceIndex,
    sourceId,
    sourceGroup,
  };
}

function normalizeType(...values: unknown[]): QuestionType {
  const text = values.map(cell).find((value) => value.trim()) ?? "";
  if (/\bsingle\b/i.test(text) || text.includes("单选题")) {
    return "single";
  }
  if (/\bmultiple\b/i.test(text) || text.includes("多选题")) {
    return "multiple";
  }
  if (/\bjudge\b/i.test(text) || text.includes("判断题")) {
    return "judge";
  }
  if (/\bblank\b/i.test(text) || text.includes("简答题") || text.includes("解答题")) {
    return "blank";
  }
  throw new Error(`无法识别题型: ${text}`);
}

function parseOptions(row: CsvRow): QuestionOption[] {
  return ["A", "B", "C", "D", "E", "F", "G"]
    .map((label) => ({
      label,
      text: cleanupText(cell(row[`option${label}`])),
    }))
    .filter((option) => option.text.length > 0);
}

function parseAnswer(type: QuestionType, value: unknown): string {
  if (type === "judge") {
    return parseJudgeAnswer(value);
  }
  if (type === "blank") {
    return cell(value);
  }

  const answer = optionLetters(value).join("");
  if (type === "single" && !/^[A-G]$/.test(answer)) {
    throw new Error(`单选题答案必须是单个大写字母，实际为: ${cell(value)}`);
  }
  if (type === "multiple" && !/^[A-G]{2,}$/.test(answer)) {
    throw new Error(`多选题答案必须是连续大写字母且至少 2 个，实际为: ${cell(value)}`);
  }
  return answer;
}

function optionLetters(value: unknown): string[] {
  return cell(value).toUpperCase().match(/[A-G]/g) ?? [];
}

function parseJudgeAnswer(value: unknown): "正确" | "错误" {
  const text = cell(value).trim().toLowerCase();
  if (["正确", "对", "true", "t", "yes", "y", "√", "✓"].includes(text)) {
    return "正确";
  }
  if (["错误", "错", "false", "f", "no", "n", "×", "x"].includes(text)) {
    return "错误";
  }
  throw new Error(`判断题答案无法转换为正确/错误: ${cell(value)}`);
}

function buildAnalysis(row: CsvRow): string {
  const parts: string[] = [];
  const analysis = cell(row.analysis).trim();
  const note = cell(row.note).trim();

  if (analysis) {
    parts.push(analysis);
  }
  if (note) {
    parts.push(`审核备注：${note}`);
  }

  return parts.join("\n");
}

function questionIdFor(type: QuestionType, sourceIndex: string): string {
  const prefix: Record<QuestionType, string> = {
    single: "S",
    multiple: "M",
    judge: "J",
    blank: "B",
  };
  return `PVOPS-${prefix[type]}${String(originalOrderFor(sourceIndex)).padStart(4, "0")}`;
}

function originalOrderFor(sourceIndex: string): number {
  const numeric = Number(sourceIndex);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }

  const shortAnswerMatch = sourceIndex.match(/^SA-(\d+)$/i);
  if (shortAnswerMatch) {
    return 201 + Number(shortAnswerMatch[1]);
  }

  throw new Error(`无法将 sourceIndex 转换为稳定序号: ${sourceIndex}`);
}

function ensureCourse() {
  assertFileExists(coursesPath);
  const courses = JSON.parse(stripBom(fs.readFileSync(coursesPath, "utf8"))) as Course[];
  if (!Array.isArray(courses)) {
    throw new Error("src/data/courses.json 必须是数组。");
  }

  const conflict = courses.find(
    (course) =>
      course.id !== COURSE_ID &&
      (course.name === COURSE.name ||
        course.shortName === COURSE.shortName ||
        course.name.includes("光伏") ||
        course.shortName.includes("光伏")),
  );
  if (conflict) {
    throw new Error(`发现疑似重复课程: ${conflict.id} / ${conflict.name}`);
  }

  const existingIndex = courses.findIndex((course) => course.id === COURSE_ID);
  if (existingIndex >= 0) {
    courses[existingIndex] = COURSE;
  } else {
    courses.push(COURSE);
  }

  fs.writeFileSync(coursesPath, `${JSON.stringify(courses, null, 2)}\n`, "utf8");
}

function verifyImport(): VerifyCheck[] {
  const checks: VerifyCheck[] = [];
  const questions = readQuestions();
  const counts = countTypes(questions);
  const jsonText = fs.readFileSync(outputPath, "utf8");
  const ids = questions.map((question) => question.id);
  const idSet = new Set(ids);
  const sourceIndexes = new Set(questions.map((question) => String(question.sourceIndex)));
  const courses = JSON.parse(stripBom(fs.readFileSync(coursesPath, "utf8"))) as Course[];
  const courseMatches = courses.filter((course) => course.id === COURSE_ID || course.name === COURSE.name);
  const q30 = questions.find((question) => question.sourceIndex === "30");
  const blanks = questions.filter((question) => question.type === "blank");

  checks.push(pass("JSON 是否能被解析", Array.isArray(questions), `${questions.length} records`));
  checks.push(pass("总题数是否为 210", questions.length === EXPECTED_COUNTS.total, String(questions.length)));
  checks.push(pass("single 是否为 78", counts.single === EXPECTED_COUNTS.single, String(counts.single)));
  checks.push(pass("multiple 是否为 58", counts.multiple === EXPECTED_COUNTS.multiple, String(counts.multiple)));
  checks.push(pass("judge 是否为 64", counts.judge === EXPECTED_COUNTS.judge, String(counts.judge)));
  checks.push(pass("blank 是否为 10", counts.blank === EXPECTED_COUNTS.blank, String(counts.blank)));
  checks.push(pass("ID 是否唯一", ids.length === idSet.size, `${idSet.size}/${ids.length}`));
  checks.push(pass("是否有空题干", questions.every((question) => question.stem.trim()), emptyIds(questions, "stem")));
  checks.push(pass("是否有空答案", questions.every((question) => hasAnswer(question.answer)), emptyIds(questions, "answer")));
  checks.push(pass("single 答案是否只有 1 个字母", questions.filter((question) => question.type === "single").every((question) => /^[A-G]$/.test(answerText(question.answer))), ""));
  checks.push(pass("multiple 答案是否至少 2 个字母", questions.filter((question) => question.type === "multiple").every((question) => /^[A-G]{2,}$/.test(answerText(question.answer))), ""));
  checks.push(pass("multiple 答案字符是否都能对应到选项", multipleAnswersMatchOptions(questions), ""));
  checks.push(pass("judge 答案是否符合项目现有格式", questions.filter((question) => question.type === "judge").every((question) => question.answer === "正确" || question.answer === "错误"), "正确/错误"));
  checks.push(pass("blank 答案是否为非空长文本", blanks.every((question) => answerText(question.answer).trim().length >= 10), `blank=${blanks.length}`));
  checks.push(pass("是否包含完整学习通 URL", !containsChaoxingUrl(jsonText), ""));
  checks.push(pass("是否包含敏感参数字段或字符串", !containsSensitiveToken(jsonText), ""));
  checks.push(pass("第 30 题是否 multiple + AB", q30?.type === "multiple" && q30.answer === "AB", q30 ? `${q30.type} ${answerText(q30.answer)}` : "missing"));
  checks.push(pass("第 99 题是否不存在", !sourceIndexes.has("99") && !/PVOPS-[SMJB]0099/.test(jsonText), ""));
  checks.push(pass("10 道简答题是否存在", blanks.length === 10, String(blanks.length)));
  checks.push(pass("courses.json 是否正确加入新课程，且没有重复课程", courseMatches.length === 1 && courseMatches[0]?.questionFile === COURSE.questionFile, `${courseMatches.length} match`));

  return checks;
}

function readQuestions(): ImportedQuestion[] {
  return JSON.parse(stripBom(fs.readFileSync(outputPath, "utf8"))) as ImportedQuestion[];
}

function buildVerifyReport(checks: VerifyCheck[]): string {
  const status = checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL";
  const questions = readQuestions();
  const counts = countTypes(questions);
  const lines = [
    "# 光伏题库导入校验报告",
    "",
    `- 校验结果：${status}`,
    `- 导入源：${path.relative(process.cwd(), csvPath)}`,
    `- 输出题库：${path.relative(process.cwd(), outputPath)}`,
    `- 总题数：${questions.length}`,
    `- 题型统计：single ${counts.single} / multiple ${counts.multiple} / judge ${counts.judge} / blank ${counts.blank}`,
    "",
    "## 检查项",
    "",
    "| 状态 | 检查项 | 详情 |",
    "| --- | --- | --- |",
    ...checks.map((check) => `| ${check.status} | ${escapeTable(check.name)} | ${escapeTable(check.detail ?? "")} |`),
    "",
    "## 关键题",
    "",
    keyLine(questions, "1"),
    keyLine(questions, "30"),
    keyLine(questions, "51"),
    "第 99 题：审核清理版 CSV 中未出现 sourceIndex=99，未进入最终题库。",
    keyLine(questions, "138"),
    keyLine(questions, "201"),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function buildSampleReport(questions: ImportedQuestion[]): string {
  const fixedSourceIndexes = ["1", "30", "51", "138", "201", "SA-01", "SA-10"];
  const selected = new Map<string, ImportedQuestion>();
  for (const sourceIndex of fixedSourceIndexes) {
    const question = questions.find((item) => item.sourceIndex === sourceIndex);
    if (question) {
      selected.set(question.id, question);
    }
  }

  const random = seededShuffle(questions, SAMPLE_SEED);
  for (const question of random) {
    if (selected.size >= 20) {
      break;
    }
    selected.set(question.id, question);
  }

  const sample = [...selected.values()].sort((left, right) => left.index - right.index);
  const lines = [
    "# 光伏题库随机抽查报告",
    "",
    `- 固定随机种子：${SAMPLE_SEED}`,
    "- 本次抽查用于验证导入格式和关键题处理，不代表全量答案均为官方确认答案。",
    "- 第 99 题删除说明：审核清理版 CSV 中未出现 sourceIndex=99，未进入最终题库；删除依据保留在删除与疑似重复报告中。",
    "",
  ];

  sample.forEach((question, index) => {
    lines.push(`## ${index + 1}. ${question.id}`);
    lines.push("");
    lines.push(`- sourceIndex: ${question.sourceIndex}`);
    lines.push(`- type: ${question.type}`);
    lines.push(`- stem: ${question.stem}`);
    lines.push(`- options: ${formatOptions(question.options)}`);
    lines.push(`- answer: ${answerText(question.answer)}`);
    lines.push(`- analysis/note 摘要: ${summarize(question.analysis) || "无"}`);
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

function pass(name: string, condition: boolean, detail?: string): VerifyCheck {
  return {
    name,
    status: condition ? "PASS" : "FAIL",
    detail,
  };
}

function countTypes(questions: Pick<Question, "type">[]): Record<QuestionType, number> {
  return questions.reduce(
    (counts, question) => {
      counts[question.type] += 1;
      return counts;
    },
    { single: 0, multiple: 0, judge: 0, blank: 0 },
  );
}

function multipleAnswersMatchOptions(questions: ImportedQuestion[]): boolean {
  return questions
    .filter((question) => question.type === "multiple")
    .every((question) => {
      const labels = new Set(question.options.map((option) => option.label));
      return answerText(question.answer).split("").every((letter) => labels.has(letter));
    });
}

function hasAnswer(answer: Question["answer"]): boolean {
  return answerText(answer).trim().length > 0;
}

function answerText(answer: Question["answer"]): string {
  return Array.isArray(answer) ? answer.join("") : answer;
}

function emptyIds(questions: ImportedQuestion[], field: "answer" | "stem"): string {
  return questions
    .filter((question) => (field === "stem" ? !question.stem.trim() : !hasAnswer(question.answer)))
    .map((question) => question.id)
    .join(", ");
}

function containsChaoxingUrl(text: string): boolean {
  return /https?:\/\/[^\s"]*(chaoxing|xuexitong)|mooc1\.chaoxing\.com/i.test(text);
}

function containsSensitiveToken(text: string): boolean {
  return [
    ["course", "Id="].join(""),
    ["class", "Id="].join(""),
    ["c", "pi="].join(""),
    ["work", "Id="].join(""),
    ["answer", "Id="].join(""),
    ["e", "nc="].join(""),
    ["standard", "Enc="].join(""),
  ].some((token) => text.includes(token));
}

function keyLine(questions: ImportedQuestion[], sourceIndex: string): string {
  const question = questions.find((item) => item.sourceIndex === sourceIndex);
  if (!question) {
    return `第 ${sourceIndex} 题：未找到。`;
  }
  return `第 ${sourceIndex} 题：${question.id} / ${question.type} / 答案 ${answerText(question.answer)}。`;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  let state = seed >>> 0;
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    state = (1664525 * state + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function formatOptions(options: QuestionOption[]): string {
  if (options.length === 0) {
    return "无";
  }
  return options.map((option) => `${option.label}. ${option.text}`).join("；");
}

function summarize(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 160 ? `${compact.slice(0, 160)}...` : compact;
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function isDeleted(value: unknown): boolean {
  const text = cell(value).trim().toLowerCase();
  return ["是", "true", "1", "yes", "y"].includes(text);
}

function cleanupText(value: string): string {
  return value.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function cell(value: unknown): string {
  return String(value ?? "").replace(/^\uFEFF/, "");
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

function assertFileExists(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
}
