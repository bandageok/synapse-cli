// src/commands/builtin/undo.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { SlashCommand } from '../registry.js';

export const undoCommand: SlashCommand = {
  name: 'undo',
  description: 'Undo the last file edit operation',
  usage: '/undo',
  handler: async (_args, deps) => {
    const messages = deps.messages;

    // 从后往前找最后一次 FileEdit/FileWrite 操作
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'assistant') continue;
      const blocks = Array.isArray(msg.content) ? msg.content : [];

      for (const block of blocks) {
        if (block.type !== 'tool_use') continue;
        if (!['FileEdit', 'FileWrite'].includes(block.name)) continue;

        const input = block.input as any;
        const filePath = input.file_path;
        if (!filePath) continue;

        // 检查 .bak 文件
        const bakPath = filePath + '.cclaw-bak';
        if (existsSync(bakPath)) {
          const backup = readFileSync(bakPath, 'utf-8');
          writeFileSync(filePath, backup);
          return `✅ Undone: ${block.name} on ${filePath}\nRestored from backup.`;
        }

        // FileWrite 无法 undo（没有 old_string）
        if (block.name === 'FileWrite') {
          return `⚠️ Cannot undo FileWrite on ${filePath} — no backup found.\nTip: FileEdit creates automatic backups.`;
        }

        // FileEdit 尝试反向操作
        if (block.name === 'FileEdit' && input.old_string && input.new_string) {
          if (!existsSync(filePath)) {
            return `⚠️ File ${filePath} no longer exists.`;
          }
          const current = readFileSync(filePath, 'utf-8');
          if (current.includes(input.new_string)) {
            const reverted = current.replace(input.new_string, input.old_string);
            writeFileSync(filePath, reverted);
            return `✅ Undone: FileEdit on ${filePath}\nReplaced "${input.new_string.slice(0, 50)}..." back to "${input.old_string.slice(0, 50)}..."`;
          }
          return `⚠️ Cannot undo — new_string not found in ${filePath}. File may have been modified further.`;
        }
      }
    }
    return 'No editable operations found in history.';
  },
};
