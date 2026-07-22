// src/entry/cli.ts
import { Command } from 'commander';
import type { Message } from '../core/types.js';
import { registerDoctorCli } from '../commands/doctor-cli.js';
import { registerMemoryCli } from '../commands/memory-cli.js';
import { registerProviderCli } from '../commands/provider-cli.js';
import { registerPermissionsCli } from '../commands/permissions-cli.js';
import { PERMISSION_PROFILES, resolvePermissionModeSelection } from '../core/PermissionManager.js';
import { getConfiguredPermissionMode } from '../utils/permissionConfig.js';
import { compareVersions } from '../utils/semver.js';
import { findTemplateDir } from '../utils/templates.js';
import { VERSION } from '../version.js';
import { answerSkillInventoryQuery } from '../skills/query.js';
import { resolveRateLimitRetries } from '../core/retry.js';
import { declaredPluginCapabilities, parsePluginManifest } from '../plugins/manifest.js';

const program = new Command();

program
  .name('synapse')
  .description('Synapse — multi-provider agentic coding CLI')
  .version(VERSION);

registerProviderCli(program);
registerMemoryCli(program);
registerDoctorCli(program, VERSION);
registerPermissionsCli(program);

program
  .command('network')
  .description('Manage outbound domain allowlist')
  .argument('[action]', 'list | allow | remove')
  .argument('[domain]', 'Exact domain or wildcard such as *.example.com')
  .action(async (action, domain) => {
    const { homedir } = await import('os');
    const { join } = await import('path');
    const { NetworkPolicy } = await import('../security/NetworkPolicy.js');
    const dataDir = process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse');
    const policy = new NetworkPolicy(dataDir);
    if (action === 'allow' && domain) {
      policy.allowDomain(domain);
      console.log(`Allowed outbound domain: ${domain}`);
    } else if (action === 'remove' && domain) {
      policy.removeDomain(domain);
      console.log(`Removed outbound domain: ${domain}`);
    } else if (action === 'list' || !action) {
      const config = policy.load();
      console.log(`HTTP: ${config.allowHttp ? 'allowed' : 'blocked'}`);
      for (const item of config.allowedDomains) console.log(`  ${item}`);
      if (config.allowedDomains.length === 0) console.log('  (no domains allowed)');
    } else {
      console.log('Usage: synapse network [list|allow <domain>|remove <domain>]');
    }
  });

program
  .command('onboard')
  .description('Interactive setup wizard for first-time configuration')
  .action(async () => {
    const { launchOnboarding } = await import('../ui/Onboarding.js');
    await launchOnboarding();
  });

