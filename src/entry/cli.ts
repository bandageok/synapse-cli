// src/entry/cli.ts
import { Command } from 'commander';

const program = new Command();

program
  .name('cclaw')
  .description('C.C.Claw — Claude Code × Claw agent framework')
  .version('0.1.0');

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
    console.log(`  Engine: AsyncGenerator v0.1.0`);
    console.log(`  Context: 6-layer builder`);
    console.log(`  Compressor: 4-level defense`);
  });

program.parse();
