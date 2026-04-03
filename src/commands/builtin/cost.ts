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
  description: 'Show token usage and approximate cost',
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

    const inputCost = (approxTokens / 1_000_000) * 1.4;      // MiniMax M2.7
    const outputCost = (approxTokens * 0.3 / 1_000_000) * 3.5;

    return [
      '--- Session Cost ---',
      '  Model:       ' + deps.model,
      '  Turns:       ' + turns,
      '  Messages:    ' + msgs.length,
      '  Tool calls:  ' + toolCalls,
      '  ~Input:      ' + approxTokens.toLocaleString() + ' tokens',
      '  ~Output:     ' + (approxTokens * 0.3).toFixed(0) + ' tokens (est)',
      '  ~Total:      ' + (approxTokens * 1.3).toLocaleString() + ' tokens',
      '  ~Cost:       $' + (inputCost + outputCost).toFixed(6) + ' USD',
      '',
      '  Based on MiniMax M2.7: $1.4/1M input, $3.5/1M output',
    ].join('\n');
  },
};
