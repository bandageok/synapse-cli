import { describe, expect, it } from 'vitest';
import { isReconfigureKey, maskSecret, providerIndexFromKey } from '../src/ui/Onboarding.js';

describe('onboarding keyboard flow', () => {
  it('supports direct numeric provider selection without intercepting text input', () => {
    expect(providerIndexFromKey('1', 13)).toBe(0);
    expect(providerIndexFromKey('9', 13)).toBe(8);
    expect(providerIndexFromKey('0', 13)).toBe(9);
    expect(providerIndexFromKey('q', 13)).toBeNull();
    expect(providerIndexFromKey('9', 3)).toBeNull();
  });

  it('uses Space or R only for explicit reconfiguration', () => {
    expect(isReconfigureKey(' ')).toBe(true);
    expect(isReconfigureKey('r')).toBe(true);
    expect(isReconfigureKey('R')).toBe(true);
    expect(isReconfigureKey('q')).toBe(false);
  });

  it('never renders API keys in plaintext', () => {
    expect(maskSecret('sk-secret')).toBe('*********');
    expect(maskSecret('')).toBe('');
  });
});
