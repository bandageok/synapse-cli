import type { SlashCommand } from '../registry.js';

export const compactCommand: SlashCommand = {
  name: 'compact',
  description: 'Manually compress conversation',
  handler: async (_args, deps) => {
    const messages = deps.messages;
    if (messages.length === 0) return 'No messages to compress.';

    // 估算当前 tokens
    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') totalChars += msg.content.length;
      else totalChars += JSON.stringify(msg.content).length;
    }
    const tokensBefore = Math.round(totalChars / 4);

    // 保留最近的消息作为摘要
    const recent = messages.slice(-6);
    const summaryLines = recent.map(m => {
      const role = m.role;
      const content = typeof m.content === 'string'
        ? m.content.slice(0, 200)
        : JSON.stringify(m.content).slice(0, 200);
      return `${role}: ${content}`;
    });

    // 替换消息历史
    if (deps.setMessages) {
      deps.setMessages([
        { role: 'user', content: `[Conversation summary — ${tokensBefore} tokens compressed]\n${summaryLines.join('\n')}` },
        { role: 'assistant', content: 'Understood, continuing from the summary.' },
      ]);
    }

    const tokensAfter = Math.round(summaryLines.join('\n').length / 4);
    return `📦 Compressed: ~${tokensBefore} → ~${tokensAfter} tokens (${messages.length} → 2 messages)`;
  },
};
