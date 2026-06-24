import fs from "node:fs";
import path from "node:path";
import type { Course, Question } from "../src/types";

const coursesPath = path.resolve("src/data/courses.json");

if (!fs.existsSync(coursesPath)) {
  throw new Error("src/data/courses.json 不存在。");
}

const courses = JSON.parse(stripBom(fs.readFileSync(coursesPath, "utf8"))) as Course[];
const allIds = new Set<string>();

for (const course of courses) {
  const questionPath = path.resolve("src/data", course.questionFile);
  if (!fs.existsSync(questionPath)) {
    throw new Error(`${course.id} 的题库文件不存在: ${course.questionFile}`);
  }

  const questions = JSON.parse(stripBom(fs.readFileSync(questionPath, "utf8"))) as Question[];
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error(`${course.id} 的题目数必须大于 0。`);
  }

  for (const question of questions) {
    if (allIds.has(question.id)) {
      throw new Error(`题目 id 全局重复: ${question.id}`);
    }
    allIds.add(question.id);

    if (question.courseId !== course.id) {
      throw new Error(`${question.id} 的 courseId=${question.courseId} 与 courses.json 的 ${course.id} 不一致。`);
    }
  }

  console.log(`${course.name}: ${questions.length} 题`);
}

console.log(`课程数: ${courses.length}`);
console.log(`题目总数: ${allIds.size}`);

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

