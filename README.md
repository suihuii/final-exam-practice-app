# 多科目期末刷题工具

Vite + React + TypeScript 实现的多科目期末刷题工具，适合在 VSCode 中开发，也可以静态部署到 Cloudflare Pages 或 GitHub Pages。手机、平板、电脑访问同一个公网网址即可使用同一套题库。

当前课程：

- 供配电系统：供电2401-2405班供配电系统期末机考题库。
- 大学美育：2025-2026-2《大学美育》期末模拟考查卷(1)(2)。

## 功能

- 首页课程卡片：可在供配电系统和大学美育之间切换。
- 练习模式：全部 / 单选 / 多选 / 判断 / 填空筛选，顺序或随机练习，只练错题，只练收藏。
- 考试模式：题量、题型、出题方式和考试时间可配置，支持暂停、退出后恢复、刷新后恢复、到时自动交卷。
- 错题本：按当前课程记录错题次数、上次错误时间、错因备注、已掌握状态，支持 CSV 导出。
- 统计页：显示当前课程统计，并提供全局课程概览。
- 设置页：导出 progress_v2 JSON、导入 progress_v2 JSON、清空本机进度。
- PWA：支持离线打开，移动设备可添加到桌面。

## 多科目目录结构

```text
src/
  data/
    courses.json
    questions/
      power-supply.json
      aesthetic-education.json
scripts/
  convert-power-supply-xls.ts
  convert-aesthetic-doc.ts
  build-courses-index.ts
raw/
  aesthetic/
    2025-2026-2《大学美育》期末模拟考查卷(1).doc
    2025-2026-2《大学美育》期末模拟考查卷(2).doc
questions.xls
```

`src/data/courses.json` 记录课程元数据：

```json
[
  {
    "id": "power-supply",
    "name": "供配电系统",
    "shortName": "供配电",
    "description": "供电2401-2405班供配电系统期末机考题库",
    "questionFile": "questions/power-supply.json"
  },
  {
    "id": "aesthetic-education",
    "name": "大学美育",
    "shortName": "美育",
    "description": "2025-2026-2《大学美育》期末模拟考查卷(1)(2)",
    "questionFile": "questions/aesthetic-education.json"
  }
]
```

题目 id 全局唯一：供配电使用 `PS-Q0001`，大学美育使用 `AE-P1-Q0001`、`AE-P2-Q0001`。

## 本地开发

```bash
npm install
npm.cmd run convert
npm.cmd run dev
```

构建检查：

```bash
npm.cmd run build
npm.cmd run preview
```

VSCode 中可以直接运行 `.vscode/tasks.json` 里的任务。

## 题库转换

统一转换命令：

```bash
npm.cmd run convert
```

该命令会依次执行：

```bash
npm run convert:power
npm run convert:aesthetic
tsx scripts/build-courses-index.ts
```

### 供配电 Excel 转换

原始文件：`questions.xls`

脚本：`scripts/convert-power-supply-xls.ts`

输出：`src/data/questions/power-supply.json`

要求保持 500 题，题目自动增加：

- `courseId: "power-supply"`
- `id: "PS-Q0001"` 等

### 大学美育 Word/HTML doc 转换

原始文件：

- `raw/aesthetic/2025-2026-2《大学美育》期末模拟考查卷(1).doc`
- `raw/aesthetic/2025-2026-2《大学美育》期末模拟考查卷(2).doc`

脚本：`scripts/convert-aesthetic-doc.ts`

输出：`src/data/questions/aesthetic-education.json`

这两个 `.doc` 是 Word 导出的 HTML。脚本会读取 Buffer，检测 HTML meta charset；`gb2312/gbk` 按 `gb18030` 解码，UTF-8 也可处理。HTML 标签会先转换成换行文本，再解析题号、选项、正确答案和解析。

大学美育两套卷属于同一门课，不是两门课。`paperId` 分别为 `AE-P1`、`AE-P2`。

### 课程索引校验

`scripts/build-courses-index.ts` 会检查：

- `courses.json` 存在。
- 每个课程的 `questionFile` 存在。
- 每门课题目数大于 0。
- 所有题目 id 全局唯一。
- 所有题目 `courseId` 与 `courses.json` 一致。

## 如何新增一门课程

1. 添加原始题库文件到 `raw/<course-id>/` 或项目根目录。
2. 新增一个转换脚本，输出到 `src/data/questions/<course-id>.json`。
3. 每题必须包含 `id`、`courseId`、`index`、`type`、`stem`、`options`、`answer`、`analysis`。
4. 在 `src/data/courses.json` 中添加课程记录。
5. 在 `package.json` 中新增转换脚本，并把它接入 `convert`。
6. 运行 `npm.cmd run convert` 和 `npm.cmd run build`。

## progress_v2 进度设计

浏览器本机只保存最小进度，键名为 `progress_v2`。题库 JSON 和学习进度分离，localStorage 不保存完整题干列表。

结构：

```json
{
  "version": 2,
  "activeCourseId": "power-supply",
  "courses": {
    "power-supply": {
      "wrong": {},
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
    },
    "aesthetic-education": {
      "wrong": {},
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
  }
}
```

旧版 `progress_v1` 会自动迁移到 `progress_v2` 的 `power-supply` 课程下。每门课的错题、收藏、练习状态和考试记录互相隔离。

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

## GitHub Pages 部署

项目提供 `.github/workflows/deploy.yml`。push 到 `main` 后会自动 build 并部署。

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
git status --short
npm.cmd run convert
npm.cmd run build
```

需要检查：

- `src/data/courses.json` 存在。
- `src/data/questions/power-supply.json` 为 500 题。
- `src/data/questions/aesthetic-education.json` 为两个 doc 解析出的总题数。
- 首页能选择供配电系统和大学美育。
- 切换课程后，练习页题目变成对应课程。
- 两门课错题本互不影响。
- 两门课考试记录互不影响。
- `localStorage.progress_v2` 中没有完整题库文本。
- `npm.cmd run build` 成功。
