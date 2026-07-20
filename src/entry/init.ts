// src/entry/init.ts
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type { ToolDef } from '../core/types.js';
import { createProviderFromRuntime } from '../providers/factory.js';
import { resolveProviderRuntime } from '../providers/management.js';
import { ToolRegistry } from '../core/ToolRegistry.js';
import { ContextBuilder } from '../core/Context.js';
import { SkillAutoLoader } from '../skills/AutoLoader.js';
import { Compressor } from '../core/Compressor.js';
import { HookSystem } from '../core/HookSystem.js';
import { SessionStore } from '../core/SessionStore.js';
import { ErrorRecovery } from '../core/ErrorRecovery.js';
import { SoulLoader } from '../soul/SoulLoader.js';
import { MemoryManager } from '../soul/MemoryManager.js';
import { DynamicReminder } from '../soul/DynamicReminder.js';
import { Heartbeat } from '../soul/Heartbeat.js';
import { MemoryMaintenance } from '../soul/MemoryMaintenance.js';
import { FakeExecutionWatchdog } from '../soul/FakeExecutionWatchdog.js';
import { SelfImprovement } from '../soul/SelfImprovement.js';
import { Logger } from '../core/Logger.js';
import { ensureIdentityFile } from '../core/ProductIdentity.js';
import { createBashTool } from '../tools/BashTool.js';
import { FileReadTool } from '../tools/FileReadTool.js';
import { FileEditTool } from '../tools/FileEditTool.js';
import { FileWriteTool } from '../tools/FileWriteTool.js';
import { GlobTool } from '../tools/GlobTool.js';
import { GrepTool } from '../tools/GrepTool.js';
import { WebSearchTool } from '../tools/WebSearchTool.js';
import { createWebFetchTool } from '../tools/WebFetchTool.js';
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

export async function init(opts: { model?: string; addDir?: string[]; permissionMode?: 'ask' | 'workspace-auto'; sandboxBackend?: 'auto' | 'bubblewrap' | 'docker' }) {
  const dataDir = process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  ensureIdentityFile(dataDir);
  const providerRuntime = resolveProviderRuntime(opts.model, dataDir);
  const provider = createProviderFromRuntime(providerRuntime);
  const permissionMode = opts.permissionMode ?? 'ask';
  const tools = new ToolRegistry({ permissionMode });
  tools.initPermissions(dataDir);
  tools.setWorkspaceRoots([process.cwd(), ...(opts.addDir ?? [])]);
  const logger = new Logger({ dataDir });
  const compressor = new Compressor({ contextWindow: 200_000, model: opts.model ?? 'default', provider: provider ?? undefined });
  const hooks = new HookSystem();
  const sessionStore = new SessionStore(join(dataDir, 'sessions'));
  const errorRecovery = new ErrorRecovery();

  // 基础工具（无依赖）
  const basicTools = [
    createBashTool({ sandbox: permissionMode === 'workspace-auto', sandboxBackend: opts.sandboxBackend }),
    FileReadTool, FileEditTool, FileWriteTool,
    GlobTool, GrepTool, WebSearchTool, createWebFetchTool(dataDir),
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

  const skillLoader = new SkillAutoLoader(dataDir);
  // Auto-discover skills in workspace
  skillLoader.rebuild(process.cwd());
  // Auto-match based on current working directory
  skillLoader.autoMatch('', process.cwd());

  const context = new ContextBuilder({
    dataDir,
    cwd: process.cwd(),
    additionalDirs: opts.addDir,
    soulLoader,
    skillLoader,
    runtimeIdentity: providerRuntime ? {
      providerId: providerRuntime.id,
      providerName: providerRuntime.name,
      protocol: providerRuntime.protocol,
      model: providerRuntime.model,
      fallbackModels: providerRuntime.fallbackModels,
    } : undefined,
  });

  // TaskTool 需要注入依赖
  const taskTool = createTaskTool({ provider: provider!, tools, context, hooks, compressor, errorRecovery });
  tools.register(taskTool as ToolDef);

  // MCP 集成（并行连接）
  const mcpClient = new MCPClient(dataDir);
  const mcpServers = mcpClient.loadConfig(dataDir);
  await Promise.allSettled(mcpServers.map(async (serverConfig) => {
    const mcpTools = await mcpClient.connect(serverConfig);
    for (const mcpTool of mcpTools) {
      tools.register(mcpClient.wrapAsToolDef(mcpTool, serverConfig.name));
    }
  }));
  for (const diagnostic of mcpClient.getDiagnostics()) logger.warn(diagnostic);

  // Plugin 集成
  const pluginRegistry = new PluginRegistry();
  pluginRegistry.loadFromDir(dataDir);

  // Heartbeat + deterministic memory maintenance + Watchdog + SelfImprovement
  const heartbeat = new Heartbeat(dataDir);
  const memoryMaintenance = new MemoryMaintenance(dataDir);
  heartbeat.setMemoryMaintenance(memoryMaintenance);
  const watchdog = new FakeExecutionWatchdog();
  const selfImprovement = new SelfImprovement(dataDir);

  return { provider, tools, context, compressor, hooks, sessionStore, errorRecovery, soulLoader, memoryManager, dynamicReminder, heartbeat, memoryMaintenance, watchdog, selfImprovement, mcpClient, pluginRegistry, logger, dataDir, skillLoader };
}
