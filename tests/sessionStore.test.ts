// tests/sessionStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../src/core/SessionStore.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SessionStore', () => {
  let dir: string;
  let store: SessionStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cclaw-session-'));
    store = new SessionStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves and loads a session', async () => {
    const messages = [{ role: 'user' as const, content: 'hello' }];
    const meta = { id: 'test-1', model: 'test', createdAt: '2026-01-01', updatedAt: '2026-01-01', tokenUsage: 10, turnCount: 1 };
    await store.save('test-1', messages, meta);
    const loaded = await store.load('test-1');
    expect(loaded?.messages).toHaveLength(1);
    expect(loaded?.metadata.id).toBe('test-1');
  });

  it('lists sessions sorted by updatedAt', async () => {
    await store.save('a', [], { id: 'a', model: 'test', createdAt: '2026-01-01', updatedAt: '2026-01-01', tokenUsage: 0, turnCount: 0 });
    await store.save('b', [], { id: 'b', model: 'test', createdAt: '2026-01-02', updatedAt: '2026-01-02', tokenUsage: 0, turnCount: 0 });
    const list = await store.list();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe('b'); // newer first
  });

  it('returns null for non-existent session', async () => {
    const loaded = await store.load('nonexistent');
    expect(loaded).toBeNull();
  });

  it('deletes a session', async () => {
    await store.save('del', [], { id: 'del', model: 'test', createdAt: '', updatedAt: '', tokenUsage: 0, turnCount: 0 });
    await store.delete('del');
    const loaded = await store.load('del');
    expect(loaded).toBeNull();
  });

  it('updates updatedAt on save', async () => {
    const meta = { id: 't', model: 'test', createdAt: '2026-01-01', updatedAt: '2026-01-01', tokenUsage: 0, turnCount: 0 };
    await store.save('t', [], meta);
    const loaded = await store.load('t');
    expect(loaded?.metadata.updatedAt).not.toBe('2026-01-01');
  });
});
