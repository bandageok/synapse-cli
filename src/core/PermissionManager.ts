import type { PermissionMode, PermissionModeInput } from './types.js';

export interface PermissionProfile {
  mode: PermissionMode;
  approvalPolicy: 'on-request' | 'never';
  shellIsolation: 'host-after-approval' | 'strict-workspace' | 'host';
  description: string;
  warning?: string;
}

export const PERMISSION_PROFILES: Readonly<Record<PermissionMode, PermissionProfile>> = Object.freeze({
  ask: Object.freeze({
    mode: 'ask',
    approvalPolicy: 'on-request',
    shellIsolation: 'host-after-approval',
    description: 'Ask before state-changing, execution, network, and sensitive-read tools.',
  }),
  auto: Object.freeze({
    mode: 'auto',
    approvalPolicy: 'never',
    shellIsolation: 'strict-workspace',
    description: 'Run workspace-safe tools without prompts; deny operations that cannot stay inside a strict boundary.',
  }),
  'full-access': Object.freeze({
    mode: 'full-access',
    approvalPolicy: 'never',
    shellIsolation: 'host',
    description: 'Run enabled tools and host commands without approval prompts.',
    warning: 'Full access runs host commands without approval prompts or strict shell isolation.',
  }),
});

export function normalizePermissionMode(value: unknown): PermissionMode | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'workspace-auto') return 'auto';
  if (normalized === 'yolo') return 'full-access';
  return normalized === 'ask' || normalized === 'auto' || normalized === 'full-access'
    ? normalized
    : null;
}

export function resolvePermissionModeSelection(
  options: { permissionMode?: unknown; yolo?: boolean },
  fallback: PermissionModeInput = 'ask',
): PermissionMode {
  if (options.yolo && options.permissionMode && normalizePermissionMode(options.permissionMode) !== 'full-access') {
    throw new Error('--yolo cannot be combined with a different --permission-mode.');
  }
  const mode = normalizePermissionMode(options.yolo ? 'full-access' : (options.permissionMode ?? fallback));
  if (!mode) throw new Error('--permission-mode must be ask, auto, or full-access.');
  return mode;
}

export class PermissionManager {
  private mode: PermissionMode;

  constructor(mode: PermissionModeInput = 'ask') {
    this.mode = requirePermissionMode(mode);
  }

  getMode(): PermissionMode {
    return this.mode;
  }

  getProfile(): PermissionProfile {
    return PERMISSION_PROFILES[this.mode];
  }

  setMode(mode: PermissionModeInput): PermissionProfile {
    this.mode = requirePermissionMode(mode);
    return this.getProfile();
  }
}

function requirePermissionMode(value: unknown): PermissionMode {
  const mode = normalizePermissionMode(value);
  if (!mode) {
    throw new Error('Permission mode must be ask, auto, or full-access (aliases: workspace-auto, yolo).');
  }
  return mode;
}
