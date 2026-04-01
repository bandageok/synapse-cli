# C.C.Claw Design Spec

> **C.C.Claw** = Claude Code × Claw (OpenClaw)
> 融合 Claude Code 的工程化架构 + OpenClaw 的人格/记忆/多 Channel 系统
> 数据脱敏、可共享、可移植复用的开源 CLI Agent 框架

---

## 1. 定位

| 维度 | Claude Code | OpenClaw/Bronya | C.C.Claw |
|------|-------------|-----------------|----------|
| 本质 | 工具 | 平台 | **框架** |
| 人格 | 无 | SOUL.md | SOUL.md (一等公民) |
| 记忆 | MEMORY.md + Dream | MEMORY.md + Heartbeat | **两者融合** |
| 工具 | 55 内置 + MCP | ~20 内置 + 扩展 | **12 核心 + MCP + Plugin** |
| 上下文 | 6层注入 | 静态文件注入 | **6层注入 + 动态提醒** |
| 压缩 | 4级防御 | Gateway 管理 | **4级防御** |
| 多 Channel | CLI only | 飞书/Telegram/Discord | **CLI + Channel 桥接(未来)** |
| 开源 | ❌ (泄露) | ❌ (闭源平台) | **✅ MIT License** |

**MVP 目标：** 人格系统 + 核心工具循环 + 基础工程化，可跑、可扩展、可共享。

---

## 2. 技术栈

```
Runtime:     Node.js >= 18 + TypeScript
CLI 框架:    Commander.js
TUI 渲染:    Ink (React for终端)
状态管理:    Zustand
包管理:      pnpm (monorepo)
测试:        Vitest
构建:        tsup (ESM)
Lint:        Biome
```

---

## 3. 架构总览

```
c.c.claw/
├── src/
│   ├── entry/
│   │   ├── cli.ts              # 入口：Commander 路由
│   │   └── init.ts             # 初始化：配置/认证
│   ├── core/
│   │   ├── Engine.ts           # AsyncGenerator 核心循环
│   │   ├── Context.ts          # 6层上下文组装
│   │   ├── Compressor.ts       # 4级上下文压缩
│   │   ├── ToolRegistry.ts     # 工具注册/调度/权限
│   │   ├── HookSystem.ts       # PreToolUse/PostToolUse
│   │   ├── SessionStore.ts     # 会话持久化/恢复
│   │   └── ErrorRecovery.ts    # 错误处理/重试/熔断
│   ├── soul/
│   │   ├── SoulLoader.ts       # SOUL.md 解析/注入
│   │   ├── MemoryManager.ts    # 4类记忆 + 200行限制
│   │   ├── Dream.ts            # 后台记忆整合
│   │   └── Heartbeat.ts        # 定时任务引擎
│   ├── tools/
│   │   ├── base.ts             # Tool 基类 (JSON Schema + 权限)
│   │   ├── BashTool.ts         # Shell 执行 + 沙箱
│   │   ├── FileReadTool.ts
│   │   ├── FileEditTool.ts
│   │   ├── FileWriteTool.ts
│   │   ├── GlobTool.ts
│   │   ├── GrepTool.ts
│   │   ├── WebSearchTool.ts
│   │   ├── WebFetchTool.ts
│   │   ├── AgentTool.ts        # 子代理派生
│   │   ├── TodoWriteTool.ts
│   │   ├── AskUserQuestionTool.ts
│   │   └── SkillTool.ts
│   ├── ui/
│   │   ├── REPL.tsx            # 主交互界面 (Ink)
│   │   ├── components/         # UI 组件
│   │   └── screens/            # Doctor/Resume 等
│   ├── providers/
│   │   ├── base.ts             # Provider 接口
│   │   ├── anthropic.ts        # Anthropic 直连
│   │   ├── openrouter.ts       # OpenRouter 统一网关
│   │   └── factory.ts          # Provider 工厂
│   ├── plugins/
│   │   ├── registry.ts         # 插件注册/加载
│   │   └── manifest.ts         # plugin.json 解析
│   ├── skills/
│   │   ├── loader.ts           # Skill 加载 (渐进式披露)
│   │   └── resolver.ts         # paths 匹配
│   ├── bridge/
│   │   └── channel.ts          # 多 Channel 桥接 (未来)
│   └── utils/
│       ├── permissions.ts      # 权限模型 (ask/bubble/allow)
│       ├── sandbox.ts          # 沙箱抽象层
│       └── config.ts           # 配置管理
├── packages/                   # Monorepo 子包 (发布用)
│   ├── @cclaw/core            # re-export src/core/
│   ├── @cclaw/cli             # CLI 入口
│   ├── @cclaw/soul            # 人格系统
│   └── @cclaw/tools-core      # 核心工具集
├── .cclaw/                     # 用户数据目录
│   ├── SOUL.md                 # 人格定义
│   ├── MEMORY.md               # 长期记忆
│   ├── HEARTBEAT.md            # 定时任务定义
│   ├── memory/                 # 每日记忆
│   ├── sessions/               # 会话持久化
│   ├── skills/                 # 用户技能
│   ├── plugins/                # 插件
│   └── projects/<slug>/        # 项目级配置
│       └── .cclaw.md           # 项目指令 (CLAUDE.md 等价)
├── package.json
├── tsconfig.json
├── biome.json
└── README.md
```

