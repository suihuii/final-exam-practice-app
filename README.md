# 供配电系统期末机考练习工具

Vite + React + TypeScript 实现的期末机考练习工具，适合在 VSCode 中开发，也可以静态部署到 Cloudflare Pages 或 GitHub Pages。手机、平板、电脑访问同一个公网网址即可使用同一套题库。

## 功能

- 练习模式：全部 / 单选 / 多选 / 判断 / 填空筛选，顺序或随机练习，只练错题，只练收藏。
- 考试模式：题量、题型、出题方式和考试时间可配置，支持暂停、退出后恢复、刷新后恢复、到时自动交卷。
- 错题本：自动记录错题次数、上次错误时间、错因备注、已掌握状态，支持 CSV 导出。
- 统计页：总题数、各题型数量、错题数量、收藏数量、已掌握错题数量、最近考试和历史考试。
- 设置页：导出进度 JSON、导入进度 JSON、清空本机进度。
- PWA：支持离线打开，移动设备可添加到桌面。

## 项目结构

```text
src/
  App.tsx
  main.tsx
  types.ts
  data/
    questions.json
  utils/
    parseQuestions.ts
    storage.ts
    exam.ts
    csv.ts
  components/
    Layout.tsx
    HomeView.tsx
    PracticeView.tsx
    ExamSetupView.tsx
    ExamView.tsx
    WrongBookView.tsx
    StatsView.tsx
    SettingsView.tsx
scripts/
  convert-xls.ts
public/
  manifest.webmanifest
  sw.js
  icon.svg
.vscode/
  settings.json
  extensions.json
  tasks.json
.github/workflows/
  deploy.yml
questions.xls
README.md
vite.config.ts
package.json
```

## 本地开发

```bash
npm install
npm run convert
npm run dev
```

构建检查：

```bash
npm run build
npm run preview
```

VSCode 中可以直接运行 `.vscode/tasks.json` 里的任务：`npm install`、`npm run convert`、`npm run dev`、`npm run build`、`npm run preview`。

## 题库转换

原始题库文件为 `questions.xls`。转换脚本会读取 Excel，自动跳过前面的模板示例，从实际连续题号区域开始识别正式题目，并生成 `src/data/questions.json`。

```bash
npm run convert
```

转换后终端会输出：

- 总题数
- 单选数量
- 多选数量
- 判断数量
- 填空数量
- 前 3 题预览

如果解析结果不是 500 题，脚本会输出警告。题目 id 使用 `Q0001` 到 `Q0500` 的格式。

## localStorage 设计

浏览器本机只保存最小进度，键名为 `progress_v1`。题库 JSON 和学习进度分离，localStorage 不保存完整题干列表。

进度结构：

```json
{
  "version": 1,
  "wrong": {
    "Q0001": {
      "count": 1,
      "lastWrongAt": "2026-06-23T00:00:00.000Z",
      "note": "",
      "mastered": false
    }
  },
  "favorites": [],
  "practice": {
    "lastQuestionId": null,
    "mode": "normal",
    "filterTypes": []
  },
  "exams": {
    "activeSessionId": null,
    "sessions": {}
  }
}
```

## 多设备使用说明

1. 电脑、手机、平板访问同一个公网网址即可使用同一套题库。
2. 当前版本没有账号系统，所以学习进度默认保存在各自设备浏览器中。
3. 需要迁移进度时，在旧设备导出 progress JSON，在新设备导入。
4. 如果要自动同步进度，下一阶段需要接 Supabase/Firebase/自建后端，这不属于当前版本。
5. 不要为了期末复习过早做账号系统。

## PWA 添加到桌面

Android Chrome：打开部署后的公网网址，点击浏览器菜单，选择“添加到主屏幕”或“安装应用”。

iPad / iPhone Safari：打开部署后的公网网址，点击分享按钮，选择“添加到主屏幕”。

首次在线打开后，应用会缓存页面外壳、JS、CSS、题库 JSON 和图标。之后可离线打开已缓存版本。

## Cloudflare Pages 部署

1. 将代码推送到 GitHub。
2. 在 Cloudflare Pages 新建项目。
3. 连接 GitHub 仓库。
4. Framework preset 选择 `Vite`。
5. Build command 填写：`npm run build`。
6. Build output directory 填写：`dist`。
7. 部署完成后得到公网网址。
8. 手机和平板直接打开公网网址使用。

如果更新了 Excel 题库，请先在本地运行 `npm run convert` 并提交更新后的 `src/data/questions.json`。

## GitHub Pages 部署

项目已提供 `.github/workflows/deploy.yml`。push 到 `main` 后会自动 build 并部署。

GitHub 仓库设置：

1. 打开仓库 `Settings`。
2. 进入 `Pages`。
3. Source 选择 `GitHub Actions`。
4. 推送到 `main`。
5. Actions 成功后，在 Pages 页面查看网址。

GitHub Pages 通常部署在仓库子路径。workflow 中已设置：

```yaml
VITE_BASE: /${{ github.event.repository.name }}/
```

如果使用自定义域名或根路径部署，可以将 `VITE_BASE` 改为 `/`。

## 验收清单

```bash
npm install
npm run convert
npm run build
```

需要检查：

- `src/data/questions.json` 是否为 500 题。
- 各题型数量是否符合 Excel 题库。
- `localStorage.progress_v1` 中没有完整题库和题干列表。
- 考试开始后退出页面，再进入考试页可以继续。
- 暂停后题目被遮住，不能继续看题。
- 刷新页面后考试仍能恢复，计时使用 `startedAt`、`pausedAt`、`elapsedSeconds` 计算。
- 360px 宽度没有横向滚动。
- PWA manifest 和 service worker 生效。
- Cloudflare Pages 和 GitHub Pages 部署说明完整。
