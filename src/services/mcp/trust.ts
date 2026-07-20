import { createHash } from 'crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from 'fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'path';
import type { MCPCapabilityManifest, MCPServerConfig } from './types.js';

interface TrustRecord {
  commandFingerprint: string;
  capabilityFingerprint: string;
  manifest: MCPCapabilityManifest;
  trustedAt: string;
}

interface TrustFile {
  version: 2;
  servers: Record<string, TrustRecord>;
}

export class MCPTrustStore {
  private readonly path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'mcp-trust.json');
  }

  commandFingerprint(config: MCPServerConfig): string {
    const env = Object.fromEntries(Object.entries(config.env ?? {}).sort(([a], [b]) => a.localeCompare(b)));
    const cwd = resolve(config.cwd ?? process.cwd());
    const executable = this.resolveExecutable(config.command, cwd, config.env);
    const referencedFiles = (config.args ?? []).map((arg, index) => {
      if (arg.startsWith('-')) return null;
      const path = isAbsolute(arg) ? arg : resolve(cwd, arg);
      const identity = this.fileIdentity(path);
      return identity ? { index, ...identity } : null;
    }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return digest({
      command: config.command,
      args: config.args ?? [],
      cwd: config.cwd ?? null,
      env,
      executable: executable ? this.fileIdentity(executable) : null,
      referencedFiles,
    });
  }

  capabilityFingerprint(manifest: MCPCapabilityManifest): string {
    return digest(manifest);
  }

  verifyCommand(config: MCPServerConfig): boolean {
    return this.read().servers[config.name]?.commandFingerprint === this.commandFingerprint(config);
  }

  verifyCapabilities(config: MCPServerConfig, manifest: MCPCapabilityManifest): boolean {
    const record = this.read().servers[config.name];
    return record?.commandFingerprint === this.commandFingerprint(config)
      && record.capabilityFingerprint === this.capabilityFingerprint(manifest);
  }

  trust(config: MCPServerConfig, manifest: MCPCapabilityManifest): TrustRecord {
    const file = this.read();
    const record: TrustRecord = {
      commandFingerprint: this.commandFingerprint(config),
      capabilityFingerprint: this.capabilityFingerprint(manifest),
      manifest,
      trustedAt: new Date().toISOString(),
    };
    file.servers[config.name] = record;
    this.write(file);
    return record;
  }

  revoke(name: string): void {
    const file = this.read();
    delete file.servers[name];
    this.write(file);
  }

  status(config: MCPServerConfig): { trusted: boolean; commandFingerprint: string; record?: TrustRecord } {
    const record = this.read().servers[config.name];
    const commandFingerprint = this.commandFingerprint(config);
    return { trusted: record?.commandFingerprint === commandFingerprint, commandFingerprint, record };
  }

  private read(): TrustFile {
    if (!existsSync(this.path)) return { version: 2, servers: {} };
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf-8')) as Partial<TrustFile>;
      return parsed.version === 2 && parsed.servers && typeof parsed.servers === 'object'
        ? { version: 2, servers: parsed.servers }
        : { version: 2, servers: {} };
    } catch {
      return { version: 2, servers: {} };
    }
  }

  private write(file: TrustFile): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(file, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }

  private resolveExecutable(command: string, cwd: string, configuredEnv?: Record<string, string>): string | null {
    const direct = isAbsolute(command) ? command : resolve(cwd, command);
    if ((isAbsolute(command) || /[\\/]/.test(command)) && this.isFile(direct)) return realpathSync.native(direct);

    const mergedPath = configuredEnv?.PATH ?? configuredEnv?.Path ?? process.env.PATH ?? '';
    const extensions = process.platform === 'win32'
      ? (configuredEnv?.PATHEXT ?? process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
      : [''];
    const hasExtension = process.platform !== 'win32' || /\.[A-Za-z0-9]+$/.test(command);
    for (const directory of mergedPath.split(delimiter).filter(Boolean)) {
      const candidates = hasExtension ? [join(directory, command)] : extensions.map(ext => join(directory, `${command}${ext.toLowerCase()}`));
      for (const candidate of candidates) {
        if (this.isFile(candidate)) return realpathSync.native(candidate);
      }
    }
    return null;
  }

  private fileIdentity(path: string): { path: string; size: number; sha256: string } | null {
    if (!this.isFile(path)) return null;
    const realPath = realpathSync.native(path);
    const stat = statSync(realPath);
    const hash = this.hashFile(realPath);
    return { path: realPath, size: stat.size, sha256: hash };
  }

  private hashFile(path: string): string {
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    const descriptor = openSync(path, 'r');
    try {
      let bytesRead = 0;
      do {
        bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
        if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
      } while (bytesRead > 0);
      return hash.digest('hex');
    } finally {
      closeSync(descriptor);
    }
  }

  private isFile(path: string): boolean {
    try {
      return existsSync(path) && statSync(path).isFile();
    } catch {
      return false;
    }
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
