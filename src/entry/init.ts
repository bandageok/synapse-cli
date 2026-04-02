// src/entry/init.ts
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type { ToolDef } from '../core/types.js';
import { createProvider } from '../providers/factory.js';
import { ToolRegistry } from '../core/ToolRegistry.js';
import { ContextBuilder } from '../core/Context.js';
import { Compressor } from '../core/Compressor.js';
import { HookSystem } from '../core/HookSystem.js';
import { SessionStore } from '../core/SessionStore.js';
import { ErrorRecovery } from '../core/ErrorRecovery.js';
import { SoulLoader } from '../soul/SoulLoader.js';
import { MemoryManager } from '../soul/MemoryManager.js';
import { DynamicReminder } from '../soul/DynamicReminder.js';
import { Heartbeat } from '../soul/Heartbeat.js';
import { Dream } from '../soul/Dream.js';
import { FakeExecutionWatchdog } from '../soul/FakeExecutionWatchdog.js';
import { SelfImprovement } from '../soul/SelfImprovement.js';
import { Logger } from '../core/Logger.js';
import { BashTool } from '../tools/BashTool.js';
import { FileReadTool } from '../tools/FileReadTool.js';
import { FileEditTool } from '../tools/FileEditTool.js';
import { FileWriteTool } from '../tools/FileWriteTool.js';
import { GlobTool } from '../tools/GlobTool.js';
import { GrepTool } from '../tools/GrepTool.js';
import { WebSearchTool } from '../tools/WebSearchTool.js';
import { WebFetchTool } from '../tools/WebFetchTool.js';
import { TodoWriteTool } from '../tools/TodoWriteTool.js';
import { AskUserQuestionTool } from '../tools/AskUserQuestionTool.js';
import { SkillTool } from '../tools/SkillTool.js';
import { NotebookReadTool } from '../tools/NotebookReadTool.js';
import { NotebookEditTool } from '../tools/NotebookEditTool.js';
import { GitStatusTool } from '../tools/GitStatusTool.js';
import { GitDiffTool } from '../tools/GitDiffTool.js';
import { GitCommitTool } from '../tools/GitCommitTool.js';
import { PowerShellTool } from '../tools/PowerShellTool.js';
import { ImageReadTool, ImageGenerateTool } from '../tools/ImageTool.js';
import { TtsTool } from '../tools/TtsTool.js';
import { createTaskTool } from '../tools/TaskTool.js';
import { MCPClient } from '../services/mcp/client.js';
import { PluginRegistry } from '../plugins/registry.js';

export async function init(opts: { model?: string; addDir?: string[] }) {
  const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const provider = createProvider(opts.model);
  const tools = new ToolRegistry();
  const logger = new Logger({ dataDir });
  const compressor = new Compressor({ contextWindow: 200_000, model: 'claude-sonnet-4-20250514' });
  const hooks = new HookSystem();
  const sessionStore = new SessionStore(dataDir);
  const errorRecovery = new ErrorRecovery();

  // 基础工具（无依赖）
  const basicTools = [
    BashTool, FileReadTool, FileEditTool, FileWriteTool,
    GlobTool, GrepTool, WebSearchTool, WebFetchTool,
    TodoWriteTool, AskUserQuestionTool, SkillTool,
    NotebookReadTool, NotebookEditTool,
    GitStatusTool, GitDiffTool, GitCommitTool,
    PowerShellTool, ImageReadTool, ImageGenerateTool, TtsTool,
  ] as ToolDef[];
  for (const tool of basicTools) {
    tools.register(tool);
  }

  const soulLoader = new SoulLoader(dataDir);
  const memoryManager = new MemoryManager(dataDir);
  const dynamicReminder = new DynamicReminder();

  const context = new ContextBuilder({ dataDir, cwd: process.cwd(), additionalDirs: opts.addDir, soulLoader });

  // TaskTool 需要注入依赖
  const taskTool = createTaskTool({ provider: provider!, tools, context, hooks, compressor, errorRecovery });
  tools.register(taskTool as ToolDef);

  // MCP 集成（并行连接）
  const mcpClient = new MCPClient();
  const mcpServers = mcpClient.loadConfig(dataDir);
  await Promise.allSettled(mcpServers.map(async (serverConfig) => {
    const mcpTools = await mcpClient.connect(serverConfig);
    for (const mcpTool of mcpTools) {
      tools.register(mcpClient.wrapAsToolDef(mcpTool, serverConfig.name));
    }
  }));

  // Plugin 集成
  const pluginRegistry = new PluginRegistry();
  pluginRegistry.loadFromDir(dataDir);

  // Heartbeat + Dream + Watchdog + SelfImprovement
  const heartbeat = new Heartbeat(dataDir);
  const dream = new Dream(dataDir);
  heartbeat.setDream(dream);
  const watchdog = new FakeExecutionWatchdog();
  const selfImprovement = new SelfImprovement(dataDir);

  return { provider, tools, context, compressor, hooks, sessionStore, errorRecovery, soulLoader, memoryManager, dynamicReminder, heartbeat, dream, watchdog, selfImprovement, mcpClient, pluginRegistry, logger, dataDir };
}
