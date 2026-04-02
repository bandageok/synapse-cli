// src/tools/TtsTool.ts
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ToolDef, ToolResult } from '../core/types.js';

export const TtsTool: ToolDef<{ text: string; voice?: string; output_path?: string }> = {
  name: 'TTS',
  description: 'Convert text to speech using OpenAI TTS API',
  schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to convert to speech' },
      voice: { type: 'string', description: 'Voice: alloy, echo, fable, onyx, nova, shimmer', default: 'nova' },
      output_path: { type: 'string', description: 'Output file path (default: ./speech.mp3)' },
    },
    required: ['text'],
  },
  permissions: 'network',
  isEnabled: () => !!process.env.OPENAI_API_KEY,
  execute: async (input): Promise<ToolResult> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { output: 'Error: OPENAI_API_KEY not set', isError: true };
    }

    try {
      const resp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: input.text,
          voice: input.voice ?? 'nova',
        }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        return { output: `API error: ${resp.status} - ${body}`, isError: true };
      }

      const buffer = Buffer.from(await resp.arrayBuffer());
      const outputPath = input.output_path ?? './speech.mp3';
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, buffer);

      return {
        output: `Speech saved to: ${outputPath}\nText: ${input.text.slice(0, 100)}${input.text.length > 100 ? '...' : ''}`,
        isError: false,
      };
    } catch (err: unknown) {
      return { output: `Error: ${(err instanceof Error ? err.message : String(err))}`, isError: true };
    }
  },
};
