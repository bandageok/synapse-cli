// src/core/Context.ts
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface ContextConfig {
  dataDir: string;   // ~/.cclaw/
  cwd: string;       // current working directory
}

export class ContextBuilder {
  constructor(private config: ContextConfig) {}

  async build(turnCount: number): Promise<string[]> {
    return [
      this.layer1_defaultPrompt(),
      this.layer2_soul(),
      this.layer3_memoryMechanics(),
      this.layer4_userContext(),
      this.layer5_systemContext(),
      this.layer6_dynamicReminders(turnCount),
    ];
  }

  private layer1_defaultPrompt(): string {
    return `You are C.C.Claw, an agentic CLI assistant. You have access to tools and should use them to help the user.
Follow these principles:
- Be concise and direct
- Use tools to verify information, never guess
- If a task requires multiple steps, create a plan first
- Report errors with root cause analysis`;
  }

  private layer2_soul(): string {
    const soulPath = join(this.config.dataDir, 'SOUL.md');
    if (existsSync(soulPath)) {
      return readFileSync(soulPath, 'utf-8');
    }
    return '';
  }

  private layer3_memoryMechanics(): string {
    return `## Memory System
You have access to a persistent memory system:
- MEMORY.md contains long-term memory (always loaded)
- memory/ directory contains daily logs
- Use the memory system to remember user preferences and project context
- IMPORTANT: Never fabricate or assume memory content. Only reference what exists.`;
  }

  private layer4_userContext(): string {
    const parts: string[] = [];

    // User-level .cclaw.md
    const userConfig = join(this.config.dataDir, '.cclaw.md');
    if (existsSync(userConfig)) {
      parts.push(readFileSync(userConfig, 'utf-8'));
    }

    // Project-level .cclaw.md
    const projectConfig = join(this.config.cwd, '.cclaw.md');
    if (existsSync(projectConfig)) {
      parts.push(readFileSync(projectConfig, 'utf-8'));
    }

    // MEMORY.md (200 line limit)
    const memoryPath = join(this.config.dataDir, 'MEMORY.md');
    if (existsSync(memoryPath)) {
      const memory = readFileSync(memoryPath, 'utf-8');
      if (memory.split('\n').length <= 200) {
        parts.push(`## Long-Term Memory\n${memory}`);
      }
    }

    return parts.join('\n\n');
  }

  private layer5_systemContext(): string {
    const parts: string[] = [];
    parts.push(`Working directory: ${this.config.cwd}`);
    parts.push(`Platform: ${process.platform}`);
    parts.push(`Node: ${process.version}`);
    return parts.join('\n');
  }

  private layer6_dynamicReminders(turnCount: number): string {
    if (turnCount <= 1) return '';

    const reminders: string[] = [];

    if (turnCount % 3 === 0) {
      reminders.push(`[Turn ${turnCount}] Review your progress. Are you still on track with the original task?`);
    }

    return reminders.join('\n');
  }
}
