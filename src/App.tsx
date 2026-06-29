import { useEffect, useMemo, useState } from "react";
import { Layout } from "./components/Layout";
import { HomeView } from "./components/HomeView";
import { PracticeView } from "./components/PracticeView";
import { ExamSetupView } from "./components/ExamSetupView";
import { ExamView } from "./components/ExamView";
import { ExamReviewView } from "./components/ExamReviewView";
import { WrongBookView } from "./components/WrongBookView";
import { StatsView } from "./components/StatsView";
import { SettingsView } from "./components/SettingsView";
import coursesData from "./data/courses.json";
import type { Course, ExamReviewFilter, ProgressData, Question, ViewKey } from "./types";
import { buildQuestionMap, normalizeQuestions } from "./utils/parseQuestions";
import { getCourseProgress, loadProgress, setActiveCourse } from "./utils/storage";

const questionUrls = import.meta.glob("./data/questions/*.json", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const courses = coursesData as Course[];

interface ExamReviewTarget {
  courseId: string;
  filter: ExamReviewFilter;
  returnView: ViewKey;
  sessionId: string;
}

export default function App() {
  const [view, setView] = useState<ViewKey>("home");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [questionError, setQuestionError] = useState("");
  const [progress, setProgress] = useState<ProgressData>(() => loadProgress());
  const [examSessionVisible, setExamSessionVisible] = useState(false);
  const [examReviewTarget, setExamReviewTarget] = useState<ExamReviewTarget | null>(null);

  const activeCourse =
    courses.find((course) => course.id === progress.activeCourseId) ?? courses[0];
  const courseProgress = getCourseProgress(progress, activeCourse.id);
  const activeExamSession = courseProgress.exams.activeSessionId
    ? courseProgress.exams.sessions[courseProgress.exams.activeSessionId]
    : null;

  useEffect(() => {
    if (activeCourse.id !== progress.activeCourseId) {
      setProgress((previous) => setActiveCourse(previous, activeCourse.id));
    }
  }, [activeCourse.id, progress.activeCourseId]);

  useEffect(() => {
    let cancelled = false;
    const questionUrl = questionUrls[`./data/${activeCourse.questionFile}`];
    setQuestions([]);
    setQuestionError("");
    setIsLoadingQuestions(true);

    if (!questionUrl) {
      setQuestionError(`题库文件未打包: ${activeCourse.questionFile}`);
      setIsLoadingQuestions(false);
      return () => {
        cancelled = true;
      };
    }

    fetch(questionUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`题库加载失败: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setQuestions(
            normalizeQuestions(data).filter((question) => question.courseId === activeCourse.id),
          );
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setQuestionError(error instanceof Error ? error.message : "题库加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingQuestions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCourse.id, activeCourse.questionFile]);

  const questionsById = useMemo(() => buildQuestionMap(questions), [questions]);

  useEffect(() => {
    if (!courseProgress.exams.activeSessionId) {
      setExamSessionVisible(false);
    }
  }, [activeCourse.id, courseProgress.exams.activeSessionId]);

  function handleCourseSelect(courseId: string) {
    if (courseId === progress.activeCourseId) {
      return;
    }
    if (activeExamSession && !activeExamSession.submittedAt) {
      window.alert("该课程有未提交考试，可稍后继续。");
    }
    setExamReviewTarget(null);
    setExamSessionVisible(false);
    setProgress((previous) => setActiveCourse(previous, courseId));
  }

  function openExamReview(
    sessionId: string,
    filter: ExamReviewFilter,
    returnView: ViewKey,
    courseId = activeCourse.id,
  ) {
    if (courseId !== progress.activeCourseId) {
      setProgress((previous) => setActiveCourse(previous, courseId));
    }
    setExamReviewTarget({ courseId, filter, returnView, sessionId });
    setExamSessionVisible(false);
    setView("exam-review");
  }

  function closeExamReview() {
    const returnView = examReviewTarget?.returnView ?? "stats";
    setExamReviewTarget(null);
    setView(returnView);
  }

  return (
    <Layout
      activeCourse={activeCourse}
      activeView={view}
      progress={courseProgress}
      questionCount={questions.length}
      setView={setView}
    >
      {isLoadingQuestions ? (
        <section className="panel">
          <h2>题库加载中</h2>
          <p>正在读取当前课程题库 JSON。</p>
        </section>
      ) : questionError ? (
        <section className="panel danger-panel">
          <h2>题库不可用</h2>
          <p>{questionError}</p>
        </section>
      ) : (
        <>
          {view === "home" && (
            <HomeView
              activeCourseId={activeCourse.id}
              courses={courses}
              onCourseSelect={handleCourseSelect}
              progress={courseProgress}
              questions={questions}
              setView={setView}
            />
          )}
          {view === "practice" && (
            <PracticeView
              progress={courseProgress}
              questions={questions}
              setProgress={setProgress}
            />
          )}
          {view === "exam" &&
            (activeExamSession && examSessionVisible ? (
              <ExamView
                leaveExamSession={() => setExamSessionVisible(false)}
                openExamReview={(sessionId, filter) => openExamReview(sessionId, filter, "exam")}
                progress={courseProgress}
                questionsById={questionsById}
                setProgress={setProgress}
                setView={setView}
              />
            ) : (
              <ExamSetupView
                activeCourseId={activeCourse.id}
                openExamSession={() => setExamSessionVisible(true)}
                progress={courseProgress}
                questions={questions}
                setProgress={setProgress}
                setView={setView}
              />
            ))}
          {view === "wrong" && (
            <WrongBookView
              activeCourse={activeCourse}
              progress={courseProgress}
              questions={questions}
              setProgress={setProgress}
            />
          )}
          {view === "stats" && (
            <StatsView
              activeCourse={activeCourse}
              courses={courses}
              fullProgress={progress}
              onReviewExam={(sessionId, filter) => openExamReview(sessionId, filter, "stats", activeCourse.id)}
              progress={courseProgress}
              questions={questions}
              questionsById={questionsById}
            />
          )}
          {view === "exam-review" && examReviewTarget && (
            <ExamReviewView
              activeCourse={activeCourse}
              initialFilter={examReviewTarget.filter}
              onBack={closeExamReview}
              progress={courseProgress}
              questionsById={questionsById}
              sessionId={examReviewTarget.sessionId}
            />
          )}
          {view === "exam-review" && !examReviewTarget && (
            <section className="panel empty-panel">
              <h2>考试记录不存在或已被清除</h2>
              <p className="muted-text">请返回历史考试列表重新选择一条记录。</p>
              <button className="ghost-button" onClick={() => setView("stats")} type="button">
                {"\u8fd4\u56de\u7edf\u8ba1"}
              </button>
            </section>
          )}
          {view === "settings" && (
            <SettingsView
              activeCourse={activeCourse}
              progress={progress}
              setProgress={setProgress}
            />
          )}
        </>
      )}
    </Layout>
  );
}
