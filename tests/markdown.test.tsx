import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { MarkdownRenderer, parseMarkdownBlocks } from '../src/ui/MarkdownRenderer.js';

describe('MarkdownRenderer', () => {
  it('parses closed and streaming code fences without leaking fence markers', () => {
    expect(parseMarkdownBlocks('before\n```ts\nconst x = 1;\n```\nafter').blocks).toEqual([
      { kind: 'line', text: 'before' },
      { kind: 'code', language: 'ts', lines: ['const x = 1;'] },
      { kind: 'line', text: 'after' },
    ]);
    expect(parseMarkdownBlocks('```sh\necho streaming').blocks).toEqual([
      { kind: 'code', language: 'sh', lines: ['echo streaming'] },
    ]);
  });

  it('renders semantic response blocks instead of raw markdown decoration', () => {
    const view = render(React.createElement(MarkdownRenderer, {
      text: '# Result\n\n- **passed**\n> note\n\n```ts\nconst ok = true;\n```',
    }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('Result');
    expect(frame).toContain('• passed');
    expect(frame).toContain('│ note');
    expect(frame).toContain('┌─ ts');
    expect(frame).toContain('│ const ok = true;');
    expect(frame).not.toContain('**passed**');
    expect(frame).not.toContain('```');
  });

  it('marks a view-level truncation explicitly', () => {
    const view = render(React.createElement(MarkdownRenderer, {
      text: 'one\ntwo\nthree',
      maxLines: 2,
    }));
    expect(view.lastFrame()).toContain('response shortened in this view');
  });

  it('bounds a wrapped single-line response by the available terminal width', () => {
    const view = render(React.createElement(MarkdownRenderer, {
      text: '0123456789'.repeat(60),
      maxLines: 6,
      columns: 20,
    }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('rendered lines omitted');
    expect(frame).toContain('response shortened in this view');
    expect(frame.length).toBeLessThan(300);
  });

  it('removes terminal control sequences from provider text', () => {
    const view = render(React.createElement(MarkdownRenderer, {
      text: '\u001b[31mfailed\u001b[0m but readable',
    }));
    const frame = view.lastFrame() ?? '';
    expect(frame).toContain('failed but readable');
    expect(frame).not.toContain('\u001b');
  });
});
