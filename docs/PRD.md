# Claude Workspace for Atom：完整产品需求文档

**文档版本：** 0.1  
**状态：** MVP 已完成，下一阶段需求规划中  
**产品组织：** TOPY-AI-LTD  
**目标仓库：** `TOPY-AI-LTD/TOPY-AI-Atom-Workplace`  
**目标平台：** Atom 1.60+  
**最后更新：** 2026-08-11

---

## 1. 产品概述

### 1.1 产品名称

**Claude Workspace for Atom**

### 1.2 一句话定义

一个在 Atom 内集中管理项目、Claude Code CLI 会话、本地开发服务器和前端预览的开发工作区插件。

### 1.3 产品愿景

让开发者从“打开项目、打开终端、启动 Claude、启动 dev server、切换浏览器”这一组分散动作，转变为一个连续工作流：

```text
选择项目 → 启动 Claude → 启动开发服务器 → 查看输出 → 预览页面 → 继续迭代
```

插件不替代 Atom 的编辑能力，也不替代 Claude Code 的授权和安全机制，而是将这些工具组织在同一个本地工作区中。

### 1.4 当前 MVP 状态

当前仓库已经包含一个可加载的 Atom package MVP，支持：

- 注册和选择本地项目目录；
- 将项目目录加入 Atom；
- 启动 Claude Code 的非交互式检查任务；
- 启动和停止 `npm run dev`、`pnpm dev`、`yarn dev`；
- 在 Atom 面板显示 Claude 和 dev server 输出；
- 识别常见 localhost 地址并在预览区域加载；
- 解析并按项目保存 Claude `session_id`，从会话选择器恢复 session；
- 按项目隔离 Claude/dev server 进程，并支持停止当前项目进程；
- 限制工作区日志长度，避免长时间运行导致面板无限增长；
- 通过 Atom 菜单、命令面板和快捷键操作。

以下能力属于规划中功能，目前不能视为已完成：

- 完整交互式 Claude 终端；
- 自动创建项目模板；
- 多项目并行运行和独立进程状态管理；
- 稳定的框架识别和端口健康检查；
- 自动化测试与持续集成。

---

## 2. 用户与使用场景

### 2.1 主要用户

#### 用户 A：AI 辅助前端开发者

使用 Next.js、React、TypeScript、Vite 等技术栈，希望在编辑器内使用 Claude Code，并立即查看修改后的页面。

#### 用户 B：项目管理者/产品工程师

同时维护多个本地项目，希望快速切换项目、启动对应开发环境，并保留每个项目的工作上下文。

#### 用户 C：学习和原型开发者

不希望频繁使用终端命令，希望通过简单按钮完成项目打开、AI 询问和网页预览。

### 2.2 核心使用场景

#### 场景 1：打开已有项目

1. 用户打开 Atom。
2. 用户运行 `Claude Workspace: Select Project`。
3. 用户选择本地项目目录。
4. 插件将项目加入项目列表，并通过 `atom.project.addPath()` 打开项目。
5. 用户可以启动 Claude 或 dev server。

#### 场景 2：开始新的 Claude Code 工作

1. 用户选择一个项目。
2. 用户点击 `Start Claude`。
3. 插件在该项目目录中启动 Claude Code。
4. Claude 检查项目结构、技术栈和启动方式。
5. 输出流显示在 Atom 面板中。

#### 场景 3：启动 Next.js/前端开发服务器

1. 用户选择项目。
2. 用户点击 `Start dev`。
3. 插件根据 lockfile 选择 npm、pnpm 或 yarn。
4. 插件在项目目录中执行对应的 dev 命令。
5. 插件解析输出中的 localhost 地址。
6. 用户点击 `Preview`，在 Atom 中查看页面。

#### 场景 4：切换项目

1. 用户在 Claude Workspace 面板中选择另一个项目。
2. 当前项目状态保留在本地配置中。
3. Atom 打开新项目目录。
4. 用户可以启动新项目的 Claude session 和 dev server。

#### 场景 5：停止开发服务器

1. 用户点击 `Stop dev`。
2. 插件向对应子进程发送终止信号。
3. 面板显示退出状态。

---

## 3. 产品目标与成功指标

### 3.1 MVP 目标

- 用一个 Atom 面板承载项目和开发流程入口。
- 能在正确的项目目录中启动 Claude Code。
- 能启动和停止常见前端开发服务器。
- 能将本地服务地址传递到预览区域。
- 不绕过 Claude Code 权限提示，不保存 Claude 认证信息。

