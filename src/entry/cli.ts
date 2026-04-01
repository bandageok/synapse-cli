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
