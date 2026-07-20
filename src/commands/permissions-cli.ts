import type { Command } from 'commander';
import { getSynapseDataDir } from '../providers/management.js';
import { PERMISSION_PROFILES, normalizePermissionMode } from '../core/PermissionManager.js';
import { getConfiguredPermissionMode, setConfiguredPermissionMode } from '../utils/permissionConfig.js';

export function registerPermissionsCli(program: Command): void {
  program
    .command('permissions')
    .description('Show or persist the default permission profile')
    .argument('[action]', 'list | get | show | set | ask | auto | full-access')
    .argument('[mode]', 'ask | auto | full-access')
    .action((action?: string, value?: string) => {
      const dataDir = getSynapseDataDir();
      if (!action || action === 'list' || action === 'get' || action === 'show') {
        console.log(formatPermissionProfiles(getConfiguredPermissionMode(dataDir)));
        return;
      }

      const requested = action === 'set' ? value : action;
      const mode = normalizePermissionMode(requested);
      if (!mode) {
        console.error('Error: permission mode must be ask, auto, or full-access (aliases: workspace-auto, yolo).');
        process.exitCode = 2;
        return;
      }
      setConfiguredPermissionMode(dataDir, mode);
      console.log(`Default permission mode: ${mode}`);
      const warning = PERMISSION_PROFILES[mode].warning;
      if (warning) console.log(`Warning: ${warning}`);
      console.log('New sessions will use this mode. Use /permissions inside a running session for a session-only change.');
    });
}

export function formatPermissionProfiles(active: string): string {
  const lines = [`Default permission mode: ${active}`, 'Profiles:'];
  for (const profile of Object.values(PERMISSION_PROFILES)) {
    lines.push(`${profile.mode === active ? '*' : ' '} ${profile.mode}: ${profile.description}`);
  }
  lines.push('Aliases: workspace-auto -> auto, yolo -> full-access');
  return lines.join('\n');
}