### 3.2 后续版本目标

- 让每个项目拥有可恢复的 Claude session。
- 支持真正的交互式终端体验。
- 支持多个项目和多个进程同时运行。
- 提供稳定的项目状态、错误提示和日志管理。
- 让用户无需记忆项目启动命令即可开始工作。

### 3.3 成功指标

| 指标 | MVP 目标 | 后续目标 |
|---|---:|---:|
| 从打开项目到启动 dev server 的操作步骤 | 不超过 4 步 | 不超过 2 步 |
| 项目选择成功率 | ≥ 95% | ≥ 99% |
| 常见 npm/pnpm/yarn 项目启动成功率 | ≥ 90% | ≥ 98% |
| Claude 输出可见延迟 | ≤ 2 秒 | ≤ 500 毫秒 |
| localhost 预览打开成功率 | ≥ 90% | ≥ 98% |
| 未授权执行危险命令 | 0 | 0 |

---

## 4. 产品范围

### 4.1 MVP 范围内

- Atom package 基础结构；
- 项目目录选择和注册；
- 项目列表；
- 当前项目切换；
- Claude Code 非交互式调用；
- Claude 输出显示；
- npm/pnpm/yarn dev server 管理；
- dev server 输出显示；
- localhost 地址识别；
- 内嵌预览区域；
- Atom 菜单、命令和快捷键；
- README、PRD 和基本安装说明。

### 4.2 MVP 不包含

- Claude API 直接集成；
- 自己实现 Claude 身份认证；
- 自动批准 Claude 权限请求；
- `--dangerously-skip-permissions`；
- 远程服务器部署；
- 云端项目同步；
- 多用户账户；
- 对项目代码的自动上传；
- 生产环境发布；
- 完整 IDE 替代功能。

### 4.3 后续版本范围

- session 历史和恢复；
- 交互式终端；
- 任务队列；
- 项目模板；
- Git 状态和分支操作；
- 浏览器控制台和网络日志；
- dev server 健康检查；
- 项目级配置文件；
- 自动化测试和发布流程。

---

## 5. 功能需求

### FR-001：项目注册

用户必须能够选择本地目录并将其注册为 Claude Workspace 项目。

**要求：**

- 支持选择任意存在的本地目录；
- 项目名称默认使用目录名；
- 项目 ID 根据目录路径生成稳定标识；
- 注册后将目录加入 Atom 项目；
- 项目配置持久化到 Atom 配置目录。

### FR-002：新建项目入口

用户必须能够通过 `New Project` 选择一个目录作为新的工作目录。

**MVP 行为：**

- 选择目录；
- 创建目录（若系统允许且目录不存在）；
- 注册项目；
- 将项目加入 Atom。

**后续行为：**

- 选择模板；
- 初始化 Next.js/React/TypeScript 项目；
- 安装依赖；
- 初始化 Git；
- 自动创建 Claude 初始 session。

### FR-003：项目列表

面板必须显示已注册项目，并允许用户切换当前项目。

**项目字段：**

- 项目名称；
- 本地路径；
- 当前状态；
- dev server 地址；
- 最近使用时间；
- Claude session 数量。

### FR-004：启动 Claude Code

用户必须能够在当前项目目录中启动 Claude Code。

**MVP 命令：**

```bash
claude -p \
  --output-format stream-json \
  --verbose \
  "Inspect this project. Explain the stack and how to start the local development server."
```

**要求：**

- 工作目录必须是当前项目目录；
- 使用 `spawn()` 启动子进程；
- 标准输出和错误输出都必须显示；
- 子进程退出时显示退出码；
- Claude 不得以跳过权限的模式启动；
- Claude 凭证不得由插件读取或保存。

### FR-005：Claude session 管理

插件必须支持按项目保存和恢复 Claude session 生命周期。

**目标能力：**

- 创建 session；
- 读取并保存 `session_id`；
- 显示 session 历史；
- 恢复指定 session；
- 继续当前项目最近一次 session；
- 删除本地 session 索引但不删除 Claude 原始凭证或历史。

**目标命令：**

```bash
claude -p --resume SESSION_ID "继续处理上一个任务"
```

**数据原则：**

- 仅保存 session ID、项目路径、时间和用户可见标题；
- 不保存认证 token；
- 不把完整对话默认上传到 TOPY 服务；
- 用户删除项目记录时，可以选择是否删除本地 session 索引。

