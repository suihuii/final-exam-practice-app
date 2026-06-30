import fs from "node:fs";
import path from "node:path";
import type { AnswerValue, Course, Question, QuestionType } from "../src/types";

interface CourseReport {
  courseId: string;
  courseName: string;
  original: number;
  deleted: number;
  remaining: number;
  safeDuplicateGroups: number;
  sameStemDifferentType: number;
  sameStemSameTypeDifferentOptions: number;
  sameStemSameTypeDifferentAnswer: number;
  imageMismatchDuplicates: number;
}

interface SafeDuplicateReport {
  courseId: string;
  type: QuestionType;
  stem: string;
  keepId: string;
  deleteIds: string[];
}

interface DifferentTypeReport {
  courseId: string;
  stem: string;
  types: Array<{ type: QuestionType; ids: string[] }>;
}

interface DifferentOptionsReport {
  courseId: string;
  type: QuestionType;
  stem: string;
  variants: Array<{ ids: string[]; options: string }>;
}

interface DifferentAnswerReport {
  courseId: string;
  type: QuestionType;
  stem: string;
  variants: Array<{ ids: string[]; answer: string }>;
}

interface ImageMismatchReport {
  courseId: string;
  type: QuestionType;
  stem: string;
  variants: Array<{ ids: string[]; image: string }>;
}

const dryRun = process.argv.includes("--dry-run");
const coursesPath = path.resolve("src/data/courses.json");
const courses = JSON.parse(stripBom(fs.readFileSync(coursesPath, "utf8"))) as Course[];

const courseReports: CourseReport[] = [];
const safeDuplicateReports: SafeDuplicateReport[] = [];
const differentTypeReports: DifferentTypeReport[] = [];
const differentOptionsReports: DifferentOptionsReport[] = [];
const differentAnswerReports: DifferentAnswerReport[] = [];
const imageMismatchReports: ImageMismatchReport[] = [];

for (const course of courses) {
  const questionPath = path.resolve("src/data", course.questionFile);
  const questions = JSON.parse(stripBom(fs.readFileSync(questionPath, "utf8"))) as Question[];
  const originalIndex = new Map(questions.map((question, index) => [question.id, index]));
  const deleteIds = new Set<string>();

  const courseDifferentTypes = findSameStemDifferentType(course.id, questions);
  const courseDifferentOptions = findSameStemSameTypeDifferentOptions(course.id, questions);
  const courseDifferentAnswers = findSameStemSameTypeDifferentAnswer(course.id, questions);
  const courseImageMismatches = findImageMismatchDuplicates(course.id, questions);

  differentTypeReports.push(...courseDifferentTypes);
  differentOptionsReports.push(...courseDifferentOptions);
  differentAnswerReports.push(...courseDifferentAnswers);
  imageMismatchReports.push(...courseImageMismatches);

  const safeGroups = groupSafeDuplicates(course.id, questions);
  for (const group of safeGroups.values()) {
    if (group.length <= 1) {
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

    safeDuplicateReports.push({
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
    safeDuplicateGroups: [...safeGroups.values()].filter((group) => group.length > 1).length,
    sameStemDifferentType: courseDifferentTypes.length,
    sameStemSameTypeDifferentOptions: courseDifferentOptions.length,
    sameStemSameTypeDifferentAnswer: courseDifferentAnswers.length,
    imageMismatchDuplicates: courseImageMismatches.length,
  });
}

console.log(dryRun ? "题库去重 dry-run：未修改任何文件。" : "题库去重：已写入安全去重结果。");
console.log("课程统计:");
for (const report of courseReports) {
  console.log(
    `- ${report.courseName}(${report.courseId}): 原 ${report.original} 题，删除 ${report.deleted} 题，剩余 ${report.remaining} 题；safe duplicate ${report.safeDuplicateGroups} 组；same stem different type ${report.sameStemDifferentType} 组；different options ${report.sameStemSameTypeDifferentOptions} 组；different answer ${report.sameStemSameTypeDifferentAnswer} 组；image mismatch ${report.imageMismatchDuplicates} 组。`,
  );
}

const deletedCount = safeDuplicateReports.reduce((total, item) => total + item.deleteIds.length, 0);
console.log(`safe duplicates: ${safeDuplicateReports.length} 组，删除 ${deletedCount} 题`);
for (const report of safeDuplicateReports) {
  console.log(
    `[safe][${report.courseId}] ${report.type} 保留 ${report.keepId}，删除 ${report.deleteIds.join(", ")}：${summarize(report.stem)}`,
  );
}

console.log(`same stem different type: ${differentTypeReports.length} 组，全部保留`);
for (const report of differentTypeReports) {
  console.log(
    `[different-type][${report.courseId}] ${summarize(report.stem)} / ${report.types
      .map((item) => `${item.type}: ${item.ids.join(", ")}`)
      .join(" | ")}`,
  );
}

console.log(`same stem same type different options: ${differentOptionsReports.length} 组，全部保留`);
for (const report of differentOptionsReports) {
  console.warn(
    `[different-options][${report.courseId}] ${report.type} ${summarize(report.stem)} / ${report.variants
      .map((item) => `${item.ids.join(", ")}=${summarize(item.options)}`)
      .join(" | ")}`,
  );
}

console.log(`same stem same type different answer: ${differentAnswerReports.length} 组，全部保留`);
for (const report of differentAnswerReports) {
  console.warn(
    `[different-answer][${report.courseId}] ${report.type} ${summarize(report.stem)} / ${report.variants
      .map((item) => `${item.ids.join(", ")}=${item.answer}`)
      .join(" | ")}`,
  );
}

console.log(`image mismatch duplicates: ${imageMismatchReports.length} 组，全部保留`);
for (const report of imageMismatchReports) {
  console.warn(
    `[image-mismatch][${report.courseId}] ${report.type} ${summarize(report.stem)} / ${report.variants
      .map((item) => `${item.ids.join(", ")}=${item.image}`)
      .join(" | ")}`,
  );
}

function groupSafeDuplicates(courseId: string, questions: Question[]): Map<string, Question[]> {
  const groups = new Map<string, Question[]>();
  for (const question of questions) {
    const key = [
      courseId,
      question.type,
      normalizeStem(question.stem),
      normalizeQuestionOptions(question),
      normalizeQuestionAnswer(question),
      normalizeQuestionImage(question),
    ].join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), question]);
  }
  return groups;
}