program
  .command('chat')
  .alias('exec')
  .description('Start an interactive session or run a bounded task')
  .argument('[prompt...]', 'Optional task to submit immediately')
  .option('-m, --model <model>', 'Model to use')
  .option('-p, --pipe', 'Pipe mode: read from stdin, output to stdout')
  .option('-v, --verbose', 'Verbose mode: show full API requests')
  .option('--add-dir <dirs...>', 'Additional trusted roots for AGENTS.md, CLAUDE.md, and .synapse/rules')
  .option('--permission-mode <mode>', 'Permission mode: ask | auto | full-access')
  .option('--yolo', 'Alias for --permission-mode full-access')
  .option('--sandbox-backend <backend>', 'Strict sandbox backend: auto | bubblewrap | docker', 'auto')
  .action(async (promptParts: string[], opts) => {
    if (process.argv[2] === 'exec') opts.pipe = true;
    const { join } = await import('path');
    const { homedir } = await import('os');
    const { existsSync, readFileSync } = await import('fs');
    const dataDir = process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse');
    const cfgPath = join(dataDir, '.synapse.json');

    // 检测配置：无文件或关键字段空 → 引导 onboard
    let needOnboard = false;
    if (!existsSync(cfgPath)) {
      needOnboard = true;
    } else {
      try {
        const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
        if (!cfg.model || !cfg.model.trim() || !cfg.provider) {
          needOnboard = true;
        }
      } catch {
        needOnboard = true;
      }
    }

    if (needOnboard) {
      if (opts.pipe || !process.stdin.isTTY) {
        console.error('Error: Synapse is not configured. Run `synapse onboard` in an interactive terminal or configure a provider with `synapse provider set`.');
        process.exit(1);
      }
      const { launchOnboarding } = await import('../ui/Onboarding.js');
      const result = await launchOnboarding();
      if (!result) {
        console.log('  Configuration cancelled. Run `synapse onboard` to retry.');
        process.exit(0);
      }
    }
    let permissionMode;
    try {
      permissionMode = resolvePermissionModeSelection(opts, getConfiguredPermissionMode(dataDir));
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    }
    opts.permissionMode = permissionMode;
    const permissionWarning = PERMISSION_PROFILES[permissionMode].warning;
    if (permissionWarning) process.stderr.write(`Warning: ${permissionWarning}\n`);
    if (!['auto', 'bubblewrap', 'docker'].includes(opts.sandboxBackend)) {
      console.error('Error: --sandbox-backend must be auto, bubblewrap, or docker.');
      process.exit(2);
    }
    const { init } = await import('./init.js');
    const deps = await init(opts);
    if (!deps.provider) {
      console.error('Error: No API key found. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.');
      process.exit(1);
    }

    // Pipe 模式：从 stdin 读取，输出到 stdout
    if (opts.pipe) {
      const runInput = async (input: string) => {
        if (!input) {
          console.error('Error: No prompt argument or input from stdin');
          process.exit(1);
        }

        const localAnswer = answerSkillInventoryQuery(input, deps.skillLoader, process.cwd());
        if (localAnswer) {
          process.stdout.write(localAnswer + '\n');
          return;
        }

        const { createEngine } = await import('../core/Engine.js');
        const messages = [{ role: 'user' as const, content: input }];

        try {
          const rateLimitRetries = resolveRateLimitRetries(process.env.SYNAPSE_RATE_LIMIT_RETRIES, 8);
          for await (const event of createEngine(
            messages, deps.provider!, deps.tools, deps.context,
            deps.hooks, deps.compressor, deps.errorRecovery,
            { logger: deps.logger, rateLimitRetries }
          )) {
            if (event.type === 'token') {
              process.stdout.write(event.text);
            } else if (event.type === 'retrying') {
              process.stderr.write(
                `\nRate limited; retrying ${event.attempt}/${event.maxAttempts ?? 'unlimited'} in ${Math.ceil(event.delayMs / 1000)}s...\n`,
              );
            } else if (event.type === 'tool_use' && opts.verbose) {
              process.stderr.write(`\n🔧 ${event.tool}\n`);
            } else if (event.type === 'tool_result' && opts.verbose) {
              process.stderr.write(`  → ${event.output.slice(0, 200)}\n`);
            } else if (event.type === 'error') {
              process.stderr.write(`\n❌ ${event.error}\n`);
              process.exit(1);
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`\n❌ ${msg}\n`);
          process.exit(1);
        }
      };

      const directInput = promptParts.join(' ').trim();
      if (directInput) {
        await runInput(directInput);
        return;
      }
      const chunks: Buffer[] = [];
      process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
      process.stdin.on('end', async () => {
        await runInput(Buffer.concat(chunks).toString('utf-8').trim());
      });
      return;
    }

    const { launchREPL } = await import('../ui/REPL.js');
    await launchREPL({
      ...deps,
      initialPrompt: promptParts.join(' ').trim() || undefined,
    } as Parameters<typeof launchREPL>[0]);
  });

program
  .command('init')
  .description('Initialize ~/.synapse/ with template config files')
  .action(async () => {
    const { homedir } = await import('os');
    const { join } = await import('path');
    const { mkdirSync, existsSync, copyFileSync } = await import('fs');
    const dataDir = process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse');
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

    const templateDir = findTemplateDir();

    const files = [
      { src: 'SOUL.md', dst: 'SOUL.md' },
      { src: 'USER.md', dst: 'USER.md' },
      { src: 'IDENTITY.md', dst: 'IDENTITY.md' },
      { src: 'MEMORY.md', dst: 'MEMORY.md' },
      { src: 'HEARTBEAT.md', dst: 'HEARTBEAT.md' },
      { src: 'TOOLS.md', dst: 'TOOLS.md' },
    ];

    let created = 0;
    let skipped = 0;
    for (const { src, dst } of files) {
      const dstPath = join(dataDir, dst);
      if (existsSync(dstPath)) {
        console.log(`  ⏭  ${dst} already exists, skipping`);
        skipped++;
      } else {
        copyFileSync(join(templateDir, src), dstPath);
        console.log(`  ✅ ${dst} created`);
        created++;
      }
    }

    // Create memory/ and sessions/ dirs
    for (const dir of ['memory', 'sessions']) {
      const dirPath = join(dataDir, dir);
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
        console.log(`  ✅ ${dir}/ directory created`);
      }
    }

    console.log(`\nDone. ${created} files created, ${skipped} skipped.`);
    console.log(`Edit ${join(dataDir, 'SOUL.md')} to define your agent's personality.`);
  });