**当前实现：**

- 解析 Claude `stream-json` 顶层 `session_id`；
- 按项目保存 session ID、标题和时间；
- 在工作区会话选择器中恢复指定 session；
- 恢复失败时保留原 session 记录。

### FR-006：启动开发服务器

用户必须能够从面板启动当前项目的本地开发服务器。

**命令选择规则：**

| 检测文件 | 命令 |
|---|---|
| `pnpm-lock.yaml` | `pnpm dev` |
| `yarn.lock` | `yarn dev` |
| `package-lock.json` 或无 lockfile | `npm run dev` |

**要求：**

- 子进程工作目录必须是当前项目目录；
- 显示 stdout 和 stderr；
- 支持停止进程；
- 防止同一项目重复启动多个 MVP dev server；
- 显示进程退出状态；
- 不应因为无法解析 URL 而隐藏原始日志。

### FR-007：开发服务器地址识别

插件必须从 dev server 输出中识别以下形式的地址：

```text
http://localhost:3000
http://127.0.0.1:3000
localhost:3000
```

后续版本必须增加：

- Next.js、Vite、Astro、Nuxt 等框架适配；
- 从 `package.json` 和配置文件读取端口；
- HTTP 健康检查；
- 端口占用检测；
- server 启动超时提示。

### FR-008：Atom 内预览

用户必须能够点击 `Preview` 打开当前 dev server 地址。

**MVP：**

- 在 Workspace 面板中显示 iframe；
- 默认使用识别到的 URL；
- 未识别 URL 时使用项目配置端口，默认 `3000`；
- 页面加载失败时保留 dev server 日志。

**后续：**

- 独立 Atom pane；
- 刷新按钮；
- 打开系统浏览器按钮；
- 浏览器控制台；
- 网络错误查看；
- 移动端/桌面端尺寸预览。

### FR-009：输出日志

面板必须能够区分：

- Claude 输出；
- 开发服务器输出；
- 插件错误；
- 进程退出状态。

后续版本需要支持清空、复制、导出和按来源过滤日志。

### FR-010：Atom 命令和快捷键

必须注册以下命令：

| 命令 | 作用 |
|---|---|
| `claude-workspace:toggle` | 显示/隐藏工作区 |
| `claude-workspace:select-project` | 选择项目 |
| `claude-workspace:new-project` | 新建项目入口 |
| `claude-workspace:start-session` | 启动 Claude |
| `claude-workspace:start-dev-server` | 启动 dev server |
| `claude-workspace:stop-dev-server` | 停止 dev server |
| `claude-workspace:open-preview` | 打开预览 |

默认快捷键：

| 快捷键 | 命令 |
|---|---|
| `Ctrl+Alt+C` | Toggle Workspace |
| `Ctrl+Alt+D` | Start Dev Server |
| `Ctrl+Alt+P` | Open Preview |

---

## 6. 用户界面需求

### 6.1 工作区布局

```text
┌──────────────────────────────────────────────────────────────┐
│ Project selector | New project | Start Claude | Start dev ... │
├───────────────────────────────┬──────────────────────────────┤
│ Claude / dev server output     │ Local preview                │
│                               │                              │
│                               │                              │
└───────────────────────────────┴──────────────────────────────┘
```

### 6.2 顶部工具栏

工具栏至少包含：

- 项目下拉选择框；
- `New project`；
- `Start Claude`；
- `Start dev`；
- `Stop dev`；
- `Preview`。

按钮状态应根据当前项目和进程状态更新。例如，未选择项目时，启动按钮应禁用或给出明确提示。

### 6.3 状态表达

项目状态至少包括：

- `No project selected`；
- `Ready`；
- `Claude running`；
- `Dev server starting`；
- `Dev server running`；
- `Stopped`；
- `Error`。

### 6.4 错误提示

错误提示必须说明：

1. 哪个操作失败；
2. 失败原因或原始错误；
3. 用户下一步可以做什么。

示例：

```text
无法启动 Claude Code。
原因：找不到 claude 命令。
建议：确认 Claude Code 已安装，并且 claude 位于 PATH 中。
```

---

## 7. 数据模型与持久化

### 7.1 配置文件位置

```text
<Atom config directory>/claude-workspace.json
```

Linux 默认位置通常为：

```text
~/.atom/claude-workspace.json
```

### 7.2 MVP 数据结构