---

## 4. 核心循环 (Engine.ts)

```typescript
// AsyncGenerator — 和 Claude Code 同构
async function* createEngine(
  messages: Message[],
  provider: Provider,
  tools: ToolRegistry,
  context: ContextBuilder,
  hooks: HookSystem,
  compressor: Compressor,
  errorRecovery: ErrorRecovery,
): AsyncGenerator<EngineEvent> {
  let turnCount = 0;

  while (true) {
    turnCount++;

    // 1. 上下文压缩检查 (4级防御)
    const compressionResult = await compressor.checkAndCompress(messages);
    if (compressionResult.compressed) {
      yield { type: 'compressed', ...compressionResult.stats };
    }

    // 2. 组装上下文 (6层)
    const systemPrompt = await context.build(turnCount);

    // 3. 流式 API 请求
    try {
      const stream = provider.stream({
        system: systemPrompt,
        messages,
        tools: tools.schemas(),
      });

      const contentBlocks: ContentBlock[] = [];
      let currentBlockIndex = -1;

      for await (const chunk of stream) {
        switch (chunk.type) {
          case 'content_block_start':
            contentBlocks.push(chunk.content_block);
            currentBlockIndex = contentBlocks.length - 1;
            if (chunk.content_block.type === 'text') {
              yield { type: 'token', text: '' };
            }
            break;

          case 'content_block_delta': {
            const block = contentBlocks[currentBlockIndex];
            if (block.type === 'text') {
              block.text += chunk.delta.text;
              yield { type: 'token', text: chunk.delta.text };
            } else if (block.type === 'tool_use') {
              // 累积 JSON string，最后统一 parse
              block._inputJson = (block._inputJson || '') + chunk.delta.partial_json;
            }
            break;
          }

          case 'content_block_stop':
            // parse tool_use input
            if (contentBlocks[currentBlockIndex]?.type === 'tool_use') {
              const tb = contentBlocks[currentBlockIndex] as ToolUseBlock;
              try {
                tb.input = JSON.parse(tb._inputJson || '{}');
              } catch (e) {
                tb.input = {};
                tb._parseError = true;
              }
              delete tb._inputJson;
            }
            break;

          case 'message_stop':
            break;
        }
      }

      // 4. 推入 assistant 消息
      const assistantMessage: AssistantMessage = {
        role: 'assistant',
        content: contentBlocks,
      };
      messages.push(assistantMessage);

      // 5. 无工具调用 → end_turn
      const toolUses = contentBlocks.filter(b => b.type === 'tool_use');
      if (toolUses.length === 0) {
        yield { type: 'end_turn' };
        return;
      }

      // 6. 执行工具调用
      for (const toolUse of toolUses) {
        // JSON parse 失败处理
        if (toolUse._parseError) {
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Error: Invalid JSON in tool input' }],
          });
          continue;
        }

        // PreToolUse Hook
        const hookResult = await hooks.preToolUse(toolUse);
        if (hookResult.blocked) {
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: hookResult.reason }],
          });
          continue;
        }

        // 权限检查
        const permission = await tools.checkPermission(toolUse);
        if (permission === 'deny') {
          messages.push({
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: 'Permission denied' }],
          });
          continue;
        }

        // 执行 (带超时 + 错误恢复)
        yield { type: 'tool_use', tool: toolUse.name, input: toolUse.input };
        let result: ToolResult;
        try {
          result = await errorRecovery.executeWithRetry(
            () => tools.execute(toolUse),
            { tool: toolUse.name, maxRetries: 1 },
          );
        } catch (err) {
          result = { output: `Error: ${err.message}`, isError: true };
        }

        // PostToolUse Hook
        await hooks.postToolUse(toolUse, result);

        // 动态提醒注入 (借鉴 Claude Code System Reminders)
        const reminder = tools.getDynamicReminder(turnCount, toolUse, result);
        const resultContent = reminder ? `${result.output}\n\n${reminder}` : result.output;

        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: resultContent }],
        });
        yield { type: 'tool_result', tool: toolUse.name, output: result.output };
      }
    } catch (err) {
      // API 错误 → ErrorRecovery 处理
      const recovered = await errorRecovery.handleApiError(err, messages);
      if (!recovered) {
        yield { type: 'error', error: err.message };
        return;
      }
      // recovered → 继续循环重试
    }
  }
}
```

