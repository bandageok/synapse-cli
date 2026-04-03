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

        const input = block.input;
        const filePath = input.file_path as string | undefined;
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
        const oldStr = input.old_string as string | undefined;
        const newStr = input.new_string as string | undefined;
        if (block.name === 'FileEdit' && oldStr && newStr) {
          if (!existsSync(filePath)) {
            return `⚠️ File ${filePath} no longer exists.`;
          }
          const current = readFileSync(filePath, 'utf-8');
          if (current.includes(newStr)) {
            const reverted = current.replace(newStr, oldStr);
            writeFileSync(filePath, reverted);
            return `✅ Undone: FileEdit on ${filePath}\nReplaced "${newStr.slice(0, 50)}..." back to "${oldStr.slice(0, 50)}..."`;
          }
          return `⚠️ Cannot undo — new_string not found in ${filePath}. File may have been modified further.`;
        }
      }
    }
    return 'No editable operations found in history.';
  },
};
