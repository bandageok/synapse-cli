// src/tools/ImageTool.ts
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ToolDef, ToolResult } from '../core/types.js';
import { resolveWorkspacePath } from '../utils/workspacePaths.js';
import { linkAbortSignal } from '../utils/abort.js';

export const ImageReadTool: ToolDef<{ file_path: string }> = {
  name: 'ImageRead',
  description: 'Read an image file and return its metadata (size, format, dimensions)',
  schema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path to the image file' },
    },
    required: ['file_path'],
  },
  permissions: 'read',
  isEnabled: () => true,
  execute: async (input, ctx): Promise<ToolResult> => {
    try {
      const filePath = resolveWorkspacePath(input.file_path, ctx, 'read');
      if (!existsSync(filePath)) return { output: `Error: File not found: ${input.file_path}`, isError: true };
      const buffer = readFileSync(filePath);
      const size = buffer.length;
      const ext = filePath.split('.').pop()?.toLowerCase() ?? 'unknown';

      // 检测 PNG
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return {
          output: `Format: PNG\nDimensions: ${width}x${height}\nSize: ${(size / 1024).toFixed(1)} KB`,
          isError: false,
        };
      }

      // 检测 JPEG
      if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        let offset = 2;
        while (offset < buffer.length) {
          if (buffer[offset] !== 0xFF) break;
          const marker = buffer[offset + 1];
          const segmentLength = buffer.readUInt16BE(offset + 2);

          if (marker >= 0xC0 && marker <= 0xC3) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return {
              output: `Format: JPEG\nDimensions: ${width}x${height}\nSize: ${(size / 1024).toFixed(1)} KB`,
              isError: false,
            };
          }
          offset += 2 + segmentLength;
        }
        return {
          output: `Format: JPEG\nSize: ${(size / 1024).toFixed(1)} KB\n(Dimensions: could not parse)`,
          isError: false,
        };
      }

      // 检测 GIF
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        const width = buffer.readUInt16LE(6);
        const height = buffer.readUInt16LE(8);
        return {
          output: `Format: GIF\nDimensions: ${width}x${height}\nSize: ${(size / 1024).toFixed(1)} KB`,
          isError: false,
        };
      }

      // 检测 WebP
      if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
          buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        const width = buffer.readUInt16LE(26) + 1;
        const height = buffer.readUInt16LE(28) + 1;
        return {
          output: `Format: WebP\nDimensions: ${width}x${height}\nSize: ${(size / 1024).toFixed(1)} KB`,
          isError: false,
        };
      }

      return {
        output: `Format: ${ext.toUpperCase()} (unknown binary)\nSize: ${(size / 1024).toFixed(1)} KB\n(Dimensions: unsupported format)`,
        isError: false,
      };
    } catch (err: unknown) {
      return { output: `Error reading image: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  },
};

export const ImageGenerateTool: ToolDef<{ prompt: string; output_path?: string; size?: string }> = {
  name: 'ImageGenerate',
  description: 'Generate an image using AI (requires OPENAI_API_KEY or similar)',
  schema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Image generation prompt' },
      output_path: { type: 'string', description: 'Output file path (default: ./generated.png)' },
      size: { type: 'string', enum: ['256x256', '512x512', '1024x1024'], default: '1024x1024' },
    },
    required: ['prompt'],
  },
  permissions: 'network',
  isEnabled: () => !!process.env.OPENAI_API_KEY,
  execute: async (input, ctx): Promise<ToolResult> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { output: 'Error: OPENAI_API_KEY not set', isError: true };
    }

    const requestAbort = linkAbortSignal(ctx.abortSignal, 60_000);
    try {
      const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: input.prompt,
          size: input.size ?? '1024x1024',
          response_format: 'b64_json',
        }),
        signal: requestAbort.signal,
      });

      if (!resp.ok) {
        const body = await resp.text();
        return { output: `API error: ${resp.status} - ${body}`, isError: true };
      }

      const data = await resp.json();
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) {
        return { output: 'Error: No image data in response', isError: true };
      }

      const outputPath = resolveWorkspacePath(input.output_path ?? './generated.png', ctx, 'write');
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, Buffer.from(b64, 'base64'));

      return {
        output: `Image generated and saved to: ${outputPath}\nPrompt: ${input.prompt}`,
        isError: false,
      };
    } catch (err: unknown) {
      return { output: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    } finally {
      requestAbort.dispose();
    }
  },
};
