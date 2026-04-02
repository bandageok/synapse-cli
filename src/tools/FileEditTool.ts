// src/tools/FileEditTool.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { ToolDef, ToolResult } from '../core/types.js';

export const FileEditTool: ToolDef<{
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
  expected_replacements?: number;
}> = {
  name: 'FileEdit',
  description: 'Edit a file by replacing old_string with new_string. Supports replace_all for multiple occurrences.',
  schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the file' },
      old_string: { type: 'string', description: 'Text to find and replace' },
      new_string: { type: 'string', description: 'Replacement text' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences (default: false, replaces first only)', default: false },
      expected_replacements: { type: 'number', description: 'Expected number of replacements. Fails if count differs.' },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
  permissions: 'write',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    if (!existsSync(input.file_path)) {
      return { output: `Error: File not found: ${input.file_path}`, isError: true };
    }

    const content = readFileSync(input.file_path, 'utf-8');

    // 检查 old_string 是否存在
    if (!content.includes(input.old_string)) {
      return { output: 'Error: old_string not found in file', isError: true };
    }

    // 计算出现次数
    const count = content.split(input.old_string).length - 1;

    // 检查预期替换次数
    if (input.expected_replacements !== undefined && count !== input.expected_replacements) {
      return {
        output: `Error: Expected ${input.expected_replacements} occurrences but found ${count}. Use replace_all to replace all.`,
        isError: true,
      };
    }

    // 执行替换前创建备份
    const bakPath = input.file_path + '.cclaw-bak';
    writeFileSync(bakPath, content);

    let newContent: string;
    if (input.replace_all) {
      newContent = content.split(input.old_string).join(input.new_string);
    } else {
      newContent = content.replace(input.old_string, input.new_string);
    }

    writeFileSync(input.file_path, newContent);

    const replacedCount = input.replace_all ? count : 1;
    return {
      output: `File edited successfully. ${replacedCount} replacement(s) made.`,
      isError: false,
    };
  },
};
