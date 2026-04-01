// src/entry/cli.ts
import { Command } from 'commander';

const program = new Command();

program
  .name('cclaw')
  .description('C.C.Claw — Claude Code × Claw agent framework')
  .version('0.2.0');

program
  .command('chat')
  .description('Start interactive chat')
  .option('-m, --model <model>', 'Model to use')
  .action(async (opts) => {
    const { init } = await import('./init.js');
    const deps = await init(opts);
    if (!deps.provider) {
      console.error('Error: No API key found. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.');
      process.exit(1);
    }
    const { launchREPL } = await import('../ui/REPL.js');
    await launchREPL(deps);
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
        console.log(`  ${n}: ${(v as any).command} ${(v as any).args?.join(' ') ?? ''}`);
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
  .action(async (action, name) => {
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

program.parse();
