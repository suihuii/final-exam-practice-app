import { useMemo } from "react";
import type { Course, CourseProgress, ProgressData, Question } from "../types";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES } from "../types";
import { gradeExam } from "../utils/exam";
import { countQuestionTypes } from "../utils/parseQuestions";
import { getCourseProgress } from "../utils/storage";

interface StatsViewProps {
  activeCourse: Course;
  courses: Course[];
  fullProgress: ProgressData;
  progress: CourseProgress;
  questions: Question[];
  questionsById: Map<string, Question>;
}

export function StatsView({
  activeCourse,
  courses,
  fullProgress,
  progress,
  questions,
  questionsById,
}: StatsViewProps) {
  const typeCounts = countQuestionTypes(questions);
  const wrongRecords = Object.values(progress.wrong).filter((record) => record.count > 0);
  const masteredCount = wrongRecords.filter((record) => record.mastered).length;
  const examHistory = useMemo(
    () =>
      Object.values(progress.exams.sessions)
        .filter((session) => Boolean(session.submittedAt))
        .sort((left, right) => {
          const leftTime = new Date(left.submittedAt ?? 0).getTime();
          const rightTime = new Date(right.submittedAt ?? 0).getTime();
          return rightTime - leftTime;
        }),
    [progress.exams.sessions],
  );
  const latestExam = examHistory[0] ?? null;

  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-heading">
          <h2>课程概览</h2>
          <span>当前：{activeCourse.shortName}</span>
        </div>
        <div className="course-overview-grid">
          {courses.map((course) => {
            const courseProgress = getCourseProgress(fullProgress, course.id);
            const submittedCount = Object.values(courseProgress.exams.sessions).filter((session) => session.submittedAt).length;
            const wrongCount = Object.values(courseProgress.wrong).filter((record) => record.count > 0).length;
            return (
              <article className="compact-card" key={course.id}>
                <strong>{course.name}</strong>
                <p>错题 {wrongCount} · 收藏 {courseProgress.favorites.length} · 考试 {submittedCount}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="metric-card accent">
          <span>当前课程题数</span>
          <strong>{questions.length}</strong>
        </article>
        <article className="metric-card">
          <span>错题数量</span>
          <strong>{wrongRecords.length}</strong>
        </article>
        <article className="metric-card">
          <span>收藏数量</span>
          <strong>{progress.favorites.length}</strong>
        </article>
        <article className="metric-card">
          <span>已掌握</span>
          <strong>{masteredCount}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>各题型数量</h2>
        </div>
        <div className="type-grid">
          {QUESTION_TYPES.map((type) => (
            <div className="type-pill" key={type}>
              <span>{QUESTION_TYPE_LABEL[type]}</span>
              <strong>{typeCounts[type]}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>最近一次考试</h2>
        </div>
        {latestExam ? (
          <div className="latest-exam">
            <strong>{latestExam.score ?? gradeExam(latestExam, questionsById).score} 分</strong>
            <span>{new Date(latestExam.submittedAt ?? "").toLocaleString()}</span>
          </div>
        ) : (
          <p className="muted-text">当前课程暂无已提交考试。</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>历史考试</h2>
          <span>{examHistory.length} 次</span>
        </div>
        <div className="card-list">
          {examHistory.length === 0 ? (
            <p className="muted-text">提交当前课程考试后会显示记录。</p>
          ) : (
            examHistory.map((session) => {
              const grade = gradeExam(session, questionsById);
              return (
                <article className="compact-card" key={session.id}>
                  <strong>{session.score ?? grade.score} 分</strong>
                  <p>
                    正确 {grade.correct} · 错误 {grade.wrong} · 未答 {grade.unanswered}
                  </p>
                  <p>{new Date(session.submittedAt ?? "").toLocaleString()}</p>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
