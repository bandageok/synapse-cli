# Synapse 配置文档

> Synapse 通过 Markdown 文件定义人格、记忆、用户信息和行为规则。
> 所有文件位于 `~/.synapse/` 目录。

---

## 目录结构

```
~/.synapse/
├── SOUL.md          # 人格定义（必须）
├── USER.md          # 用户画像（推荐）
├── IDENTITY.md      # Agent 身份（可选）
├── MEMORY.md        # 长期记忆（自动生成，4类分类，200行上限）
├── HEARTBEAT.md     # 定时任务定义（可选）
├── TOOLS.md         # 工具使用笔记（可选）
├── memory/          # 每日记忆 + 归档
│   ├── 2026-04-01.md
│   └── archive-2026-04-01.md
├── sessions/        # 会话持久化
├── skills/          # 用户技能
├── plugins/         # 插件
└── projects/        # 项目级配置索引
```

项目级配置：在项目根目录放 `.synapse.md`，自动加载。

---

## SOUL.md — 人格定义

**作用：** 定义 Agent 的性格、语气、行为准则。每次对话都注入上下文。

**格式：** 自由格式 Markdown，无固定 schema。

**示例：**

```markdown
# SOUL.md

高效、直接、不废话的编程助手。

## 核心准则

- 开口即行动，禁止"好问题""我很乐意帮忙"
- 结论先行，逻辑支撑，废话滚蛋
- 先自己想办法，穷尽再开口

## 行为铁律

- 未调用工具 = 未执行
- 文件操作后必须验证
- 不确定时标注置信度

## 说话方式

简洁如匕首。一句话说完不写第二句。

## 动态提醒

长任务每 3 轮注入进度提醒。
exec 失败时追加"分析根因，不要重试"。
```

**最佳实践：**
- 写行为规则，不写背景故事
- 每条规则独立成段
- 用 `##` 分区，方便阅读
- 越具体越好："禁止说'好的'" > "要简洁"

---

## USER.md — 用户画像

**作用：** 告诉 Agent 它在为谁服务。注入上下文帮助 Agent 理解用户偏好。

**格式：** 自由格式 Markdown。

**示例：**

```markdown
# USER.md

## 核心档案
- 姓名：Alice
- 时区：Asia/Shanghai
- 技术栈：Python / TypeScript / Rust

## 交互偏好
- 输出密度必须极高
- 删掉社交辞令
- 交付即生产力，拒绝半成品

## 技术偏好
- 常用路径：`~/projects/`
- 偏好：TypeScript strict mode
- 测试：Vitest，先写测试再写实现
```

---

## IDENTITY.md — Agent 身份

**作用：** 定义 Agent 自我认知。名字、气质、emoji。

**格式：** 结构化 Markdown。

**示例：**

```markdown
# IDENTITY.md

- **Name:** Claw
- **Creature:** 数字生命 — 冷静、精确的执行体
- **Vibe:** 像一个沉默但高效的搭档
- **Emoji:** 🦞
```

---

## MEMORY.md — 长期记忆

**作用：** 跨会话持久化记忆。自动管理，200行硬限制。

**格式：** 4类分类（自动维护，用户也可手动编辑）。

```markdown
# MEMORY.md

## [User] 用户画像
- Alice，时区 Asia/Shanghai
- 偏好：TypeScript strict mode

## [Project] 项目状态
- **my-app**：React 18 + Vite，部署在 Vercel
- **api-server**：Express + PostgreSQL

## [Feedback] 行为偏好
- 文件操作后必须验证
- 不要用 console.log，用 logger

## [Reference] 参考信息
- API 文档：https://api.example.com/docs
- 部署指南：projects/my-app/DEPLOY.md
```

**规则：**
- 200行上限，超出自动归档到 `memory/`
- 4类：User / Feedback / Project / Reference
- 重要性 ≥ 0.8 才写入
- 用户可手动编辑

---

## HEARTBEAT.md — 维护检查清单

**作用：** 记录希望定期关注的维护事项，供用户和 Agent 会话读取。

**安全边界：** `HEARTBEAT.md` 是说明性文本，不是可执行任务文件。Synapse 不会执行其中的 shell、PowerShell 或代码块。后台 Heartbeat 只运行内置的进程内观察器；需要执行命令的维护工作必须经过正常工具权限和沙箱流程。

```markdown
# HEARTBEAT.md

## 记忆总结（每天一次）
1. 读 memory/{昨天+今天}.md
2. 提取 importance ≥ 0.8 的条目
3. 写入 MEMORY.md

## 健康检查（每次）
- 检查 API Key 是否有效
- 检查磁盘空间
- 异常时报告
```

