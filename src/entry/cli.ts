// src/entry/cli.ts
import { Command } from 'commander';

const program = new Command();

program
  .name('cclaw')
  .description('C.C.Claw — Claude Code × Claw agent framework')
  .version('0.2.0');

program
  .command('onboard')
  .description('Interactive setup wizard for first-time configuration')
  .action(async () => {
    const { launchOnboarding } = await import('../ui/Onboarding.js');
    await launchOnboarding();
  });

program
  .command('chat')
  .description('Start interactive chat')
  .option('-m, --model <model>', 'Model to use')
  .option('-p, --pipe', 'Pipe mode: read from stdin, output to stdout')
  .option('-v, --verbose', 'Verbose mode: show full API requests')
  .option('--add-dir <dirs...>', 'Additional directories to load CLAUDE.md from')
  .action(async (opts) => {
    const { init } = await import('./init.js');
    const deps = await init(opts);
    if (!deps.provider) {
      console.error('Error: No API key found. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.');
      process.exit(1);
    }

    // Pipe 模式：从 stdin 读取，输出到 stdout
    if (opts.pipe) {
      const chunks: Buffer[] = [];
      process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
      process.stdin.on('end', async () => {
        const input = Buffer.concat(chunks).toString('utf-8').trim();
        if (!input) {
          console.error('Error: No input from stdin');
          process.exit(1);
        }

        const { createEngine } = await import('../core/Engine.js');
        const messages = [{ role: 'user' as const, content: input }];

        try {
          for await (const event of createEngine(
            messages, deps.provider!, deps.tools, deps.context,
            deps.hooks, deps.compressor, deps.errorRecovery
          )) {
            if (event.type === 'token') {
              process.stdout.write(event.text);
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
      });
      return;
    }

    const { launchREPL } = await import('../ui/REPL.js');
    await launchREPL(deps as Parameters<typeof launchREPL>[0]);
  });

program
  .command('init')
  .description('Initialize ~/.cclaw/ with template config files')
  .action(async () => {
    const { homedir } = await import('os');
    const { join } = await import('path');
    const { mkdirSync, existsSync, copyFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname } = await import('path');

    const dataDir = join(homedir(), '.cclaw');
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

    // templates are relative to dist/cli.js → ../../templates/
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const templateDir = join(__dirname, '..', 'templates');

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
  .action(async () => {
    console.log('Session resume — coming soon');
  });

program
  .command('doctor')
  .description('Diagnose configuration issues')
  .action(async () => {
    const { init } = await import('./init.js');
    const deps = await init({});
    console.log('C.C.Claw Doctor');
    console.log(`  Provider: ${deps.provider?.name ?? 'NONE'}`);
    console.log(`  Data dir: ${deps.dataDir}`);
    console.log(`  SOUL.md: ${deps.soulLoader.load() ? '✅' : '❌'}`);
    console.log(`  Tools: ${deps.tools.schemas().length} registered`);
    console.log(`  Engine: AsyncGenerator v0.2.0`);
    console.log(`  Context: 6-layer builder`);
    console.log(`  Compressor: 4-level defense`);
  });

program
  .command('mcp')
  .description('Manage MCP servers')
  .argument('[action]', 'add | list | remove')
  .argument('[name]', 'Server name')
  .argument('[command]', 'Server command')
  .action(async (action, name, command) => {
    const { homedir } = await import('os');
    const { join } = await import('path');
    const { readFileSync, writeFileSync, existsSync } = await import('fs');
    const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');
    const mcpPath = join(dataDir, '.mcp.json');

    if (action === 'list' || !action) {
      if (!existsSync(mcpPath)) { console.log('No MCP servers configured.'); return; }
      const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
      const servers = config.mcpServers ?? {};
      if (Object.keys(servers).length === 0) { console.log('No MCP servers configured.'); return; }
      for (const [n, v] of Object.entries(servers)) {
        const cfg = v as Record<string, unknown>;
        const cmd = cfg.command as string | undefined;
        const args = cfg.args as string[] | undefined;
        console.log(`  ${n}: ${cmd ?? ''} ${args?.join(' ') ?? ''}`);
      }
    } else if (action === 'add' && name && command) {
      const config = existsSync(mcpPath) ? JSON.parse(readFileSync(mcpPath, 'utf-8')) : { mcpServers: {} };
      config.mcpServers[name] = { command, args: process.argv.slice(6) };
      writeFileSync(mcpPath, JSON.stringify(config, null, 2));
      console.log(`✅ MCP server "${name}" added`);
    } else if (action === 'remove' && name) {
      if (!existsSync(mcpPath)) { console.log('No MCP servers configured.'); return; }
      const config = JSON.parse(readFileSync(mcpPath, 'utf-8'));
      delete config.mcpServers[name];
      writeFileSync(mcpPath, JSON.stringify(config, null, 2));
      console.log(`✅ MCP server "${name}" removed`);
    } else {
      console.log('Usage: cclaw mcp [list|add <name> <command>|remove <name>]');
    }
  });

program
  .command('plugin')
  .description('Manage plugins')
  .argument('[action]', 'list | install | remove')
  .argument('[name]', 'Plugin name')
  .action(async (action, _name) => {
    const { homedir } = await import('os');
    const { join } = await import('path');
    const { readdirSync, readFileSync, existsSync } = await import('fs');
    const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');
    const pluginsDir = join(dataDir, 'plugins');

    if (action === 'list' || !action) {
      if (!existsSync(pluginsDir)) { console.log('No plugins installed.'); return; }
      const dirs = readdirSync(pluginsDir, { withFileTypes: true }).filter(d => d.isDirectory());
      if (dirs.length === 0) { console.log('No plugins installed.'); return; }
      for (const dir of dirs) {
        const manifestPath = join(pluginsDir, dir.name, 'plugin.json');
        if (existsSync(manifestPath)) {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          console.log(`  ${manifest.name}@${manifest.version} — ${manifest.description ?? ''}`);
        } else {
          console.log(`  ${dir.name} (no manifest)`);
        }
      }
    } else {
      console.log('Usage: cclaw plugin [list]');
    }
  });

program
  .command('update')
  .description('Check for updates and update cclaw')
  .option('--check', 'Only check, do not update')
  .action(async (opts) => {
    const { execSync } = await import('child_process');
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const { fileURLToPath } = await import('url');
    const { dirname } = await import('path');

    // 获取本地版本
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dirname, '..', 'package.json');
    let localVersion = '0.0.0';
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      localVersion = pkg.version;
    } catch {}

    console.log(`Current version: ${localVersion}`);

    // 查询 npm registry
    try {
      const resp = await fetch('https://registry.npmjs.org/cclaw/latest');
      if (!resp.ok) {
        console.log('⚠️ Could not check registry. You can manually update with: npm update -g cclaw');
        return;
      }
      const data = (await resp.json()) as { version: string };
      const latestVersion = data.version;

      console.log(`Latest version:  ${latestVersion}`);

      if (localVersion === latestVersion) {
        console.log('✅ Already up to date!');
        return;
      }

      if (opts.check) {
        console.log(`📦 Update available: ${localVersion} → ${latestVersion}`);
        console.log('Run `cclaw update` to install.');
        return;
      }

      console.log(`📦 Updating ${localVersion} → ${latestVersion}...`);
      try {
        execSync('npm update -g cclaw', { stdio: 'inherit' });
        console.log('✅ Update complete! Restart cclaw to use the new version.');
      } catch {
        console.log('⚠️ Auto-update failed. Try manually: npm update -g cclaw');
      }
    } catch {
      console.log('⚠️ Could not check registry. You can manually update with: npm update -g cclaw');
    }
  });

program
  .command('logs')
  .description('Show cclaw logs')
  .option('-f, --follow', 'Follow log output (tail -f)')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .action(async (opts) => {
    const { homedir } = await import('os');
    const { join } = await import('path');
    const { existsSync, readFileSync, watchFile, unwatchFile } = await import('fs');
    const dataDir = process.env.CCLAW_DATA_DIR || join(homedir(), '.cclaw');
    const logPath = join(dataDir, 'logs', 'cclaw.log');

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

program.parse();
