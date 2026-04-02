import { MemoryLoader } from './src/core/MemoryLoader.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dir = join(tmpdir(), 'test-ml-debug-' + Date.now());
mkdirSync(dir, { recursive: true });
const dataDir = join(dir, '.cclaw');
mkdirSync(dataDir, { recursive: true });

// Test rules loading with a dedicated root (avoid Windows short names)
const testRoot = join(dir, 'rules-test');
mkdirSync(testRoot, { recursive: true });
const rulesDir = join(testRoot, '.cclaw', 'rules');
mkdirSync(rulesDir, { recursive: true });
writeFileSync(join(rulesDir, 'test-rule.md'), '# Test Rule\nFollow coding standards');

console.log('testRoot:', testRoot);
console.log('rulesDir:', rulesDir);
console.log('rules file exists:', existsSync(join(rulesDir, 'test-rule.md')));

const loader = new MemoryLoader({ dataDir, cwd: testRoot });
const result = await loader.loadAll();
console.log('Total results:', result.length);
console.log('Result types:', result.map(f => f.type));
console.log('Rules results:', result.filter(f => f.type === 'Rules').length);

rmSync(dir, { recursive: true, force: true });
