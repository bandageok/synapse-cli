import type { SlashCommand } from '../registry.js';
import { PERMISSION_PROFILES, normalizePermissionMode } from '../../core/PermissionManager.js';
import { formatPermissionProfiles } from '../permissions-cli.js';

export const permissionsCommand: SlashCommand = {
  name: 'permissions',
  aliases: ['permission'],
  description: 'Show or change the current session permission profile',
  usage: '/permissions [ask|auto|full-access]',
  handler: async (args, deps) => {
    const current = deps.permissionMode ?? 'ask';
    if (!args.trim()) return formatPermissionProfiles(current);
    const mode = normalizePermissionMode(args);
    if (!mode) return 'Usage: /permissions [ask|auto|full-access] (aliases: workspace-auto, yolo)';
    if (!deps.setPermissionMode) return 'Permission switching is unavailable in this session.';
    deps.setPermissionMode(mode);
    const warning = PERMISSION_PROFILES[mode].warning;
    return [
      `Session permission mode: ${mode}`,
      `Approval policy: ${PERMISSION_PROFILES[mode].approvalPolicy}`,
      `Shell isolation: ${PERMISSION_PROFILES[mode].shellIsolation}`,
      ...(warning ? [`Warning: ${warning}`] : []),
    ].join('\n');
  },
};
