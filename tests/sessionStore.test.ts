// tests/sessionStore.test.ts
// SessionStore: save and load sessions
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SessionStore } from '../src/core/SessionStore.js';

describe('SessionStore', () => {
  let tmpDir: string;
  let store: SessionStore;

  beforeEach(() => {
    tmpDir = join(tmpdir(), 'synapse-ss-' + Date.now());
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

  it('preserves createdAt across atomic updates and leaves no temp files', async () => {
    const createdAt = '2026-01-01T00:00:00.000Z';
    const meta = {
      id: 'stable-id', model: 'model-a', createdAt,
      updatedAt: createdAt, tokenUsage: 0, turnCount: 1,
    };
    await store.save('stable-id', [{ role: 'user', content: 'one' }], meta);
    await store.save('stable-id', [{ role: 'user', content: 'two' }], {
      ...meta, model: 'model-b', createdAt: '2099-01-01T00:00:00.000Z', turnCount: 2,
    });

    const loaded = await store.load('stable-id');
    expect(loaded?.metadata.createdAt).toBe(createdAt);
    expect(loaded?.metadata.model).toBe('model-b');
    expect(readdirSync(tmpDir).filter(file => file.endsWith('.tmp'))).toEqual([]);
  });

  it('skips corrupt session files when listing', async () => {
    writeFileSync(join(tmpDir, 'broken.json'), '{not json');
    await store.save('valid', [{ role: 'user', content: 'hello' }], {
      id: 'valid', model: 'model', createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), tokenUsage: 0, turnCount: 1,
    });
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it('rejects session ids that could escape the session directory', async () => {
    await expect(store.load('../outside')).rejects.toThrow('Invalid session id');
    await expect(store.delete('nested/path')).rejects.toThrow('Invalid session id');
  });
});
