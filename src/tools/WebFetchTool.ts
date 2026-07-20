import { homedir } from 'os';
import { join } from 'path';
import type { ToolDef, ToolResult } from '../core/types.js';
import { NetworkPolicy, requestPinned } from '../security/NetworkPolicy.js';

export function createWebFetchTool(dataDir: string): ToolDef<{ url: string; max_chars?: number }> {
  const policy = new NetworkPolicy(dataDir);
  return {
    name: 'WebFetch',
    description: 'Fetch an allowlisted public HTTPS URL with DNS pinning',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', minLength: 1, description: 'Allowlisted HTTPS URL to fetch' },
        max_chars: { type: 'integer', minimum: 1, maximum: 20_000, default: 5000 },
      },
      required: ['url'],
    },
    permissions: 'network',
    autoApproveInWorkspace: true,
    isEnabled: () => true,
    execute: async (input, ctx): Promise<ToolResult> => {
      try {
        let url = policy.validateUrl(input.url);
        for (let redirects = 0; redirects <= 3; redirects++) {
          const response = await requestPinned(policy, url, { signal: ctx.abortSignal, maxBytes: 2_000_000 });
          if (response.status >= 300 && response.status < 400) {
            const location = firstHeader(response.headers.location);
            if (!location) throw new Error('Redirect response did not include a location.');
            if (redirects === 3) throw new Error('Too many redirects.');
            url = policy.validateUrl(new URL(location, url).toString());
            continue;
          }
          if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
          const text = response.body.toString('utf-8')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          return { output: text.slice(0, input.max_chars ?? 5000), isError: false };
        }
        throw new Error('Redirect processing failed.');
      } catch (error) {
        return { output: `Error fetching URL: ${error instanceof Error ? error.message : String(error)}`, isError: true };
      }
    },
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const WebFetchTool = createWebFetchTool(process.env.SYNAPSE_DATA_DIR || join(homedir(), '.synapse'));
