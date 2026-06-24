import type { Dispatch, SetStateAction } from "react";
import type { Course, CourseProgress, Question, ViewKey } from "../types";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES } from "../types";
import { countQuestionTypes } from "../utils/parseQuestions";

interface HomeViewProps {
  activeCourseId: string;
  courses: Course[];
  onCourseSelect: (courseId: string) => void;
  progress: CourseProgress;
  questions: Question[];
  setView: Dispatch<SetStateAction<ViewKey>>;
}

export function HomeView({
  activeCourseId,
  courses,
  onCourseSelect,
  progress,
  questions,
  setView,
}: HomeViewProps) {
  const typeCounts = countQuestionTypes(questions);
  const wrongCount = Object.values(progress.wrong).filter((item) => item.count > 0).length;
  const activeSession = progress.exams.activeSessionId
    ? progress.exams.sessions[progress.exams.activeSessionId]
    : null;

  return (
    <div className="view-stack">
      <section className="panel course-panel">
        <div className="panel-heading">
          <h2>选择课程</h2>
          <span>{courses.length} 门课</span>
        </div>
        <div className="course-grid">
          {courses.map((course) => (
            <button
              className={course.id === activeCourseId ? "course-card active-course" : "course-card"}
              key={course.id}
              onClick={() => onCourseSelect(course.id)}
              type="button"
            >
              <strong>{course.name}</strong>
              <span>{course.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="metric-card accent">
          <span>当前课程题数</span>
          <strong>{questions.length}</strong>
        </article>
        <article className="metric-card">
          <span>错题</span>
          <strong>{wrongCount}</strong>
        </article>
        <article className="metric-card">
          <span>收藏</span>
          <strong>{progress.favorites.length}</strong>
        </article>
        <article className="metric-card">
          <span>考试</span>
          <strong>{activeSession ? "进行中" : "待开始"}</strong>
        </article>
      </section>

      <section className="panel quick-panel">
        <div className="panel-heading">
          <h2>快速进入</h2>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={() => setView("practice")} type="button">
            开始练习
          </button>
          <button className="secondary-button" onClick={() => setView("exam")} type="button">
            进入考试
          </button>
          <button className="ghost-button" onClick={() => setView("wrong")} type="button">
            查看错题
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>题型分布</h2>
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
    </div>
  );
}
