import { spawnSync } from 'child_process';
import { isAbsolute, relative, resolve } from 'path';

export type SandboxBackend = 'bubblewrap' | 'docker';

export interface SandboxOptions {
  cwd: string;
  workspaceRoots: string[];
  network?: boolean;
  backend?: 'auto' | SandboxBackend;
  dockerImage?: string;
}

export interface SandboxProcess {
  file: string;
  args: string[];
  backend: SandboxBackend;
}

export function createSandboxProcess(command: string, options: SandboxOptions): SandboxProcess {
  const backend = resolveSandboxBackend(options.backend ?? 'auto');
  if (!backend) {
    throw new Error('Strict sandbox unavailable. Install Bubblewrap on Linux or Docker, or use permission mode "ask".');
  }
  return backend === 'bubblewrap'
    ? createBubblewrapProcess(command, options)
    : createDockerProcess(command, options);
}

export function resolveSandboxBackend(preference: 'auto' | SandboxBackend = 'auto'): SandboxBackend | null {
  const candidates: SandboxBackend[] = preference === 'auto'
    ? (process.platform === 'linux' ? ['bubblewrap', 'docker'] : ['docker'])
    : [preference];
  for (const candidate of candidates) {
    const executable = candidate === 'bubblewrap' ? 'bwrap' : 'docker';
    const args = candidate === 'docker' ? ['info', '--format', '{{.ServerVersion}}'] : ['--version'];
    const result = spawnSync(executable, args, { stdio: 'ignore', timeout: 3_000, windowsHide: true });
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

function createBubblewrapProcess(command: string, options: SandboxOptions): SandboxProcess {
  if (process.platform !== 'linux') throw new Error('Bubblewrap is supported only on Linux.');
  assertWorkspaceCwd(options.cwd, options.workspaceRoots);
  const args = [
    '--die-with-parent', '--new-session', '--unshare-user', '--uid', '0', '--gid', '0',
    '--unshare-pid', '--unshare-uts', '--unshare-ipc',
    '--unshare-cgroup-try', '--ro-bind', '/', '/', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
  ];
  if (!options.network) args.push('--unshare-net');
  for (const root of uniqueRoots(options.workspaceRoots)) args.push('--bind', root, root);
  args.push('--chdir', resolve(options.cwd), '/bin/sh', '-lc', command);
  return { file: 'bwrap', args, backend: 'bubblewrap' };
}

export function buildBubblewrapSandboxProcess(command: string, options: SandboxOptions): SandboxProcess {
  return createBubblewrapProcess(command, options);
}

function createDockerProcess(command: string, options: SandboxOptions): SandboxProcess {
  const cwd = resolve(options.cwd);
  const roots = uniqueRoots(options.workspaceRoots);
  const rootIndex = roots.findIndex(root => isInside(root, cwd));
  if (rootIndex < 0) throw new Error(`Working directory is outside configured workspace roots: ${cwd}`);
  const mounts = roots.map((root, index) => ({ root, target: index === 0 ? '/workspace' : `/workspace-${index}` }));
  const selected = mounts[rootIndex];
  const relativeCwd = relative(selected.root, cwd).split('\\').join('/');
  const containerCwd = relativeCwd ? `${selected.target}/${relativeCwd}` : selected.target;
  const args = [
    'run', '--rm', '--init', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', '256', '--memory', '1g', '--cpus', '2', '--tmpfs', '/tmp:rw,noexec,nosuid,size=268435456',
    ...(options.network ? [] : ['--network', 'none']),
  ];
  for (const mount of mounts) args.push('--mount', `type=bind,source=${mount.root},target=${mount.target}`);
  args.push('--workdir', containerCwd, options.dockerImage ?? process.env.SYNAPSE_SANDBOX_IMAGE ?? 'node:20-bookworm-slim', 'sh', '-lc', command);
  return { file: 'docker', args, backend: 'docker' };
}

export function buildDockerSandboxProcess(command: string, options: SandboxOptions): SandboxProcess {
  return createDockerProcess(command, options);
}

function assertWorkspaceCwd(cwd: string, roots: string[]): void {
  if (!roots.some(root => isInside(root, cwd))) throw new Error(`Working directory is outside configured workspace roots: ${cwd}`);
}

function uniqueRoots(roots: string[]): string[] {
  return [...new Set(roots.map(root => resolve(root)))];
}

function isInside(root: string, child: string): boolean {
  const rel = relative(resolve(root), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
