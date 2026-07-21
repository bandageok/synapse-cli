import { spawnSync } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSandboxBackend } from '../src/security/Sandbox.js';

vi.mock('child_process', () => ({ spawnSync: vi.fn() }));

const spawnSyncMock = vi.mocked(spawnSync);
const timedOut = { error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }), status: null };

describe('sandbox backend probes', () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  it('retries a timed-out backend probe with an extended deadline', () => {
    spawnSyncMock
      .mockReturnValueOnce(timedOut as never)
      .mockReturnValueOnce({ status: 0 } as never);

    expect(resolveSandboxBackend('docker')).toBe('docker');
    expect(spawnSyncMock).toHaveBeenCalledTimes(2);
    expect(spawnSyncMock.mock.calls[0]?.[2]).toMatchObject({ timeout: 3_000 });
    expect(spawnSyncMock.mock.calls[1]?.[2]).toMatchObject({ timeout: 10_000 });
  });

  it('does not retry permission or executable failures', () => {
    spawnSyncMock.mockReturnValueOnce({
      error: Object.assign(new Error('permission denied'), { code: 'EACCES' }),
      status: null,
    } as never);

    expect(resolveSandboxBackend('docker')).toBeNull();
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a completed but unsuccessful probe', () => {
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as never);

    expect(resolveSandboxBackend('docker')).toBeNull();
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
  });
});
