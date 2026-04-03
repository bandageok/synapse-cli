// tests/markdown.test.ts
// MarkdownRenderer 组件存在性验证
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

describe('MarkdownRenderer', () => {
  it('file exists', () => {
    const p = join(process.cwd(), 'src', 'ui', 'MarkdownRenderer.tsx');
    expect(existsSync(p)).toBe(true);
  });

  it('exports MarkdownRenderer component', async () => {
    const mod = await import('../src/ui/MarkdownRenderer.js');
    expect(mod.MarkdownRenderer).toBeDefined();
    expect(typeof mod.MarkdownRenderer).toBe('function');
  });
});