```json
{
  "projects": [
    {
      "id": "my-project",
      "name": "my-project",
      "path": "/absolute/path/to/my-project",
      "devPort": 3000,
      "claudeSessions": []
    }
  ],
  "activeProjectId": "my-project"
}
```

### 7.3 目标数据结构

```json
{
  "version": 1,
  "projects": [
    {
      "id": "my-project",
      "name": "My Project",
      "path": "/absolute/path/to/my-project",
      "packageManager": "pnpm",
      "devCommand": "pnpm dev",
      "devPort": 3000,
      "lastUsedAt": "2026-08-11T12:00:00.000Z",
      "claudeSessions": [
        {
          "id": "session-id",
          "title": "Initial project inspection",
          "createdAt": "2026-08-11T12:00:00.000Z",
          "lastUsedAt": "2026-08-11T12:30:00.000Z"
        }
      ]
    }
  ],
  "activeProjectId": "my-project"
}
```

### 7.4 数据迁移

后续修改配置结构时必须：

- 增加 `version` 字段；
- 兼容至少一个上一版本；
- 写入失败时保留原文件；
- 对损坏 JSON 提供备份或恢复提示；
- 不因单个项目路径失效而丢失其他项目。

---

## 8. 技术架构

### 8.1 组件结构

```text
Atom Package
├── lib/main.js
│   ├── 注册 Atom commands
│   ├── 创建 Workspace panel
│   └── 协调 store / process / view
├── lib/project-store.js
│   ├── 读取项目配置
│   ├── 写入项目配置
│   └── 管理当前项目
├── lib/process-manager.js
│   ├── 启动 Claude 子进程
│   ├── 启动 dev server 子进程
│   ├── 转发 stdout/stderr
│   └── 停止进程
├── lib/workspace-view.js
│   ├── 项目选择器
│   ├── 操作按钮
│   ├── 输出区域
│   └── 预览区域
└── styles/claude-workspace.less
```

### 8.2 进程管理原则

- 使用 `child_process.spawn()`，不要使用未约束的 shell 字符串拼接；
- 项目路径作为 `cwd` 传入；
- 默认 `shell: false`；
- 分开处理 stdout、stderr 和 close/error 事件；
- 停止时只终止插件自己创建的子进程；
- 插件退出时清理子进程；
- 后续需要处理子进程树，避免只终止父进程。

### 8.3 Claude 集成原则

MVP 使用 Claude Code CLI，而不是直接调用 Anthropic API。这样可以复用 Claude Code 的安装、授权、权限提示和本地项目上下文。

插件不得：

- 读取 Claude token；
- 自己模拟用户授权；
- 默认添加危险权限参数；
- 将用户代码或完整对话上传到第三方服务；
- 在日志中打印认证信息。

### 8.4 预览安全

内嵌预览只应默认访问用户本机的 localhost/127.0.0.1 地址。后续允许外部 URL 时必须：

- 明确显示域名；
- 在打开前要求用户确认；
- 限制 Node/Electron 能力；
- 避免让远程网页访问 Atom 内部 API；
- 对 iframe/webview 使用最小权限配置。

---

## 9. 非功能需求

### NFR-001：兼容性

- 支持 Atom 1.60+；
- 优先支持 Linux；
- 后续支持 macOS 和 Windows；
- 不依赖系统中不存在的专用 shell。

### NFR-002：可靠性

- 子进程异常退出不得导致 Atom 崩溃；
- 配置文件损坏不得导致插件无法加载；
- 项目目录被删除后应显示可理解的错误；
- dev server 无法启动时必须保留原始日志。

### NFR-003：性能

- 打开工作区面板应在 500 ms 内完成；
- 输出显示不得阻塞 Atom 编辑器；
- 日志区应限制内存增长，后续加入最大日志行数；
- 不应在启动插件时自动启动所有项目进程。

### NFR-004：可维护性

- 进程管理、存储和视图逻辑分离；
- 所有命令使用稳定命名空间；
- 关键行为有自动化测试；
- README、PRD 和变更记录同步维护。

### NFR-005：安全性

- 不绕过 Claude Code 权限机制；
- 不保存或打印 secrets；
- 不使用 `exec()` 拼接用户输入执行命令；
- 对路径和项目目录进行基本校验；
- 停止进程时不得误杀用户手动启动的同名服务。

---

## 10. 用户故事与验收标准

### US-001：选择项目

**作为**开发者，**我希望**选择一个本地目录，**从而**在 Atom 中使用 Claude Workspace。

**验收标准：**

