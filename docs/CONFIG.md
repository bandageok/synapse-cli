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

## HEARTBEAT.md — 定时任务

**作用：** 定义 Agent 的后台定时任务。

**格式：** 任务列表，每个 = 命令 + 条件 + 动作。

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
SOUL.md (人格) > USER.md (用户) > .synapse.md (项目) > MEMORY.md (记忆)
```

高层级可覆盖低层级。例如 SOUL.md 的行为铁律优先于 .synapse.md 的项目规范。

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

---

## 与 OpenClaw / Claude Code 的对应关系

| Synapse | OpenClaw | Claude Code | 作用 |
|----------|----------|-------------|------|
| SOUL.md | SOUL.md | — | 人格定义 |
| USER.md | USER.md | — | 用户画像 |
| IDENTITY.md | IDENTITY.md | — | Agent 身份 |
| MEMORY.md | MEMORY.md | MEMORY.md | 长期记忆 |
| HEARTBEAT.md | HEARTBEAT.md | — | 定时任务 |
| TOOLS.md | TOOLS.md | — | 工具笔记 |
| .synapse.md | .bronya.md | CLAUDE.md | 项目级配置 |

## Provider 和 审计

Synapse 会把 `SOUL.md`、`MEMORY.md`、项目/用户指令、技能上下文和当前对话组装成系统提示词发送给 provider。工具调用先经过权限判断，再进入执行层；所有工具决策会写入 `logs/audit.jsonl`，便于回溯。
| — | AGENTS.md | — | 行为规则（内置到 SOUL.md） |
