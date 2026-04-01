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
import { BashTool } from '../tools/BashTool.js';
import { FileReadTool } from '../tools/FileReadTool.js';
import { FileEditTool } from '../tools/FileEditTool.js';
import { FileWriteTool } from '../tools/FileWriteTool.js';
import { GlobTool } from '../tools/GlobTool.js';
import { GrepTool } from '../tools/GrepTool.js';
import { WebSearchTool } from '../tools/WebSearchTool.js';
import { WebFetchTool } from '../tools/WebFetchTool.js';
import { AgentTool } from '../tools/AgentTool.js';
import { TodoWriteTool } from '../tools/TodoWriteTool.js';
import { AskUserQuestionTool } from '../tools/AskUserQuestionTool.js';
import { SkillTool } from '../tools/SkillTool.js';

export async function init(opts: { model?: string }) {
  const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const provider = createProvider();
  const tools = new ToolRegistry();

  const allTools = [BashTool, FileReadTool, FileEditTool, FileWriteTool, GlobTool, GrepTool, WebSearchTool, WebFetchTool, AgentTool, TodoWriteTool, AskUserQuestionTool, SkillTool] as ToolDef[];
  for (const tool of allTools) {
    tools.register(tool);
  }

  const context = new ContextBuilder({ dataDir, cwd: process.cwd() });
  const compressor = new Compressor({ contextWindow: 200_000, model: opts.model ?? 'default' });
  const hooks = new HookSystem();
  const sessionStore = new SessionStore(join(dataDir, 'sessions'));
  const errorRecovery = new ErrorRecovery();
  const soulLoader = new SoulLoader(dataDir);
  const memoryManager = new MemoryManager(dataDir);
  const dynamicReminder = new DynamicReminder();

  return { provider, tools, context, compressor, hooks, sessionStore, errorRecovery, soulLoader, memoryManager, dynamicReminder, dataDir };
}
