import fs from "node:fs";
import path from "node:path";
import type { Course, Question, QuestionType } from "../src/types";

interface CourseReport {
  courseId: string;
  courseName: string;
  original: number;
  deleted: number;
  remaining: number;
  conflicts: number;
}

interface DuplicateReport {
  courseId: string;
  type: QuestionType;
  stem: string;
  keepId: string;
  deleteIds: string[];
}

interface ConflictReport {
  courseId: string;
  type: QuestionType;
  stem: string;
  questionIds: string[];
  answers: Array<{ id: string; answer: string }>;
}

interface DifferentTypeReport {
  courseId: string;
  stem: string;
  types: Array<{ type: QuestionType; ids: string[] }>;
}

const dryRun = process.argv.includes("--dry-run");
const coursesPath = path.resolve("src/data/courses.json");
const courses = JSON.parse(stripBom(fs.readFileSync(coursesPath, "utf8"))) as Course[];

const courseReports: CourseReport[] = [];
const duplicateReports: DuplicateReport[] = [];
const conflictReports: ConflictReport[] = [];
const differentTypeReports: DifferentTypeReport[] = [];

for (const course of courses) {
  const questionPath = path.resolve("src/data", course.questionFile);
  const questions = JSON.parse(stripBom(fs.readFileSync(questionPath, "utf8"))) as Question[];
  const originalIndex = new Map(questions.map((question, index) => [question.id, index]));
  const groups = groupQuestions(course.id, questions);
  const deleteIds = new Set<string>();
  let conflictCount = 0;

  differentTypeReports.push(...findSameStemDifferentType(course.id, questions));

  for (const group of groups.values()) {
    if (group.length <= 1) {
      continue;
    }

    const answerKeys = new Set(group.map(normalizeQuestionAnswer));
    if (answerKeys.size > 1) {
      conflictCount += 1;
      conflictReports.push({
        courseId: course.id,
        type: group[0].type,
        stem: normalizeStemForDisplay(group[0].stem),
        questionIds: group.map((question) => question.id),
        answers: group.map((question) => ({ id: question.id, answer: normalizeQuestionAnswer(question) })),
      });
      continue;
    }

    const kept = [...group].sort((left, right) => {
      const scoreDiff = scoreQuestion(right) - scoreQuestion(left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0);
    })[0];
    const removed = group.filter((question) => question.id !== kept.id);

    for (const question of removed) {
      deleteIds.add(question.id);
    }

    duplicateReports.push({
      courseId: course.id,
      type: kept.type,
      stem: normalizeStemForDisplay(kept.stem),
      keepId: kept.id,
      deleteIds: removed.map((question) => question.id),
    });
  }

  const deduped = questions.filter((question) => !deleteIds.has(question.id));
  if (!dryRun) {
    fs.writeFileSync(questionPath, `${JSON.stringify(deduped, null, 2)}\n`, "utf8");
  }

  courseReports.push({
    courseId: course.id,
    courseName: course.name,
    original: questions.length,
    deleted: deleteIds.size,
    remaining: deduped.length,
    conflicts: conflictCount,
  });
}

console.log(dryRun ? "题库去重 dry-run：未修改任何文件。" : "题库去重：已写入安全去重结果。");
console.log("课程统计:");
for (const report of courseReports) {
  console.log(
    `- ${report.courseName}(${report.courseId}): 原 ${report.original} 题，删除 ${report.deleted} 题，剩余 ${report.remaining} 题，冲突 ${report.conflicts} 组。`,
  );
}

console.log(`safe duplicates: ${duplicateReports.length} 组，删除 ${duplicateReports.reduce((total, item) => total + item.deleteIds.length, 0)} 题`);
for (const report of duplicateReports) {
  console.log(
    `[safe][${report.courseId}] ${report.type} 保留 ${report.keepId}，删除 ${report.deleteIds.join(", ")}：${summarize(report.stem)}`,
  );
}

console.log(`conflicts: ${conflictReports.length} 组`);
for (const report of conflictReports) {
  console.warn(
    `[conflict][${report.courseId}] ${report.type} ${report.questionIds.join(", ")}：${summarize(report.stem)} / ${report.answers
      .map((item) => `${item.id}=${item.answer}`)
      .join(" | ")}`,
  );
}