- 能从命令面板执行选择项目；
- 选择成功后项目出现在下拉框；
- 项目目录被加入 Atom；
- 重启 Atom 后项目记录仍存在。

### US-002：启动 Claude

**作为**开发者，**我希望**从当前项目启动 Claude Code，**从而**快速了解或修改项目。

**验收标准：**

- 未选择项目时有明确提示；
- Claude 工作目录是当前项目目录；
- stdout/stderr 出现在面板；
- 进程退出状态可见；
- 插件不传入跳过权限参数。

### US-003：启动前端服务

**作为**前端开发者，**我希望**点击按钮启动 dev server，**从而**不必手动切换到终端。

**验收标准：**

- pnpm 项目使用 `pnpm dev`；
- yarn 项目使用 `yarn dev`；
- 其他项目默认使用 `npm run dev`；
- 输出显示在面板；
- 能点击 Stop 停止由插件启动的进程。

### US-004：预览页面

**作为**前端开发者，**我希望**在 Atom 内查看 localhost 页面，**从而**减少窗口切换。

**验收标准：**

- 识别常见 localhost 输出；
- Preview 使用识别到的 URL；
- 未识别时默认使用 3000 端口；
- 页面加载失败时显示可操作提示。

### US-005：恢复 session

**作为**长期项目开发者，**我希望**恢复之前的 Claude session，**从而**继续已有上下文。

**验收标准：**

- session ID 按项目保存；
- 能从 session 列表选择并恢复；
- 恢复失败时不删除原 session 记录；
- session 记录不包含认证 token。

---

## 11. 错误处理矩阵

| 错误 | 检测方式 | 用户提示 | 恢复方式 |
|---|---|---|---|
| 未选择项目 | 当前项目为空 | “请先选择一个项目” | 打开项目选择器 |
| 找不到 `claude` | 子进程 error | “请确认 Claude Code 已安装并在 PATH 中” | 修复 PATH 后重试 |
| 找不到 npm/pnpm/yarn | 子进程 error | 显示命令和 PATH 建议 | 安装对应工具后重试 |
| dev command 不存在 | 进程退出非 0 | 显示原始日志 | 检查 `package.json` scripts |
| 端口被占用 | server 输出/健康检查 | 显示占用端口 | 修改端口或停止原进程 |
| 项目路径失效 | `fs.existsSync` | 显示路径不存在 | 重新选择项目 |
| 配置 JSON 损坏 | JSON parse error | 使用空配置并提示 | 从备份恢复 |
| Atom panel 销毁 | panel 生命周期 | 清理 view 引用和进程 | 重新打开 Workspace |

---

## 12. 里程碑与实施计划

### Phase 0：基础骨架（已完成）

- 创建 Atom package；
- 创建项目存储；
- 创建 Workspace 面板；
- 注册菜单、命令和快捷键；
- 发布 GitHub public repository。

### Phase 1：MVP 稳定化（核心功能已完成，持续补强）

- [x] 增加进程状态显示；
- [x] 增加目录失效处理；
- [x] 增加日志清空和长度上限；
- [x] 增加项目删除；
- [x] 增加基本单元测试；
- [ ] 修复跨平台命令解析；
- [ ] 手动测试 Next.js、Vite、React 项目。

### Phase 2：Session 管理（基础能力已并入 MVP，交互增强待完成）

- [x] 解析 Claude `stream-json` 中的 session ID；
- [x] 保存 session 元数据；
- [x] session 列表；
- [x] `--resume` 恢复；
- [x] 每个项目独立的 session 历史；
- [x] session 标题和最近使用时间；
- [x] session 删除；
- [ ] 更丰富的历史管理。

### Phase 3：交互式开发体验（Linux MVP 已开始实现）

- [x] 通过 Linux `script` 提供交互式 Claude PTY；
- [x] 支持从工作区输入框发送文本；
- [ ] 集成跨平台 `node-pty`；
- [ ] 集成 `xterm.js`；
- [ ] 支持完整交互式 Claude 权限确认；
- [ ] 支持 Ctrl-C/信号中断和多终端 tab；
- [x] 支持 Claude、交互终端和 dev server 的独立日志来源。

### Phase 4：预览增强

- 独立 Atom pane；
- [x] 自动健康检查；
- [x] 刷新和重新连接；
- 浏览器控制台；
- 网络错误；
- 端口和框架自动识别。

### Phase 5：团队工作区