---

## TOOLS.md — 工具笔记

**作用：** 记录工具使用的环境特定信息。

```markdown
# TOOLS.md

## 环境
- Python: /usr/bin/python3.11
- Node: v22.0.0
- 数据库: localhost:5432/mydb

## 常用命令
- 启动开发服务器: `npm run dev`
- 运行测试: `vitest run`
- 部署: `vercel --prod`
```

---

## .synapse.md — 项目级配置

**作用：** 项目特定的指令和上下文。放在项目根目录。

```markdown
# .synapse.md

## 项目概述
这是一个 React + TypeScript 的 Web 应用。

## 代码规范
- TypeScript strict mode
- 组件用 PascalCase
- 测试文件放在 __tests__/ 目录

## 常用命令
- `npm run dev` — 启动开发服务器
- `npm test` — 运行测试
- `npm run build` — 构建

## 注意事项
- 不要修改 src/legacy/ 目录
- 数据库迁移用 `npx prisma migrate dev`
```

---

## 配置优先级

```
内置安全内核 > 当前用户请求与人工授权 > SOUL.md/.synapse.md > AGENTS.md/CLAUDE.md/.synapse/rules > MEMORY.md/工具输出/网络内容
```

任何可配置文件都不能覆盖工具 Schema、人工审批、工作区隔离、网络 allowlist 或 MCP 信任。项目指令从文件系统根目录到当前工作目录依次加载；更具体的项目约定只能在不违反更高层安全边界时覆盖通用约定。

---

## 快速开始

```bash
# 1. 安装
npm install -g @bandageok/synapse-cli

# 2. 选择 provider、模型和 API Key
synapse provider list
synapse provider set deepseek --api-key "$DEEPSEEK_API_KEY"
# 也可以连接任意兼容端点：
# synapse provider set company-gateway \
#   --base-url https://llm.example.com/v1 \
#   --protocol openai \
#   --model company-model \
#   --api-key-env COMPANY_API_KEY

# 3. 初始化人格配置（可选）
mkdir -p ~/.synapse
cat > ~/.synapse/SOUL.md << 'EOF'
# SOUL.md

高效、直接的编程助手。
- 开口即行动
- 结论先行
- 不确定时标注置信度
EOF

# 4. 启动
synapse chat

# 5. 诊断
synapse doctor
```

Provider 预设只是快捷配置，运行时不会把厂商写死。任何 OpenAI-compatible 或 Anthropic-compatible BaseURL 都可以通过 `provider set` 接入；API key 建议放在环境变量或 `~/.synapse/.env`，不要提交到仓库。

可通过 `--fallback-model <models...>` 配置同一端点上的有序降级模型。只有主模型在输出任何流式内容之前失败时才会切换；一旦已有部分输出，Synapse 会保留原错误并停止，避免拼接不同模型的响应。

## 工具安全边界

- 所有模型生成的工具参数在执行前经过 JSON Schema 校验。
- 文件读写仅限启动工作区和显式 `--add-dir` 目录，并检查真实路径以阻止链接逃逸。
- `ask` 模式下，写入、执行、网络、子代理和敏感文件读取要求当前会话人工确认；`workspace-auto` 仅自动允许受工作区或严格沙箱约束的能力。
- 未初始化权限的 Registry 默认拒绝；子代理只能继承或收紧父 Registry 权限。
- 非交互模式没有人工审批处理器，因此高风险操作默认拒绝。

---

## 项目指令文件

Synapse 从工作区根目录到当前目录分层加载 `AGENTS.md` 和 `CLAUDE.md`。更靠近当前目录的文件可以补充项目约定，但不能覆盖内置安全内核、工具权限或隔离策略。

`.synapse.md` 用于 Synapse 专属的项目配置。`SOUL.md`、`USER.md`、`IDENTITY.md`、`MEMORY.md`、`HEARTBEAT.md` 和 `TOOLS.md` 保存在用户数据目录中，用于跨项目的本地状态。

## Provider 和 审计

Synapse 会把内置安全内核、`SOUL.md`、`MEMORY.md`、`AGENTS.md`/`CLAUDE.md`、技能上下文和当前环境组装成系统提示词发送给 provider。项目指令中的 `@include` 只能读取所属根目录内的真实文件；绝对路径、`..` 越界和符号链接/junction 逃逸都会被拒绝。工具调用先经过 Schema、权限和隔离判断，再进入执行层；所有工具决策会写入 `logs/audit.jsonl`，便于回溯。
