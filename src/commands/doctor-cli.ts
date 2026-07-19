import { constants, accessSync, existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { Command } from 'commander';
import {
  getSynapseDataDir,
  readSynapseConfig,
  resolveProviderRuntime,
  testProvider,
} from '../providers/management.js';

export type DoctorStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorStatus;
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  version: string;
  dataDir: string;
  checks: DoctorCheck[];
}

function check(
  checks: DoctorCheck[],
  id: string,
  label: string,
  status: DoctorStatus,
  detail: string,
): void {
  checks.push({ id, label, status, detail });
}

function inspectMcpConfig(dataDir: string, checks: DoctorCheck[]): void {
  const path = join(dataDir, '.mcp.json');
  if (!existsSync(path)) {
    check(checks, 'mcp-config', 'MCP config', 'pass', 'No MCP servers configured');
    return;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('configuration root must be an object');
    }
    const servers = (parsed as { mcpServers?: unknown }).mcpServers;
    if (servers !== undefined && (!servers || typeof servers !== 'object' || Array.isArray(servers))) {
      throw new Error('mcpServers must be an object');
    }
    check(
      checks,
      'mcp-config',
      'MCP config',
      'pass',
      `${Object.keys((servers as Record<string, unknown> | undefined) ?? {}).length} server(s) configured`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(checks, 'mcp-config', 'MCP config', 'fail', `Invalid .mcp.json: ${message}`);
  }
}

function inspectPlugins(dataDir: string, checks: DoctorCheck[]): void {
  const pluginsDir = join(dataDir, 'plugins');
  if (!existsSync(pluginsDir)) {
    check(checks, 'plugins', 'Plugins', 'pass', 'No plugins installed');
    return;
  }
  const directories = readdirSync(pluginsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.isSymbolicLink());
  const invalid: string[] = [];
  for (const directory of directories) {
    const manifestPath = join(pluginsDir, directory.name, 'plugin.json');
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { name?: unknown; version?: unknown };
      if (typeof manifest.name !== 'string' || !manifest.name.trim()
        || typeof manifest.version !== 'string' || !manifest.version.trim()) {
        invalid.push(directory.name);
      }
    } catch {
      invalid.push(directory.name);
    }
  }
  check(
    checks,
    'plugins',
    'Plugins',
    invalid.length ? 'fail' : 'pass',
    invalid.length
      ? `Invalid plugin manifest(s): ${invalid.join(', ')}`
      : `${directories.length} plugin(s) installed`,
  );
}

export async function runDoctor(options: {
  dataDir?: string;
  live?: boolean;
  version: string;
}): Promise<DoctorReport> {
  const dataDir = options.dataDir ?? getSynapseDataDir();
  const checks: DoctorCheck[] = [];
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
  check(
    checks,
    'node-version',
    'Node.js',
    nodeMajor >= 18 ? 'pass' : 'fail',
    `${process.versions.node}${nodeMajor >= 18 ? '' : ' (requires 18 or newer)'}`,
  );

  if (!existsSync(dataDir)) {
    check(checks, 'data-dir', 'Data directory', 'warn', `${dataDir} does not exist; run synapse init`);
  } else {
    try {
      if (!statSync(dataDir).isDirectory()) throw new Error('path is not a directory');
      accessSync(dataDir, constants.R_OK | constants.W_OK);
      check(checks, 'data-dir', 'Data directory', 'pass', `${dataDir} is readable and writable`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      check(checks, 'data-dir', 'Data directory', 'fail', `${dataDir}: ${message}`);
    }
  }

  let configValid = true;
  const configPath = join(dataDir, '.synapse.json');
  try {
    readSynapseConfig(dataDir);
    check(
      checks,
      'provider-config',
      'Provider config',
      existsSync(configPath) ? 'pass' : 'warn',
      existsSync(configPath) ? `${configPath} is valid` : 'No .synapse.json; environment auto-detection will be used',
    );
  } catch (error) {
    configValid = false;
    const message = error instanceof Error ? error.message : String(error);
    check(checks, 'provider-config', 'Provider config', 'fail', message);
  }

  let runtime = null;
  let runtimeResolutionFailed = false;
  if (configValid) {
    try {
      runtime = resolveProviderRuntime(undefined, dataDir);
    } catch (error) {
      runtimeResolutionFailed = true;
      const message = error instanceof Error ? error.message : String(error);
      check(checks, 'provider-runtime', 'Provider', 'fail', message);
    }
  }
  if (!runtime && !runtimeResolutionFailed) {
    check(
      checks,
      'provider-runtime',
      'Provider',
      'fail',
      'No usable provider; run synapse provider set <provider>',
    );
  } else if (runtime && !runtime.apiKey) {
    check(
      checks,
      'provider-runtime',
      'Provider',
      'fail',
      `${runtime.id} (${runtime.protocol}) is missing ${runtime.keyName}`,
    );
  } else if (runtime) {
    check(
      checks,
      'provider-runtime',
      'Provider',
      'pass',
      `${runtime.id} / ${runtime.model} via ${runtime.keySource} (${runtime.keyName})`,
    );
  }

  for (const file of ['SOUL.md', 'MEMORY.md']) {
    check(
      checks,
      `file-${file.toLowerCase()}`,
      file,
      existsSync(join(dataDir, file)) ? 'pass' : 'warn',
      existsSync(join(dataDir, file)) ? 'Available' : `Missing; run synapse init to create it`,
    );
  }

  if (existsSync(dataDir)) {
    inspectMcpConfig(dataDir, checks);
    inspectPlugins(dataDir, checks);
  }

  if (options.live && runtime?.apiKey) {
    try {
      const result = await testProvider({ dataDir });
      check(
        checks,
        'provider-live',
        'Provider connection',
        'pass',
        `${result.endpoint} responded in ${result.latencyMs}ms`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      check(checks, 'provider-live', 'Provider connection', 'fail', message);
    }
  }

  return {
    ok: checks.every(item => item.status !== 'fail'),
    version: options.version,
    dataDir,
    checks,
  };
}

export function printDoctorReport(report: DoctorReport): void {
  console.log(`Synapse Doctor v${report.version}`);
  for (const item of report.checks) {
    console.log(`  [${item.status.toUpperCase()}] ${item.label}: ${item.detail}`);
  }
  const passed = report.checks.filter(item => item.status === 'pass').length;
  const warnings = report.checks.filter(item => item.status === 'warn').length;
  const failed = report.checks.filter(item => item.status === 'fail').length;
  console.log(`\nResult: ${report.ok ? 'ready' : 'action required'} (${passed} passed, ${warnings} warnings, ${failed} failed)`);
}

export function registerDoctorCli(program: Command, version: string): void {
  program
    .command('doctor')
    .description('Diagnose local configuration and provider readiness')
    .option('--live', 'Send a minimal request to the active provider')
    .option('--json', 'Output machine-readable JSON')
    .action(async (options: { live?: boolean; json?: boolean }) => {
      try {
        const report = await runDoctor({
          dataDir: getSynapseDataDir(),
          live: Boolean(options.live),
          version,
        });
        if (options.json) console.log(JSON.stringify(report, null, 2));
        else printDoctorReport(report);
        if (!report.ok) process.exitCode = 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.json) {
          console.log(JSON.stringify({ ok: false, version, error: message }, null, 2));
        } else {
          console.error(`Error: ${message}`);
        }
        process.exitCode = 1;
      }
    });
}