program
  .command('resume')
  .description('Resume a previous session')
  .argument('[session]', 'Session id or recent-session number')
  .option('--last', 'Resume the most recently updated session')
  .option('--permission-mode <mode>', 'Permission mode: ask | auto | full-access')
  .option('--yolo', 'Alias for --permission-mode full-access')
  .action(async (session: string | undefined, opts: { last?: boolean; permissionMode?: string; yolo?: boolean }) => {
    const { homedir } = await import('os');
    const { join, basename } = await import('path');
    const { existsSync, readdirSync, readFileSync } = await import('fs');
    const dataDir = process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse');
    const sessionsDir = join(dataDir, 'sessions');

    if (!existsSync(sessionsDir)) {
      console.log('No sessions found.');
      return;
    }

    const entries = readdirSync(sessionsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        try {
          const data = JSON.parse(readFileSync(join(sessionsDir, file), 'utf-8'));
          return { file, data };
        } catch {
          return null;
        }
      })
      .filter((entry): entry is { file: string; data: { messages?: unknown[]; metadata?: { id?: string; updatedAt?: string; model?: string; turnCount?: number } } } => entry !== null)
      .sort((a, b) => (b.data.metadata?.updatedAt ?? '').localeCompare(a.data.metadata?.updatedAt ?? ''));

    if (entries.length === 0) {
      console.log('No sessions found.');
      return;
    }

    if (session && opts.last) {
      console.error('Error: provide either a session id or --last, not both.');
      process.exit(2);
    }

    if (!session && !opts.last) {
      console.log('Recent sessions:');
      for (const [index, entry] of entries.slice(0, 10).entries()) {
        const meta = entry.data.metadata;
        console.log(`  ${index + 1}. ${meta?.id ?? basename(entry.file, '.json')} (${meta?.turnCount ?? 0} turns, ${meta?.model ?? '?'})`);
      }
      console.log('\nUsage: synapse resume <number|session-id>');
      return;
    }

    const numeric = session ? Number.parseInt(session, 10) : Number.NaN;
    const selected = opts.last
      ? entries[0]
      : Number.isInteger(numeric) && String(numeric) === session
        ? entries[numeric - 1]
        : entries.find(entry =>
            entry.data.metadata?.id === session ||
            basename(entry.file, '.json') === session
          );

    if (!selected) {
      console.error(`Session not found: ${session}`);
      process.exit(1);
    }

    if (!Array.isArray(selected.data.messages)) {
      console.error(`Session is invalid: ${selected.data.metadata?.id ?? selected.file}`);
      process.exit(1);
    }

    const { init } = await import('./init.js');
    let resumePermissionMode;
    try {
      resumePermissionMode = resolvePermissionModeSelection(opts, getConfiguredPermissionMode(dataDir));
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(2);
    }
    const resumeWarning = PERMISSION_PROFILES[resumePermissionMode].warning;
    if (resumeWarning) process.stderr.write(`Warning: ${resumeWarning}\n`);
    const deps = await init({
      permissionMode: resumePermissionMode,
      model: selected.data.metadata?.model,
    });
    if (!deps.provider) {
      console.error('Error: No API key found. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.');
      process.exit(1);
    }
    const provider = deps.provider;

    const { launchREPL } = await import('../ui/REPL.js');
    await launchREPL({
      ...deps,
      provider,
      initialMessages: selected.data.messages as Message[],
      initialSessionId: selected.data.metadata?.id ?? basename(selected.file, '.json'),
    });
  });

