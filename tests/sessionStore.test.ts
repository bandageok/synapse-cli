// tests/sessionStore.test.ts
// SessionStore: save and load sessions
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SessionStore } from '../src/core/SessionStore.js';

describe('SessionStore', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(() => {
    tmpDir = join(tmpdir(), 'cclaw-ss-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    store = new SessionStore(tmpDir);
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('saves and loads a session', async () => {
    const messages = [{ role: 'user' as const, content: 'hello' }];
    const meta = {
      id: 'test-id',
      model: 'test-model',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenUsage: 0,
      turnCount: 1,
    };
    await store.save('test-id', messages, meta);
    expect(existsSync(join(tmpDir, 'test-id.json'))).toBe(true);
  });

  it('loads an existing session', async () => {
    const messages = [{ role: 'user' as const, content: 'hi' }];
    const meta = {
      id: 'load-test',
      model: 'my-model',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tokenUsage: 42,
      turnCount: 3,
    };
    await store.save('load-test', messages, meta);
    const loaded = await store.load('load-test');
    expect(loaded).toBeDefined();
    expect(loaded!.messages.length).toBe(1);
    expect(loaded!.metadata.tokenUsage).toBe(42);
  });

  it('returns null for non-existent session', async () => {
    const loaded = await store.load('nonexistent');
    expect(loaded).toBeNull();
  });
});
