import type { SlashCommand } from '../registry.js';

function estimateTokens(messages: any[]): number {
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') total += m.content.length / 4;
    else if (Array.isArray(m.content)) {
      for (const b of m.content) total += JSON.stringify(b).length / 4;
    }
  }
  return Math.round(total);
}

export const costCommand: SlashCommand = {
  name: 'cost',
  aliases: ['usage'],
  description: 'Show measured activity and estimated context usage',
  handler: async (_args, deps) => {
    const msgs = deps.messages;
    const turns = msgs.filter((m: any) => m.role === 'user').length;
    const approxTokens = estimateTokens(msgs);

    let toolCalls = 0;
    for (const m of msgs) {
      if (Array.isArray(m.content)) {
        for (const b of m.content) {
          if (b.type === 'tool_use') toolCalls++;
        }
      }
    }

    return [
      '--- Session Usage ---',
      '  Model:       ' + deps.model,
      '  Turns:       ' + turns,
      '  Messages:    ' + msgs.length,
      '  Tool calls:  ' + toolCalls,
      '  Context:     ~' + approxTokens.toLocaleString() + ' tokens',
      '',
      '  Token count is estimated from local conversation text.',
      '  Billing cost is not shown because providers do not report a consistent price.',
    ].join('\n');
  },
};