---

## 5. 上下文压缩 (Compressor.ts)

```typescript
// 4级防御 — 借鉴 Claude Code compact/ 子系统

interface Compressor {
  checkAndCompress(messages: Message[]): Promise<CompressionResult>;
}

class CompressorImpl implements Compressor {
  private tokenBudget: number;
  private warningThreshold: number;
  private autoCompactThreshold: number;

  constructor(model: string, contextWindow: number) {
    // Claude Code: contextWindow - 20_000 (reserved for summary output)
    const effectiveWindow = contextWindow - 20_000;
    // Claude Code: AUTOCOMPACT_BUFFER_TOKENS = 13_000
    this.autoCompactThreshold = effectiveWindow - 13_000;
    // Claude Code: WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
    this.warningThreshold = this.autoCompactThreshold - 20_000;
    this.tokenBudget = effectiveWindow;
  }

  async checkAndCompress(messages: Message[]): Promise<CompressionResult> {
    const tokenUsage = estimateTokens(messages);

    // Level 1: autoCompact — 接近上限时主动压缩
    if (tokenUsage >= this.autoCompactThreshold) {
      return this.autoCompact(messages);
    }

    // Level 2: apiMicrocompact — API 原生上下文管理 (prompt caching)
    // 由 Provider 层处理，这里只做标记

    // Level 3: reactiveCompact — API 返回 context-too-large 时触发
    // 在 ErrorRecovery 中处理

    // Level 4: snip — 紧急裁剪非关键内容
    // 在 autoCompact 失败后作为 fallback

    return { compressed: false };
  }

  private async autoCompact(messages: Message[]): Promise<CompressionResult> {
    // 1. Strip images (最大 token 消耗源)
    const stripped = stripImages(messages);

    // 2. 调用压缩 API 总结对话
    const summary = await this.summarize(stripped);

    // 3. 恢复文件引用 + skill 状态
    const restored = restoreReferences(summary, messages);

    // 4. 构建压缩后的 messages
    const compressed = [
      { role: 'user', content: summary },
      { role: 'assistant', content: 'Understood, continuing from the summary.' },
    ];

    return {
      compressed: true,
      stats: { tokensBefore: estimateTokens(messages), tokensAfter: estimateTokens(compressed) },
    };
  }

  // Claude Code: 连续失败 3 次后熔断，避免无限重试
  // BQ 数据：全球每天 ~250K 次无效重试
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
}
```

---

## 6. 人格系统 (soul/)

### 6.1 SOUL.md 格式

```markdown
# SOUL.md

[人格定义 — 自由格式 Markdown]

## 行为铁律
[硬性约束 — 每条独立成段]

## 动态提醒机制
**长任务注入规则：** [频率 + 内容]
**Tool Result 指令追加：** [规则]
```

### 6.2 MemoryManager

```typescript
interface MemoryEntry {
  category: 'user' | 'feedback' | 'project' | 'reference';
  content: string;
  importance: number;  // 0-1
  timestamp: Date;
  source: string;      // 文件路径
}

class MemoryManager {
  // MEMORY.md 始终注入，200行硬限制
  // 超出时自动归档最旧/最低频条目到 memory/ 目录
  // 4类分类：User / Feedback / Project / Reference
  // importance >= 0.8 才写入 MEMORY.md

  async enforceLimit(): Promise<void> {
    const lines = await readLines('MEMORY.md');
    if (lines.length <= 200) return;
    // 按 importance 降序排列，保留 top 200
    // 超出部分归档到 memory/archive-YYYY-MM-DD.md
  }
}
```

