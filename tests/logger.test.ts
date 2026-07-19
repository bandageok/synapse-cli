import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Logger } from '../src/core/Logger.js';

describe('Logger', () => {
  it('writes readable audit entries', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'synapse-logger-'));
    const logger = new Logger({ dataDir });

    logger.audit('tool.permission_decision', {
      tool: 'Bash',
      decision: 'ask',
    });

    const line = readFileSync(logger.getAuditPath(), 'utf-8').trim();
    const parsed = JSON.parse(line);

    expect(parsed.action).toBe('tool.permission_decision');
    expect(parsed.tool).toBe('Bash');
    expect(parsed.decision).toBe('ask');
    expect(parsed.timestamp).toBeTruthy();
  });
});
