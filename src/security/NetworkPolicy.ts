import { promises as dns } from 'dns';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { BlockList, isIP } from 'net';
import { dirname, join } from 'path';
import { domainToASCII } from 'url';
import { VERSION } from '../version.js';

export interface NetworkPolicyConfig {
  allowedDomains: string[];
  allowHttp: boolean;
}

export interface PinnedResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  address: string;
}

const blocked = createBlockList();

export class NetworkPolicy {
  private readonly path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'network-policy.json');
  }

  load(): NetworkPolicyConfig {
    if (!existsSync(this.path)) return { allowedDomains: [], allowHttp: false };
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf-8')) as Partial<NetworkPolicyConfig>;
      return {
        allowedDomains: Array.isArray(parsed.allowedDomains)
          ? parsed.allowedDomains.filter((item): item is string => typeof item === 'string').map(normalizePattern)
          : [],
        allowHttp: parsed.allowHttp === true,
      };
    } catch {
      return { allowedDomains: [], allowHttp: false };
    }
  }

  allowDomain(pattern: string): void {
    const config = this.load();
    const normalized = normalizePattern(pattern);
    if (!config.allowedDomains.includes(normalized)) config.allowedDomains.push(normalized);
    this.save(config);
  }

  removeDomain(pattern: string): void {
    const config = this.load();
    const normalized = normalizePattern(pattern);
    config.allowedDomains = config.allowedDomains.filter(item => item !== normalized);
    this.save(config);
  }

  validateUrl(value: string): URL {
    const url = new URL(value);
    const config = this.load();
    if (url.username || url.password) throw new Error('URLs containing credentials are not allowed.');
    const hostname = normalizeHostname(url.hostname);
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
      || (isIP(hostname) && isBlockedAddress(hostname))) {
      throw new Error('Private network destinations are blocked.');
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && config.allowHttp)) {
      throw new Error(config.allowHttp ? 'Only HTTP(S) URLs are allowed.' : 'Only HTTPS URLs are allowed by network policy.');
    }
    if (!config.allowedDomains.some(pattern => matchesDomain(hostname, pattern))) {
      throw new Error(`Domain is not allowlisted: ${hostname}. Run "synapse network allow ${hostname}".`);
    }
    return url;
  }

  async resolvePinned(url: URL): Promise<{ address: string; family: 4 | 6 }> {
    const hostname = normalizeHostname(url.hostname);
    if (isIP(hostname)) {
      if (isBlockedAddress(hostname)) throw new Error(`Blocked network address: ${hostname}`);
      return { address: hostname, family: isIP(hostname) as 4 | 6 };
    }
    const answers = await dns.lookup(hostname, { all: true, verbatim: true });
    if (answers.length === 0) throw new Error(`DNS returned no addresses for ${hostname}.`);
    const rejected = answers.find(answer => isBlockedAddress(answer.address));
    if (rejected) throw new Error(`DNS for ${hostname} included blocked address ${rejected.address}; request denied.`);
    return answers[0] as { address: string; family: 4 | 6 };
  }

  private save(config: NetworkPolicyConfig): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  }
}

export async function requestPinned(
  policy: NetworkPolicy,
  url: URL,
  options: { signal: AbortSignal; maxBytes: number; headers?: Record<string, string> },
): Promise<PinnedResponse> {
  const pinned = await policy.resolvePinned(url);
  return new Promise((resolvePromise, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)({
      protocol: url.protocol,
      hostname: pinned.address,
      family: pinned.family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      servername: url.protocol === 'https:' && !isIP(url.hostname) ? url.hostname : undefined,
      headers: { Host: url.host, 'User-Agent': `Synapse/${VERSION}`, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5', ...options.headers },
      signal: options.signal,
    }, response => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > options.maxBytes) {
          request.destroy(new Error(`Response exceeded ${options.maxBytes} byte limit.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolvePromise({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
        address: pinned.address,
      }));
    });
    request.once('error', reject);
    request.setTimeout(15_000, () => request.destroy(new Error('Network request timed out after 15000ms.')));
    request.end();
  });
}

export function isBlockedAddress(address: string): boolean {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  const family = isIP(address);
  return family === 0 || blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function normalizePattern(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, '');
  const wildcard = trimmed.startsWith('*.');
  const hostname = normalizeHostname(wildcard ? trimmed.slice(2) : trimmed);
  if (!hostname || hostname.includes('*')) throw new Error(`Invalid domain pattern: ${value}`);
  return wildcard ? `*.${hostname}` : hostname;
}

function normalizeHostname(value: string): string {
  const unwrapped = value.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (isIP(unwrapped)) return unwrapped;
  const ascii = domainToASCII(unwrapped);
  if (!ascii || ascii.length > 253 || ascii.split('.').some(label => !label || label.length > 63 || !/^[a-z0-9-]+$/.test(label))) {
    throw new Error(`Invalid hostname: ${value}`);
  }
  return ascii;
}

function matchesDomain(hostname: string, pattern: string): boolean {
  return pattern.startsWith('*.') ? hostname.endsWith(pattern.slice(1)) && hostname !== pattern.slice(2) : hostname === pattern;
}

function createBlockList(): BlockList {
  const list = new BlockList();
  for (const [address, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
    ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ] as Array<[string, number]>) list.addSubnet(address, prefix, 'ipv4');
  for (const [address, prefix] of [
    ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32],
  ] as Array<[string, number]>) list.addSubnet(address, prefix, 'ipv6');
  return list;
}