### 6.3 Dream (后台记忆整合)

```typescript
class Dream {
  // 后台任务：从会话日志提取结构化记忆
  // 触发条件：会话结束时 + 每 24h + 累计 10 个会话
  // 输出：更新 MEMORY.md + memory/*.md
  // 隔离：独立子进程，不阻塞主循环

  private sessionCount = 0;
  private lastRun = 0;

  shouldTrigger(): boolean {
    const now = Date.now();
    return (
      this.sessionCount >= 10 ||
      now - this.lastRun > 24 * 60 * 60 * 1000
    );
  }

  async run(sessionLogs: SessionLog[]): Promise<void> {
    // 1. 读取会话日志
    // 2. LLM 提取结构化记忆 (4类)
    // 3. 合并到 MEMORY.md (去重 + importance 评分)
    // 4. 超 200 行 → 归档
  }
}
```

### 6.4 Heartbeat

```typescript
class Heartbeat {
  // 定时任务引擎
  // 读取 .cclaw/HEARTBEAT.md 定义任务
  // 每个任务 = shell 命令 + 条件判断 + 响应动作
  // 默认间隔：5 分钟
  // 内置任务：假执行监控、记忆总结、MEMORY.md 归档

  async tick(): Promise<void> {
    const tasks = await this.parseHeartbeatMd();
    for (const task of tasks) {
      const result = await exec(task.command);
      if (task.condition(result)) {
        await task.action(result);
      }
    }
  }
}
```

---

## 7. Agent 隔离模型 (AgentTool)

```typescript
// 借鉴 Claude Code 的 7 种 Task 类型，MVP 实现 3 种

enum AgentIsolation {
  InProcess = 'in_process',      // 同进程，AsyncLocalStorage 隔离
  LocalAgent = 'local_agent',    // 独立子进程，异步后台
  RemoteAgent = 'remote_agent',  // 远程执行 (未来)
}

interface AgentConfig {
  isolation: AgentIsolation;
  maxTurns: number;
  timeout: number;
  tools: string[];           // 允许的工具白名单
  inheritContext: boolean;   // 是否继承父 agent 上下文
  canSpawnChildren: boolean; // MVP: false (禁止 agent-ception)
}

// 默认配置
const DEFAULT_AGENT_CONFIG: AgentConfig = {
  isolation: AgentIsolation.LocalAgent,
  maxTurns: 20,
  timeout: 120_000,          // 2 分钟
  tools: ['Bash', 'FileRead', 'FileEdit', 'FileWrite', 'Glob', 'Grep'],
  inheritContext: false,      // 独立上下文，节省 token
  canSpawnChildren: false,
};
```

---

## 8. 会话持久化 (SessionStore)

```typescript
interface SessionStore {
  save(sessionId: string, messages: Message[], metadata: SessionMeta): Promise<void>;
  load(sessionId: string): Promise<SessionData | null>;
  list(): Promise<SessionMeta[]>;
  delete(sessionId: string): Promise<void>;
}

// 存储位置：.cclaw/sessions/<sessionId>.json
// 格式：{ messages, metadata: { model, createdAt, updatedAt, tokenUsage } }
// /resume 命令：列出最近会话 → 选择 → 恢复 messages + context
```

---

## 9. 错误处理 (ErrorRecovery)

```typescript
class ErrorRecovery {
  // 分类处理：
  // 1. API 错误 (rate limit / timeout / abort)
  //    → 指数退避重试，最多 3 次
  // 2. 工具执行错误
  //    → 返回错误信息给 LLM，让它自行处理
  // 3. JSON parse 错误 (tool input)
  //    → 返回 parse error，LLM 重新生成
  // 4. context-too-large
  //    → 触发 reactiveCompact (Level 3)
  // 5. 连续失败熔断
  //    → 3 次连续压缩失败后停止重试

  async handleApiError(err: Error, messages: Message[]): Promise<boolean> {
    if (err instanceof RateLimitError) {
      await sleep(err.retryAfter * 1000);
      return true;
    }
    if (err instanceof ContextTooLargeError) {
      const result = await this.compressor.reactiveCompact(messages);
      return result.compressed;
    }
    if (err instanceof AbortError) {
      return false; // 用户主动取消
    }
    // 未知错误
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= 3) return false;
    return true;
  }

  async executeWithRetry<T>(
    fn: () => Promise<T>,
    opts: { tool: string; maxRetries: number },
  ): Promise<T> {
    let lastErr: Error;
    for (let i = 0; i <= opts.maxRetries; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        if (i < opts.maxRetries) await sleep(1000 * Math.pow(2, i));
      }
    }
    throw lastErr;
  }
}
```

