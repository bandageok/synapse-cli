import type { ToolDef, ToolResult } from '../core/types.js';
import { linkAbortSignal } from '../utils/abort.js';

export const WebSearchTool: ToolDef<{ query: string; count?: number }> = {
  name: 'WebSearch',
  description: 'Search the web for information',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      count: { type: 'number', description: 'Number of results (1-10)', default: 5 },
    },
    required: ['query'],
  },
  permissions: 'network',
  isEnabled: () => !!process.env.TAVILY_API_KEY || !!process.env.SERPER_API_KEY,
  execute: async (input, ctx): Promise<ToolResult> => {
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      const requestAbort = linkAbortSignal(ctx.abortSignal, 30_000);
      try {
        const resp = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: tavilyKey, query: input.query, max_results: input.count ?? 5 }),
          signal: requestAbort.signal,
        });
        const data = await resp.json();
        const results = (data.results || []).map((r: { title: string; url: string; content: string }) => `${r.title}\n${r.url}\n${r.content}`).join('\n---\n');
        return { output: results || 'No results', isError: false };
      } finally {
        requestAbort.dispose();
      }
    }
    return { output: 'Error: No search API key configured (set TAVILY_API_KEY or SERPER_API_KEY)', isError: true };
  },
};
