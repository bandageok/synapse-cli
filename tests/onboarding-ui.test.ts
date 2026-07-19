import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OnboardingApp, type Config } from '../src/ui/Onboarding.js';

async function send(stdin: { write: (value: string) => void }, value: string): Promise<void> {
  stdin.write(value);
  await new Promise(resolve => setTimeout(resolve, 20));
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 40));
}

describe('onboarding UI', () => {
  it('supports numeric provider selection and treats q as model text', async () => {
    const view = render(React.createElement(OnboardingApp, { onDone: vi.fn(), existing: null }));
    try {
      await settle();
      expect(view.lastFrame()).toContain('首次配置');
      await send(view.stdin, '\r');
      expect(view.lastFrame()).toContain('选择 API 提供商');
      await send(view.stdin, '2');
      expect(view.lastFrame()).toContain('设置模型 ID');
      expect(view.lastFrame()).toContain('gpt-4.1');
      await send(view.stdin, 'q');
      expect(view.lastFrame()).toContain('gpt-4.1q');
    } finally {
      view.unmount();
    }
  });

  it('honors the displayed Space shortcut for reconfiguration', async () => {
    const existing: Config = {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1',
      apiKey: 'existing-key',
      apiKeyEnv: 'OPENAI_API_KEY',
      protocol: 'openai',
      auth: 'bearer',
      theme: 'dark',
    };
    const view = render(React.createElement(OnboardingApp, { onDone: vi.fn(), existing }));
    try {
      await settle();
      expect(view.lastFrame()).toContain('[Space] 重新配置');
      await send(view.stdin, ' ');
      expect(view.lastFrame()).toContain('选择 API 提供商');
    } finally {
      view.unmount();
    }
  });

  it('masks the API key while it is entered', async () => {
    const view = render(React.createElement(OnboardingApp, { onDone: vi.fn(), existing: null }));
    try {
      await settle();
      await send(view.stdin, '\r');
      await send(view.stdin, '2');
      await send(view.stdin, '\r');
      expect(view.lastFrame()).toContain('输入 OpenAI API Key');
      await send(view.stdin, 'sk-secret');
      expect(view.lastFrame()).not.toContain('sk-secret');
      expect(view.lastFrame()).toContain('*********');
    } finally {
      view.unmount();
    }
  });

  it('tests the provider before reporting configuration success', async () => {
    const originalDataDir = process.env.SYNAPSE_DATA_DIR;
    const dataDir = mkdtempSync(join(tmpdir(), 'synapse-onboarding-ui-'));
    process.env.SYNAPSE_DATA_DIR = dataDir;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const view = render(React.createElement(OnboardingApp, { onDone: vi.fn(), existing: null }));
    try {
      await settle();
      await send(view.stdin, '\r');
      await send(view.stdin, '2');
      await send(view.stdin, '\r');
      await send(view.stdin, 'test-key');
      await send(view.stdin, '\r');
      await new Promise(resolve => setTimeout(resolve, 80));
      expect(view.lastFrame()).toContain('Provider 测试通过');
      expect(existsSync(join(dataDir, '.synapse.json'))).toBe(true);
    } finally {
      view.unmount();
      vi.restoreAllMocks();
      if (originalDataDir) process.env.SYNAPSE_DATA_DIR = originalDataDir;
      else delete process.env.SYNAPSE_DATA_DIR;
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