program
  .command('mcp')
  .description('Manage MCP servers')
  .argument('[action]', 'add | list | remove | trust | untrust')
  .argument('[name]', 'Server name')
  .argument('[command]', 'Server command')
  .argument('[args...]', 'Server arguments')
  .action(async (action, name, command, args: string[] = []) => {
    const { homedir } = await import('os');
    const { join } = await import('path');
    const { readFileSync, writeFileSync, existsSync } = await import('fs');
    const { MCPClient } = await import('../services/mcp/client.js');
    const { MCPTrustStore } = await import('../services/mcp/trust.js');
    const dataDir = process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse');
    const mcpPath = join(dataDir, '.mcp.json');
    const client = new MCPClient(dataDir);
    const trustStore = new MCPTrustStore(dataDir);
    const configured = () => client.loadConfig(dataDir);

    if (action === 'list' || !action) {
      if (!existsSync(mcpPath)) { console.log('No MCP servers configured.'); return; }
      const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
      const servers = config.mcpServers ?? {};
      if (Object.keys(servers).length === 0) { console.log('No MCP servers configured.'); return; }
      for (const [n, v] of Object.entries(servers)) {
        const cfg = v as Record<string, unknown>;
        const cmd = cfg.command as string | undefined;
        const serverArgs = cfg.args as string[] | undefined;
        const server = configured().find(item => item.name === n);
        const trusted = server ? trustStore.status(server).trusted : false;
        console.log(`  ${n}: ${cmd ?? ''} ${serverArgs?.join(' ') ?? ''} [${trusted ? 'trusted' : 'UNTRUSTED'}]`);
      }
    } else if (action === 'add' && name && command) {
      const config = existsSync(mcpPath) ? JSON.parse(readFileSync(mcpPath, 'utf-8')) : { mcpServers: {} };
      config.mcpServers[name] = { command, args };
      writeFileSync(mcpPath, JSON.stringify(config, null, 2));
      trustStore.revoke(name);
      console.log(`✅ MCP server "${name}" added`);
    } else if (action === 'remove' && name) {
      if (!existsSync(mcpPath)) { console.log('No MCP servers configured.'); return; }
      const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
      delete config.mcpServers[name];
      writeFileSync(mcpPath, JSON.stringify(config, null, 2));
      trustStore.revoke(name);
      console.log(`✅ MCP server "${name}" removed`);
    } else if (action === 'trust' && name) {
      const server = configured().find(item => item.name === name);
      if (!server) { console.error(`MCP server not found or invalid: ${name}`); process.exitCode = 1; return; }
      console.log(`Inspecting MCP command fingerprint ${trustStore.commandFingerprint(server)} ...`);
      const result = await client.inspectAndTrust(server, dataDir);
      console.log(`Trusted ${name}`);
      console.log(`  capabilities: ${result.manifest.capabilities.join(', ') || '(none)'}`);
      console.log(`  tools: ${result.manifest.tools.join(', ') || '(none)'}`);
      console.log(`  resources: ${result.manifest.resources.join(', ') || '(none)'}`);
      console.log(`  prompts: ${result.manifest.prompts.join(', ') || '(none)'}`);
      console.log(`  capability fingerprint: ${result.capabilityFingerprint}`);
    } else if (action === 'untrust' && name) {
      trustStore.revoke(name);
      console.log(`MCP server "${name}" trust revoked`);
    } else {
      console.log('Usage: synapse mcp [list|add <name> <command>|remove <name>|trust <name>|untrust <name>]');
    }
  });

