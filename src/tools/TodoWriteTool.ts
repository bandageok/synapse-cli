import type { ToolDef, ToolResult } from '../core/types.js';

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

export const TodoWriteTool: ToolDef<{ todos: TodoItem[] }> = {
  name: 'TodoWrite',
  description: 'Create and manage a TODO list for tracking task progress',
  schema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['id', 'content', 'status', 'priority'],
        },
      },
    },
    required: ['todos'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    const lines = input.todos.map(t => {
      const icon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '🔄' : '⬜';
      return `${icon} [${t.priority}] ${t.content}`;
    });
    return {
      output: `TODO List:\n${lines.join('\n')}\n\nReminder: Keep using this tool to track progress.`,
      isError: false,
    };
  },
};