- 项目配置文件；
- 共享启动命令；
- Git 分支和状态；
- 团队级文档；
- 可选的 TOPY 服务集成；
- 项目级 AI 工作流模板。

---

## 13. 测试策略

### 13.1 单元测试

至少覆盖：

- 项目 ID 生成；
- 项目存储读取和写入；
- 配置文件缺失和损坏；
- package manager 检测；
- localhost URL 解析；
- 进程退出和错误事件；
- session ID 解析。

### 13.2 集成测试

- 在临时目录注册项目；
- 启动一个假的 Claude CLI；
- 启动一个假的 dev server；
- 检查输出是否进入视图；
- 检查 Stop 是否终止正确进程；
- 检查重启后配置是否保留。

### 13.3 手动验收环境

至少验证以下项目类型：

- Next.js + TypeScript + npm；
- Next.js + pnpm；
- React/Vite + npm；
- React/Vite + yarn；
- 无 lockfile 的简单 Node 项目；
- 缺少 `claude` 命令的错误场景；
- dev server 启动失败场景。

### 13.4 回归检查

每次发布前运行：

```bash
for file in lib/*.js; do node --check "$file"; done
node -e "JSON.parse(require('fs').readFileSync('package.json'))"
```

并在 Atom development mode 中验证命令和面板。

---

## 14. 安全与隐私

### 14.1 本地优先

MVP 的项目路径、session 索引和进程输出默认只保存在本地。插件不要求 TOPY 服务器才能运行。

### 14.2 凭证保护

Claude Code 负责自己的认证。插件不得读取、复制、上传或显示 Claude token、API key 或 OAuth 凭证。

### 14.3 命令执行

插件会执行用户选择项目中的命令，因此界面必须清楚显示：

- 执行的命令；
- 工作目录；
- 启动时间；
- 退出状态。

插件不得通过字符串拼接把任意用户输入交给 shell。任何未来支持的自定义命令都必须明确展示并经过参数化执行。

### 14.4 预览隔离

开发预览默认限定为本机地址。若未来允许打开远程 URL，必须增加安全确认和隔离策略。

---

## 15. 开放问题

1. 是否继续以 Atom 为主平台，还是同时支持 Pulsar？
2. 是否需要把交互式终端作为 v1，而不是后续版本？
3. session 数据是否需要加入 TOPY 云端同步？
4. “New Project” 是创建空目录，还是必须提供 Next.js 模板？
5. 是否允许一个项目同时运行多个 dev server？
6. 预览区域使用 iframe、Electron webview，还是外部浏览器？
7. 是否需要支持 Windows 原生环境和 PowerShell？
8. 是否需要接入 GitHub、Git worktree 或 TOPY 项目记录？
9. 是否要为每个项目支持自定义 `.claude-workspace.json`？
10. 是否需要记录开发操作审计日志？

---

## 16. 发布标准

一个版本可以标记为 MVP release，必须满足：

- package 能被 Atom 加载；
- `package.json` 合法；
- 所有 JavaScript 文件通过语法检查；
- 项目选择流程可用；
- Claude 启动失败时有明确错误；
- dev server 启停可用；
- 不使用危险权限绕过参数；
- README 和 PRD 已同步；
- GitHub 仓库包含可复现安装步骤；
- 没有提交 secrets、用户项目文件或日志。

---

## 17. 当前仓库映射

| PRD 模块 | 当前实现 |
|---|---|
| 项目管理 | `lib/project-store.js`、`lib/main.js` |
| Claude 启动 | `lib/process-manager.js` |
| Dev server 管理 | `lib/process-manager.js` |
| Atom 工作区 UI | `lib/workspace-view.js` |
| Atom 命令 | `package.json`、`menus/`、`keymaps/` |
| 样式 | `styles/claude-workspace.less` |
| 安装和开发说明 | `README.md` |
| 产品需求 | `docs/PRD.md` |

---

## 18. 术语表

| 术语 | 含义 |
|---|---|
| Atom package | Atom 的插件包 |
| Claude Code | Anthropic 提供的本地 CLI 编程代理 |
| Session | 一次可继续的 Claude Code 对话上下文 |
| Dev server | 本地开发服务器，例如 Next.js 的 `next dev` |
| Project | 用户注册到插件中的本地项目目录 |
| Preview | 在 Atom 或外部浏览器中查看本地开发页面 |
| MVP | 最小可用产品版本 |
| PTY | 伪终端，用于实现交互式命令行体验 |