program
  .command('plugin')
  .description('Inspect and manage manifest-only plugin packages')
  .argument('[action]', 'list | install | remove')
  .argument('[target]', 'Plugin name or local plugin directory')
  .action(async (action, target) => {
    const { homedir } = await import('os');
    const { join, resolve, relative, isAbsolute } = await import('path');
    const { readdirSync, readFileSync, existsSync, mkdirSync, cpSync, rmSync } = await import('fs');
    const dataDir = process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse');
    const pluginsDir = join(dataDir, 'plugins');
    const isInside = (base: string, child: string) => {
      const rel = relative(resolve(base), resolve(child));
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    };

    if (action === 'list' || !action) {
      if (!existsSync(pluginsDir)) { console.log('No plugins installed.'); return; }
      const dirs = readdirSync(pluginsDir, { withFileTypes: true }).filter(d => d.isDirectory());
      if (dirs.length === 0) { console.log('No plugins installed.'); return; }
      for (const dir of dirs) {
        const manifestPath = join(pluginsDir, dir.name, 'plugin.json');
        if (existsSync(manifestPath)) {
          try {
            const manifest = parsePluginManifest(JSON.parse(readFileSync(manifestPath, 'utf-8')));
            const declared = declaredPluginCapabilities(manifest);
            console.log(`  ${manifest.name}@${manifest.version} [manifest-only; inactive]${declared.length ? ` declares ${declared.join(', ')}` : ''}`);
          } catch {
            console.log(`  ${dir.name} [invalid manifest; inactive]`);
          }
        } else {
          console.log(`  ${dir.name} (no manifest)`);
        }
      }
    } else if (action === 'install' && target) {
      const sourceDir = resolve(target);
      const manifestPath = join(sourceDir, 'plugin.json');
      if (!existsSync(manifestPath)) {
        console.error(`Plugin manifest not found: ${manifestPath}`);
        process.exit(1);
      }
      let manifest: ReturnType<typeof parsePluginManifest>;
      try {
        manifest = parsePluginManifest(JSON.parse(readFileSync(manifestPath, 'utf-8')));
      } catch (error) {
        console.error(`Invalid plugin.json: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
      if (!existsSync(pluginsDir)) mkdirSync(pluginsDir, { recursive: true });
      const destination = resolve(pluginsDir, manifest.name);
      if (!isInside(pluginsDir, destination)) {
        console.error(`Invalid plugin name: ${manifest.name}`);
        process.exit(1);
      }
      if (existsSync(destination)) {
        console.error(`Plugin already installed: ${manifest.name}`);
        process.exit(1);
      }
      cpSync(sourceDir, destination, { recursive: true });
      console.log(`Plugin "${manifest.name}" installed as a manifest-only package.`);
      console.log('Executable plugin commands, skills, and hooks remain inactive until a trusted runtime is implemented.');
    } else if (action === 'remove' && target) {
      if (!existsSync(pluginsDir)) { console.log('No plugins installed.'); return; }
      const dirs = readdirSync(pluginsDir, { withFileTypes: true }).filter(d => d.isDirectory());
      const match = dirs.find(dir => {
        if (dir.name === target) return true;
        const manifestPath = join(pluginsDir, dir.name, 'plugin.json');
        if (!existsSync(manifestPath)) return false;
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { name?: string };
          return manifest.name === target;
        } catch {
          return false;
        }
      });
      if (!match) {
        console.error(`Plugin not found: ${target}`);
        process.exit(1);
      }
      const destination = resolve(pluginsDir, match.name);
      if (!isInside(pluginsDir, destination)) {
        console.error(`Refusing to remove path outside plugin directory: ${destination}`);
        process.exit(1);
      }
      rmSync(destination, { recursive: true, force: true });
      console.log(`✅ Plugin "${target}" removed`);
    } else {
      console.log('Usage: synapse plugin [list|install <local-dir>|remove <name>]');
    }
  });

program
  .command('update')
  .description('Check for and install Synapse updates')
  .option('--check', 'Only check, do not update')
  .action(async (opts) => {
    const { execSync } = await import('child_process');
    const localVersion = VERSION;

    console.log(`Current version: ${localVersion}`);

    // 查询 npm registry
    try {
      const registryUrl = process.env.SYNAPSE_REGISTRY_URL || 'https://registry.npmjs.org/@bandageok%2fsynapse-cli/latest';
      const resp = await fetch(registryUrl);
      if (!resp.ok) {
        console.log('Could not check registry. Update manually with: npm update -g @bandageok/synapse-cli');
        return;
      }
      const data = (await resp.json()) as { version: string };
      const latestVersion = data.version;

      console.log(`Latest version:  ${latestVersion}`);

      const comparison = compareVersions(latestVersion, localVersion);
      if (comparison === 0) {
        console.log('✅ Already up to date!');
        return;
      }
      if (comparison < 0) {
        console.log('Installed version is newer than the registry version; no update needed.');
        return;
      }

      if (opts.check) {
        console.log(`📦 Update available: ${localVersion} → ${latestVersion}`);
        console.log('Run `synapse update` to install.');
        return;
      }

      console.log(`📦 Updating ${localVersion} → ${latestVersion}...`);
      try {
        execSync('npm update -g @bandageok/synapse-cli', { stdio: 'inherit' });
        console.log('✅ Update complete! Restart synapse to use the new version.');
      } catch {
        console.log('Auto-update failed. Try manually: npm update -g @bandageok/synapse-cli');
      }
    } catch {
      console.log('Could not check registry. Update manually with: npm update -g @bandageok/synapse-cli');
    }
  });

program
  .command('logs')
  .description('Show synapse logs')
  .option('-f, --follow', 'Follow log output (tail -f)')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .action(async (opts) => {
    const { homedir } = await import('os');
    const { join } = await import('path');
    const { existsSync, readFileSync, watchFile, unwatchFile } = await import('fs');
    const dataDir = process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse');
    const logPath = join(dataDir, 'logs', 'synapse.log');

    if (!existsSync(logPath)) {
      console.log('No log file found. Logs are created during chat sessions.');
      return;
    }

    const lines = parseInt(opts.lines, 10) || 50;
    const content = readFileSync(logPath, 'utf-8');
    const logLines = content.split('\n').filter(Boolean);
    const recent = logLines.slice(-lines);

    console.log(`--- Last ${lines} lines of ${logPath} ---`);
    for (const line of recent) {
      console.log(line);
    }

    if (opts.follow) {
      console.log('\n--- Following log (Ctrl+C to stop) ---');
      let lastSize = content.length;

      watchFile(logPath, { interval: 1000 }, (curr) => {
        if (curr.size > lastSize) {
          const newContent = readFileSync(logPath, 'utf-8');
          const newLines = newContent.slice(lastSize).split('\n').filter(Boolean);
          for (const line of newLines) {
            console.log(line);
          }
          lastSize = curr.size;
        }
      });

      // 保持进程运行
      process.on('SIGINT', () => {
        unwatchFile(logPath);
        process.exit(0);
      });
    }
  });

const cliArgs = process.argv.slice(2);
const firstArg = cliArgs[0];
const commandNames = new Set(program.commands.flatMap(command => [command.name(), ...command.aliases()]));
if (!firstArg || (!firstArg.startsWith('-') && !commandNames.has(firstArg))) {
  process.argv.splice(2, 0, 'chat');
}

await program.parseAsync();
