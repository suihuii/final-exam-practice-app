import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { ProgressData, ViewKey } from "../types";

interface LayoutProps {
  activeView: ViewKey;
  children: ReactNode;
  progress: ProgressData;
  questionCount: number;
  setView: Dispatch<SetStateAction<ViewKey>>;
}

const navItems: Array<{ key: ViewKey; label: string }> = [
  { key: "home", label: "首页" },
  { key: "practice", label: "练习" },
  { key: "exam", label: "考试" },
  { key: "wrong", label: "错题" },
  { key: "stats", label: "统计" },
  { key: "settings", label: "设置" },
];

export function Layout({
  activeView,
  children,
  progress,
  questionCount,
  setView,
}: LayoutProps) {
  const activeSession = progress.exams.activeSessionId
    ? progress.exams.sessions[progress.exams.activeSessionId]
    : null;
  const hasActiveExam = Boolean(activeSession && !activeSession.submittedAt);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>供配电系统期末机考练习工具</h1>
          <p>{questionCount} 题 · 本机进度</p>
        </div>
        {hasActiveExam && (
          <button className="ghost-button compact" onClick={() => setView("exam")}>
            继续考试
          </button>
        )}
      </header>
      <main className="app-main">{children}</main>
      <nav className="bottom-nav" aria-label="主导航">
        {navItems.map((item) => (
          <button
            className={item.key === activeView ? "active" : ""}
            key={item.key}
            onClick={() => setView(item.key)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
