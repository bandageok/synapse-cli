import { describe, expect, it } from 'vitest';
import { compareVersions } from '../src/utils/semver.js';

describe('compareVersions', () => {
  it('compares major, minor, and patch versions numerically', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.10.0', '0.2.9')).toBeGreaterThan(0);
    expect(compareVersions('0.2.1', '0.2.1')).toBe(0);
  });

  it('orders prereleases before stable releases', () => {
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.1')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0);
  });

  it('rejects malformed versions', () => {
    expect(() => compareVersions('latest', '1.0.0')).toThrow('Invalid semantic version');
  });
});