---

## 10. 工具系统

### 10.1 Tool 基类

```typescript
interface ToolDef<T> {
  name: string;
  description: string;
  schema: JSONSchema;
  permissions: 'read' | 'write' | 'execute' | 'network';
  isEnabled: () => boolean;
  execute: (input: T, ctx: ToolContext) => Promise<ToolResult>;
  renderProgress?: (input: T) => ReactElement;
  renderResult?: (result: ToolResult) => ReactElement;
}
```

### 10.2 MVP 工具集 (12个)

| 工具 | 权限 | 说明 |
|------|------|------|
| BashTool | execute | Shell 执行 + 沙箱 |
| FileReadTool | read | 文件/PDF/图片读取 |
| FileEditTool | write | 字符串替换编辑 |
| FileWriteTool | write | 文件创建/覆写 |
| GlobTool | read | 文件模式匹配 |
| GrepTool | read | 内容搜索 |
| WebSearchTool | network | 网页搜索 |
| WebFetchTool | network | URL 抓取 |
| AgentTool | execute | 子代理派生 (3种隔离) |
| TodoWriteTool | read | TODO 列表管理 |
| AskUserQuestionTool | read | 交互式提问 |
| SkillTool | read | Skill 调用 |

### 10.3 权限模型

```typescript
type PermissionMode = 'ask' | 'bubble' | 'allow';

interface PermissionCheck {
  tool: string;
  input: unknown;
  mode: PermissionMode;
  allowlist: string[];  // 工具白名单
  blacklist: string[];  // 工具黑名单
}
```

### 10.4 Hook 系统

```typescript
interface HookSystem {
  preToolUse(toolUse: ToolUse): Promise<HookResult>;
  postToolUse(toolUse: ToolUse, result: ToolResult): Promise<void>;
}

// Hook 配置来自 .cclaw/hooks.json
// 支持 shell 命令 + 条件匹配
// 示例：
// {
//   "preToolUse": [{ "tool": "Bash", "command": "echo 'about to run bash'" }],
//   "postToolUse": [{ "tool": "FileEdit", "command": "git diff --staged" }]
// }
```

### 10.5 动态提醒注入

```typescript
// 借鉴 Claude Code 的 <system-reminder> 机制

class DynamicReminder {
  getReminder(turnCount: number, toolUse: ToolUse, result: ToolResult): string | null {
    // 每 3 轮注入一次进度提醒
    if (turnCount % 3 === 0) {
      return this.buildProgressReminder();
    }

    // exec 失败 → 追加根因分析指令
    if (toolUse.name === 'Bash' && result.isError) {
      return 'Reminder: Analyze the root cause. Do not retry the same command without modification.';
    }

    // 文件操作后 → 追加验证指令
    if (['FileEdit', 'FileWrite'].includes(toolUse.name) && !result.isError) {
      return 'Reminder: Verify the modification took effect (re-read the file).';
    }

    // 搜索结果 → 追加不脑补指令
    if (['WebSearch', 'Grep', 'Glob'].includes(toolUse.name)) {
      return 'Reminder: Use only information found in search results. Do not infer or fabricate.';
    }

    return null;
  }
}
```

---

## 11. 上下文系统 (Context.ts)

```typescript
class ContextBuilder {
  async build(turnCount: number): Promise<string[]> {
    return [
      await this.layer1_defaultPrompt(),      // 基础行为指令
      await this.layer2_soul(),               // SOUL.md 人格
      await this.layer3_memoryMechanics(),    // 记忆系统指令
      await this.layer4_userContext(),        // .cclaw.md (用户 + 项目级)
      await this.layer5_systemContext(),      // git status / env / 动态状态
      await this.layer6_dynamicReminders(turnCount), // 动态提醒 (进度/约束)
    ];
  }
}
```

