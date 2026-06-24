import type { Dispatch, SetStateAction } from "react";
import type { ProgressData } from "../types";
import { downloadTextFile } from "../utils/csv";
import {
  clearProgress,
  exportProgress,
  importProgress,
  PROGRESS_KEY,
} from "../utils/storage";

interface SettingsViewProps {
  progress: ProgressData;
  setProgress: Dispatch<SetStateAction<ProgressData>>;
}

export function SettingsView({ progress, setProgress }: SettingsViewProps) {
  function exportJson() {
    downloadTextFile(
      "progress.json",
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
    if (window.confirm("确定清空本机进度吗？此操作不可恢复。")) {
      setProgress(clearProgress());
    }
  }

  const rawStorage = localStorage.getItem(PROGRESS_KEY) ?? "";
  const containsQuestionText = /stem|题干|options|analysis/.test(rawStorage);

  return (
    <div className="view-stack">
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>进度管理</h2>
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
      </section>
    </div>
  );
}
