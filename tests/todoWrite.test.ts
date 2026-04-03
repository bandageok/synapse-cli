// tests/todoWrite.test.ts
import { describe, it, expect } from 'vitest';
import { TodoWriteTool } from '../src/tools/TodoWriteTool.js';

describe('TodoWriteTool', () => {
  it('has correct tool definition', () => {
    expect(TodoWriteTool.name).toBe('TodoWrite');
    expect(TodoWriteTool.schema.required).toContain('todos');
    expect(TodoWriteTool.isEnabled()).toBe(true);
  });

  it('accepts todos array', async () => {
    const result = await TodoWriteTool.execute({
      todos: [{ content: 'Task 1', status: 'pending' }]
    }, { cwd: process.cwd(), abortSignal: new AbortController().signal });
    expect(result.isError).toBe(false);
  });
});