---

## 12. Provider 系统

```typescript
interface Provider {
  name: string;
  stream(params: StreamParams): AsyncIterable<StreamChunk>;
  complete(params: CompleteParams): Promise<CompleteResult>;
}

// 两个实现：
// AnthropicProvider — 直连 Anthropic API
// OpenRouterProvider — 统一网关 (支持多模型)

// 选择逻辑：
// 1. 检查 ANTHROPIC_API_KEY → AnthropicProvider
// 2. 检查 OPENROUTER_API_KEY → OpenRouterProvider
// 3. 都没有 → 引导配置
```

---

## 13. 插件系统

```json
// plugin.json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "commands": "./commands",
  "agents": ["./agents"],
  "skills": ["./skills"],
  "hooks": { "preToolUse": "./hooks/pre.js" },
  "mcpServers": {},
  "lspServers": {},
  "config": {
    "api_key": { "type": "string", "sensitive": true }
  }
}
```

---

## 14. 数据脱敏规则

| 数据类型 | 脱敏方式 | 示例 |
|----------|----------|------|
| API Key | 环境变量引用 | `process.env.CCLAW_API_KEY` |
| 用户路径 | 相对路径 | `~/.cclaw/` 而非绝对路径 |
| 邮箱 | 移除 | 不出现在代码/配置中 |
| 个人 ID | 移除 | 不出现在代码/配置中 |
| Token/Secret | Keychain/环境变量 | 永不硬编码 |
| 项目路径 | 配置注入 | 运行时读取，不写死 |

**原则：** 代码仓库中零个人信息。所有敏感数据通过环境变量或系统 Keychain 注入。

---

## 15. MVP 路线图

### Phase 1: 核心引擎 (Week 1-2)
- [ ] Engine.ts — AsyncGenerator 循环 (含 content block 正确解析)
- [ ] Context.ts — 6层上下文组装
- [ ] Compressor.ts — 4级压缩 (autoCompact + reactiveCompact + snip)
- [ ] ToolRegistry.ts — 工具注册/调度
- [ ] ErrorRecovery.ts — 错误分类/重试/熔断
- [ ] SessionStore.ts — 会话持久化/恢复
- [ ] Provider 接口 + OpenRouter 实现
- [ ] 12 个核心工具

### Phase 2: 人格系统 (Week 2-3)
- [ ] SoulLoader.ts — SOUL.md 解析
- [ ] MemoryManager.ts — 4类记忆 + 200行限制
- [ ] Heartbeat.ts — 定时任务引擎
- [ ] Dream.ts — 后台记忆整合 (触发: 会话结束/24h/10会话)
- [ ] DynamicReminder — 动态提醒注入

### Phase 3: UI & 体验 (Week 3-4)
- [ ] REPL.tsx — Ink 交互界面
- [ ] Tool Result 指令追加
- [ ] Doctor 诊断
- [ ] /resume 会话恢复

### Phase 4: 工程化 (Week 4-5)
- [ ] Hook 系统 (PreToolUse/PostToolUse)
- [ ] 插件系统 (manifest + registry)
- [ ] Skill 渐进式披露 (paths 匹配)
- [ ] 权限模型 (ask/bubble/allow)
- [ ] Agent 隔离模型 (InProcess/LocalAgent)

### Phase 5: 发布 (Week 5-6)
- [ ] npm 包发布 (@cclaw/cli)
- [ ] README + 文档
- [ ] 安装器 (npm i -g @cclaw/cli)
- [ ] CI/CD (GitHub Actions)

---

## 16. 与 Claude Code / OpenClaw 的关系

```
Claude Code (泄露源码)          OpenClaw/Bronya
       ↓                              ↓
  工程化架构借鉴                  人格/记忆系统借鉴
  - AsyncGenerator 循环          - SOUL.md 人格
  - 6层上下文注入                 - MEMORY.md 4类分类
  - 4级上下文压缩                 - Heartbeat 定时任务
  - Hook 系统                    - Self-Improvement
  - 工具权限模型                  - 动态提醒机制
  - 渐进式 Skill 披露            - 假执行监控
  - Agent 隔离模型                - Dream 后台记忆
  - Session 持久化
       ↓                              ↓
       └──────────┬──────────────────┘
                  ↓
              C.C.Claw
         (融合 + 脱敏 + 开源)
```