function findSameStemDifferentType(courseId: string, questions: Question[]): DifferentTypeReport[] {
  const byStem = new Map<string, Map<QuestionType, Question[]>>();
  for (const question of questions) {
    const stemKey = normalizeStem(question.stem);
    const byType = byStem.get(stemKey) ?? new Map<QuestionType, Question[]>();
    byType.set(question.type, [...(byType.get(question.type) ?? []), question]);
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

function findSameStemSameTypeDifferentOptions(courseId: string, questions: Question[]): DifferentOptionsReport[] {
  const reports: DifferentOptionsReport[] = [];
  for (const group of sameStemSameTypeGroups(courseId, questions).values()) {
    const variants = groupByVariant(group, normalizeQuestionOptions);
    if (variants.length <= 1) {
      continue;
    }
    reports.push({
      courseId,
      type: group[0].type,
      stem: normalizeStemForDisplay(group[0].stem),
      variants: variants.map((variant) => ({
        ids: variant.questions.map((question) => question.id),
        options: variant.variant,
      })),
    });
  }
  return reports;
}

function findSameStemSameTypeDifferentAnswer(courseId: string, questions: Question[]): DifferentAnswerReport[] {
  const reports: DifferentAnswerReport[] = [];
  for (const group of sameStemSameTypeGroups(courseId, questions).values()) {
    const variants = groupByVariant(group, normalizeQuestionAnswer);
    if (variants.length <= 1) {
      continue;
    }
    reports.push({
      courseId,
      type: group[0].type,
      stem: normalizeStemForDisplay(group[0].stem),
      variants: variants.map((variant) => ({
        ids: variant.questions.map((question) => question.id),
        answer: variant.variant,
      })),
    });
  }
  return reports;
}

function findImageMismatchDuplicates(courseId: string, questions: Question[]): ImageMismatchReport[] {
  const bySafeWithoutImage = new Map<string, Question[]>();
  for (const question of questions) {
    const key = [
      courseId,
      question.type,
      normalizeStem(question.stem),
      normalizeQuestionOptions(question),
      normalizeQuestionAnswer(question),
    ].join("\u0000");
    bySafeWithoutImage.set(key, [...(bySafeWithoutImage.get(key) ?? []), question]);
  }

  const reports: ImageMismatchReport[] = [];
  for (const group of bySafeWithoutImage.values()) {
    const variants = groupByVariant(group, normalizeQuestionImage);
    if (variants.length <= 1) {
      continue;
    }
    reports.push({
      courseId,
      type: group[0].type,
      stem: normalizeStemForDisplay(group[0].stem),
      variants: variants.map((variant) => ({
        ids: variant.questions.map((question) => question.id),
        image: variant.variant,
      })),
    });
  }
  return reports;
}

function sameStemSameTypeGroups(courseId: string, questions: Question[]): Map<string, Question[]> {
  const groups = new Map<string, Question[]>();
  for (const question of questions) {
    const key = [courseId, question.type, normalizeStem(question.stem)].join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), question]);
  }
  return new Map([...groups.entries()].filter(([, group]) => group.length > 1));
}

function groupByVariant(
  questions: Question[],
  variantFor: (question: Question) => string,
): Array<{ variant: string; questions: Question[] }> {
  const byVariant = new Map<string, Question[]>();
  for (const question of questions) {
    const variant = variantFor(question);
    byVariant.set(variant, [...(byVariant.get(variant) ?? []), question]);
  }
  return [...byVariant.entries()].map(([variant, variantQuestions]) => ({
    variant,
    questions: variantQuestions,
  }));
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

function normalizeQuestionOptions(question: Question): string {
  return JSON.stringify(
    question.options.map((option) => ({
      label: option.label.normalize("NFKC").trim().toUpperCase(),
      text: normalizeText(option.text),
    })),
  );
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

function normalizeQuestionImage(question: Question): string {
  const image = question.image?.trim();
  if (!image) {
    return "<no-image>";
  }
  return JSON.stringify({
    image: normalizeText(image),
    imageAlt: normalizeText(question.imageAlt ?? ""),
  });
}

function normalizeOptionArray(answer: AnswerValue): string[] {
  const text = Array.isArray(answer) ? answer.join("") : answer;
  const matches = text.normalize("NFKC").toUpperCase().match(/[A-H]/g) ?? [];
  return Array.from(new Set(matches)).sort();
}

function normalizeJudge(answer: AnswerValue): string {
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
  const imageScore = question.image ? 10000 : 0;
  const answerScore = Array.isArray(question.answer) ? question.answer.join(" ").length : String(question.answer).length;
  const fieldScore = Object.entries(question).filter(([, value]) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value !== null && value !== undefined && String(value).trim().length > 0;
  }).length;
  return imageScore + analysisScore * 10 + optionScore + answerScore + fieldScore;
}

function summarize(value: string): string {
  return value.length > 90 ? `${value.slice(0, 90)}...` : value;
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}
