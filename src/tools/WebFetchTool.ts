import type { ToolDef, ToolResult } from '../core/types.js';

export const WebFetchTool: ToolDef<{ url: string; max_chars?: number }> = {
  name: 'WebFetch',
  description: 'Fetch and extract content from a URL',
  schema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
      max_chars: { type: 'number', description: 'Max characters to return', default: 5000 },
    },
    required: ['url'],
  },
  permissions: 'network',
  isEnabled: () => true,
  execute: async (input): Promise<ToolResult> => {
    try {
      const resp = await fetch(input.url, {
        headers: { 'User-Agent': 'C.C.Claw/0.1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      const html = await resp.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const maxChars = input.max_chars ?? 5000;
      return { output: text.slice(0, maxChars), isError: false };
    } catch (err: any) {
      return { output: `Error fetching URL: ${err.message}`, isError: true };
    }
  },
};
