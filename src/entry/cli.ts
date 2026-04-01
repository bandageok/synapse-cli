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
  .action(async () => {
    console.log('C.C.Claw v0.1.0 — not yet implemented');
  });

program.parse();
