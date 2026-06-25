import type { Dispatch, SetStateAction } from "react";
import type { Course, ProgressData } from "../types";
import { downloadTextFile } from "../utils/csv";
import {
  clearPracticeProgress,
  clearProgress,
  exportProgress,
  importProgress,
  LEGACY_PROGRESS_KEY,
  PROGRESS_KEY,
} from "../utils/storage";

interface SettingsViewProps {
  activeCourse: Course;
  progress: ProgressData;
  setProgress: Dispatch<SetStateAction<ProgressData>>;
}

export function SettingsView({ activeCourse, progress, setProgress }: SettingsViewProps) {
  function exportJson() {
    downloadTextFile(
      "progress-v2.json",
      exportProgress(progress),
      "application/json;charset=utf-8",
    );
  }

  function importJson(file: File | null) {
    if (!file) {
      return;
    }
    file
      .text()
      .then((text) => {
        const next = importProgress(text);
        setProgress(next);
        window.alert("进度已导入。");
      })
      .catch((error: unknown) => {
        window.alert(error instanceof Error ? error.message : "进度导入失败。");
      });
  }

  function clearLocalProgress() {
    if (window.confirm("确定清空本机全部课程进度吗？此操作不可恢复。")) {
      setProgress(clearProgress());
    }
  }

  function clearCurrentPracticeProgress() {
    if (window.confirm(`确定清空“${activeCourse.name}”的练习进度吗？错题、收藏和考试记录不会被删除。`)) {
      setProgress((previous) => clearPracticeProgress(previous));
    }
  }

  const rawStorage = localStorage.getItem(PROGRESS_KEY) ?? "";
  const legacyStorage = localStorage.getItem(LEGACY_PROGRESS_KEY) ?? "";
  const containsQuestionText = /stem|题干|options|analysis/.test(rawStorage);

  return (
    <div className="view-stack">
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>进度管理</h2>
          <span>当前课程：{activeCourse.name}</span>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={exportJson} type="button">
            导出进度 JSON
          </button>
          <label className="file-button">
            导入进度 JSON
            <input
              accept="application/json,.json"
              onChange={(event) => importJson(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
          <button className="ghost-button" onClick={clearCurrentPracticeProgress} type="button">
            清空当前课程练习进度
          </button>
          <button className="danger-button" onClick={clearLocalProgress} type="button">
            清空本机进度
          </button>
        </div>
      </section>

      <section className={containsQuestionText ? "panel danger-panel" : "panel success-panel"}>
        <div className="panel-heading">
          <h2>本机存储检查</h2>
          <span>{containsQuestionText ? "需检查" : "正常"}</span>
        </div>
        <p>
          {PROGRESS_KEY}：
          {rawStorage ? `${new Blob([rawStorage]).size} 字节` : "尚未写入"}
        </p>
        <p>
          {LEGACY_PROGRESS_KEY}：{legacyStorage ? "旧进度待迁移" : "无"}
        </p>
      </section>
    </div>
  );
}
