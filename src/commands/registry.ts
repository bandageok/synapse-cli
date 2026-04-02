// src/commands/registry.ts
export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  handler: (args: string, deps: CommandDeps) => Promise<string | void>;
}

export interface CommandDeps {
  dataDir: string;
  model: string;
  setModel: (m: string) => void;
  clearOutput: () => void;
  addOutput: (line: string) => void;
  messages: any[];
  resetMessages: () => void;
  setMessages?: (msgs: any[]) => void;
  turnCount: number;
}

export class CommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(cmd: SlashCommand): void {
    this.commands.set(cmd.name, cmd);
    for (const alias of cmd.aliases ?? []) {
      this.commands.set(alias, cmd);
    }
  }

  get(name: string): SlashCommand | undefined {
    return this.commands.get(name);
  }

  list(): SlashCommand[] {
    const seen = new Set<string>();
    const result: SlashCommand[] = [];
    for (const cmd of this.commands.values()) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        result.push(cmd);
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  async execute(input: string, deps: CommandDeps): Promise<{ handled: boolean; output?: string }> {
    if (!input.startsWith('/')) return { handled: false };
    const trimmed = input.slice(1).trim();
    const spaceIdx = trimmed.indexOf(' ');
    const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);

    const cmd = this.commands.get(name);
    if (!cmd) {
      return { handled: true, output: `Unknown command: /${name}. Type /help for available commands.` };
    }

    const result = await cmd.handler(args, deps);
    return { handled: true, output: result ?? undefined };
  }
}
