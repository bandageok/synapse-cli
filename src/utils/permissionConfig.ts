import type { PermissionMode, PermissionModeInput } from '../core/types.js';
import { normalizePermissionMode } from '../core/PermissionManager.js';
import { readSynapseConfig, updateSynapseConfig } from '../providers/management.js';

export function getConfiguredPermissionMode(dataDir: string): PermissionMode {
  return normalizePermissionMode(readSynapseConfig(dataDir).permissionMode) ?? 'ask';
}

export function setConfiguredPermissionMode(dataDir: string, value: PermissionModeInput): PermissionMode {
  const mode = normalizePermissionMode(value);
  if (!mode) throw new Error('Permission mode must be ask, auto, or full-access.');
  updateSynapseConfig({ permissionMode: mode }, dataDir);
  return mode;
}
