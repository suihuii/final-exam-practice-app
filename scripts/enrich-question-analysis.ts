import fs from "node:fs";
import path from "node:path";
import type { Course, Question } from "../src/types";

interface CourseAnalysisReport {
  courseId: string;
  courseName: string;
  updated: number;
  unresolved: string[];
}

const coursesPath = path.resolve("src/data/courses.json");
const courses = JSON.parse(stripBom(fs.readFileSync(coursesPath, "utf8"))) as Course[];
const reports: CourseAnalysisReport[] = [];

for (const course of courses) {
  const questionPath = path.resolve("src/data", course.questionFile);
  const questions = JSON.parse(stripBom(fs.readFileSync(questionPath, "utf8"))) as Question[];
  let updated = 0;
  const unresolved: string[] = [];

  const enriched = questions.map((question) => {
    if (hasUsefulAnalysis(question.analysis)) {
      return question;
    }

    const analysis = buildAnalysis(question);
    if (!analysis.startsWith("暂无可靠解析")) {
      updated += 1;
    } else {
      unresolved.push(question.id);
    }
    return {
      ...question,
      analysis,
    } satisfies Question;
  });

  fs.writeFileSync(questionPath, `${JSON.stringify(enriched, null, 2)}\n`, "utf8");
  reports.push({ courseId: course.id, courseName: course.name, updated, unresolved });
}

console.log("解析/答题思路补充结果:");
for (const report of reports) {
  console.log(
    `${report.courseName}(${report.courseId}): 补充 ${report.updated} 题，仍缺可靠解析 ${report.unresolved.length} 题。`,
  );
  if (report.unresolved.length > 0) {
    console.warn(`仍缺可靠解析: ${report.unresolved.join(", ")}`);
  }
}

function buildAnalysis(question: Question): string {
  if (!hasAnswer(question.answer)) {
    return "暂无可靠解析，建议对照教材复习。";
  }

  if (question.type === "single" || question.type === "multiple") {
    if (question.options.length === 0) {
      return "暂无可靠解析，建议对照教材复习。";
    }
    const labels = answerLabels(question.answer);
    const correctOptions = question.options.filter((option) => labels.includes(option.label));
    if (correctOptions.length === 0) {
      return "暂无可靠解析，建议对照教材复习。";
    }
    const wrongOptions = question.options.filter((option) => !labels.includes(option.label));
    const typeText = question.type === "single" ? "单选题" : "多选题";
    return [
      `答题思路：本题是${typeText}，题干关键点是“${summarizeStem(question.stem)}”。标准答案为 ${labels.join("、")}，对应选项内容：${correctOptions.map(formatOption).join("；")}。`,
      wrongOptions.length > 0
        ? `其他选项未被标准答案选中，通常是概念范围、适用条件、作用对象或表述方向与题干不一致。复习时重点区分：${wrongOptions.slice(0, 3).map(formatOption).join("；")}。`
        : "本题没有其他干扰项，复习时直接记住标准答案对应的关键词。",
      `记忆点：${buildKeywordHint(question.stem, correctOptions.map((option) => option.text).join(" "))}`,
    ].join("\n");
  }

  if (question.type === "judge") {
    const answer = normalizeJudge(question.answer);
    return [
      `答题思路：本题为判断题，标准答案是“${answer}”。判断时先抓住题干中的限定词、对象和结论，再与教材中的定义、作用或运行要求对照。`,
      answer === "正确"
        ? "题干表述与标准结论一致，复习时重点记住题干中的关键词。"
        : "题干表述与标准结论不一致，复习时要找出其中过于绝对、对象混淆或条件错误的部分。",
      `记忆点：${buildKeywordHint(question.stem, answer)}`,
    ].join("\n");
  }

  const answerText = Array.isArray(question.answer) ? question.answer.join("；") : question.answer;
  return [
    `答题思路：本题需要围绕题干“${summarizeStem(question.stem)}”组织答案。`,
    `参考答案要点：${answerText}`,
    `背诵关键词：${buildKeywordHint(question.stem, answerText)}`,
  ].join("\n");
}

function hasUsefulAnalysis(value: string | undefined): boolean {
  const text = value?.trim() ?? "";
  if (text.length < 8) {
    return false;
  }
  return !/^p\d+(\s*-\s*p?\d+)?$/i.test(text);
}

function hasAnswer(answer: Question["answer"]): boolean {
  if (Array.isArray(answer)) {
    return answer.some((item) => item.trim().length > 0);
  }
  return answer.trim().length > 0;
}

function answerLabels(answer: Question["answer"]): string[] {
  const text = Array.isArray(answer) ? answer.join("") : answer;
  return Array.from(new Set(text.toUpperCase().match(/[A-H]/g) ?? [])).sort();
}

function normalizeJudge(answer: Question["answer"]): string {
  const text = (Array.isArray(answer) ? answer.join("") : answer).trim().toLowerCase();
  if (["正确", "对", "true", "t", "yes", "y", "√", "✓"].includes(text)) {
    return "正确";
  }
  if (["错误", "错", "false", "f", "no", "n", "×", "x"].includes(text)) {
    return "错误";
  }
  return text.includes("正确") || text.includes("对") ? "正确" : "错误";
}

function formatOption(option: Question["options"][number]): string {
  return `${option.label}. ${option.text}`;
}

function summarizeStem(stem: string): string {
  return stem.replace(/\s+/g, " ").trim().slice(0, 80);
}

function buildKeywordHint(stem: string, answerText: string): string {
  const text = `${stem} ${answerText}`
    .replace(/[（）()，。；;：:、？?！!《》“”"'\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const keywords = Array.from(new Set(text.split(" ").filter((word) => word.length >= 2))).slice(0, 6);
  return keywords.length > 0 ? keywords.join("、") : "题干关键词与标准答案。";
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}
