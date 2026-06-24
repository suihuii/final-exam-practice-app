import { useEffect, useMemo, useState } from "react";
import { Layout } from "./components/Layout";
import { HomeView } from "./components/HomeView";
import { PracticeView } from "./components/PracticeView";
import { ExamSetupView } from "./components/ExamSetupView";
import { ExamView } from "./components/ExamView";
import { WrongBookView } from "./components/WrongBookView";
import { StatsView } from "./components/StatsView";
import { SettingsView } from "./components/SettingsView";
import questionsUrl from "./data/questions.json?url";
import type { ProgressData, Question, ViewKey } from "./types";
import { buildQuestionMap, normalizeQuestions } from "./utils/parseQuestions";
import { loadProgress } from "./utils/storage";

export default function App() {
  const [view, setView] = useState<ViewKey>("home");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [questionError, setQuestionError] = useState("");
  const [progress, setProgress] = useState<ProgressData>(() => loadProgress());
  const [examSessionVisible, setExamSessionVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(questionsUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`题库加载失败: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setQuestions(normalizeQuestions(data));
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
  }, []);

  const questionsById = useMemo(() => buildQuestionMap(questions), [questions]);
  const activeExamSession = progress.exams.activeSessionId
    ? progress.exams.sessions[progress.exams.activeSessionId]
    : null;

  useEffect(() => {
    if (!progress.exams.activeSessionId) {
      setExamSessionVisible(false);
    }
  }, [progress.exams.activeSessionId]);

  return (
    <Layout
      activeView={view}
      progress={progress}
      questionCount={questions.length}
      setView={setView}
    >
      {isLoadingQuestions ? (
        <section className="panel">
          <h2>题库加载中</h2>
          <p>正在读取本地题库 JSON。</p>
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
              progress={progress}
              questions={questions}
              setView={setView}
            />
          )}
          {view === "practice" && (
            <PracticeView
              progress={progress}
              questions={questions}
              setProgress={setProgress}
            />
          )}
          {view === "exam" &&
            (activeExamSession && examSessionVisible ? (
              <ExamView
                leaveExamSession={() => setExamSessionVisible(false)}
                progress={progress}
                questionsById={questionsById}
                setProgress={setProgress}
                setView={setView}
              />
            ) : (
              <ExamSetupView
                openExamSession={() => setExamSessionVisible(true)}
                progress={progress}
                questions={questions}
                setProgress={setProgress}
                setView={setView}
              />
            ))}
          {view === "wrong" && (
            <WrongBookView
              progress={progress}
              questions={questions}
              setProgress={setProgress}
            />
          )}
          {view === "stats" && (
            <StatsView
              progress={progress}
              questions={questions}
              questionsById={questionsById}
            />
          )}
          {view === "settings" && (
            <SettingsView progress={progress} setProgress={setProgress} />
          )}
        </>
      )}
    </Layout>
  );
}
