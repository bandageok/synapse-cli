import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export function findTemplateDir(moduleUrl = import.meta.url): string {
  const moduleDir = dirname(fileURLToPath(moduleUrl));
  const candidates = [
    join(moduleDir, 'templates'),
    join(moduleDir, '..', 'templates'),
    join(moduleDir, '..', '..', 'templates'),
  ];
  const match = candidates.find(candidate => existsSync(join(candidate, 'SOUL.md')));
  if (!match) {
    throw new Error(`Synapse templates are missing. Checked: ${candidates.join(', ')}`);
  }
  return match;
}