console.log(`same stem different type: ${differentTypeReports.length} 组，仅报告不删除`);
for (const report of differentTypeReports) {
  console.log(
    `[different-type][${report.courseId}] ${summarize(report.stem)} / ${report.types
      .map((item) => `${item.type}: ${item.ids.join(", ")}`)
      .join(" | ")}`,
  );
}

function groupQuestions(courseId: string, questions: Question[]): Map<string, Question[]> {
  const groups = new Map<string, Question[]>();
  for (const question of questions) {
    const key = `${courseId}\u0000${question.type}\u0000${normalizeStem(question.stem)}`;
    const group = groups.get(key) ?? [];
    group.push(question);
    groups.set(key, group);
  }
  return groups;
}

function findSameStemDifferentType(courseId: string, questions: Question[]): DifferentTypeReport[] {
  const byStem = new Map<string, Map<QuestionType, Question[]>>();
  for (const question of questions) {
    const stemKey = normalizeStem(question.stem);
    const byType = byStem.get(stemKey) ?? new Map<QuestionType, Question[]>();
    const typedQuestions = byType.get(question.type) ?? [];
    typedQuestions.push(question);
    byType.set(question.type, typedQuestions);
    byStem.set(stemKey, byType);
  }

  const reports: DifferentTypeReport[] = [];
  for (const [stem, byType] of byStem.entries()) {
    if (byType.size <= 1) {
      continue;
    }
    reports.push({
      courseId,
      stem,
      types: [...byType.entries()].map(([type, typedQuestions]) => ({
        type,
        ids: typedQuestions.map((question) => question.id),
      })),
    });
  }
  return reports;
}

function normalizeStem(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[，、]/g, ",")
    .replace(/[。？]/g, ".")
    .replace(/[：]/g, ":")
    .replace(/[；]/g, ";")
    .replace(/[（）]/g, (match) => (match === "（" ? "(" : ")"))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStemForDisplay(value: string): string {
  return normalizeStem(value).replace(/\s+/g, " ");
}

function normalizeQuestionAnswer(question: Question): string {
  if (question.type === "multiple") {
    return JSON.stringify(normalizeOptionArray(question.answer));
  }
  if (question.type === "judge") {
    return JSON.stringify(normalizeJudge(question.answer));
  }
  if (Array.isArray(question.answer)) {
    return JSON.stringify(question.answer.map((item) => normalizeText(item)));
  }
  return JSON.stringify(normalizeText(question.answer));
}

function normalizeOptionArray(answer: Question["answer"]): string[] {
  const text = Array.isArray(answer) ? answer.join("") : answer;
  const matches = text.normalize("NFKC").toUpperCase().match(/[A-H]/g) ?? [];
  return Array.from(new Set(matches)).sort();
}

function normalizeJudge(answer: Question["answer"]): string {
  const text = normalizeText(Array.isArray(answer) ? answer.join("") : answer).toLowerCase();
  if (["正确", "对", "true", "t", "yes", "y", "√", "✓"].includes(text)) {
    return "正确";
  }
  if (["错误", "错", "false", "f", "no", "n", "×", "x"].includes(text)) {
    return "错误";
  }
  return text.includes("正确") || text.includes("对") ? "正确" : "错误";
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function scoreQuestion(question: Question): number {
  const analysisScore = (question.analysis ?? "").trim().length;
  const optionScore = question.options.reduce((total, option) => total + option.text.trim().length, 0);
  const imageScore = hasImage(question) ? 10000 : 0;
  const answerScore = Array.isArray(question.answer) ? question.answer.join(" ").length : String(question.answer).length;
  const fieldScore = Object.entries(question).filter(([, value]) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value !== null && value !== undefined && String(value).trim().length > 0;
  }).length;
  return imageScore + analysisScore * 10 + optionScore + answerScore + fieldScore;
}

function hasImage(question: Question): boolean {
  const candidate = question as Question & { images?: unknown[] };
  return typeof question.image === "string" || (Array.isArray(candidate.images) && candidate.images.length > 0);
}

function summarize(stem: string): string {
  return stem.length > 90 ? `${stem.slice(0, 90)}...` : stem;
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}
