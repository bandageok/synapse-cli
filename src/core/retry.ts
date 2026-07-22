export interface RetryableErrorDetails {
  status?: number;
  retryAfterMs?: number;
}

export function resolveRateLimitRetries(value: string | undefined, fallback: number): number {
  if (value === undefined || !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < -1 || parsed > 100) {
    throw new Error('SYNAPSE_RATE_LIMIT_RETRIES must be -1 or an integer between 0 and 100.');
  }
  return parsed;
}

export function errorDetails(error: unknown): RetryableErrorDetails {
  if (!error || typeof error !== 'object') return {};
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    retryAfterMs?: unknown;
    headers?: { get?: (name: string) => string | null } | Record<string, unknown>;
  };
  const status = typeof candidate.status === 'number'
    ? candidate.status
    : typeof candidate.statusCode === 'number' ? candidate.statusCode : undefined;
  const retryAfterMs = typeof candidate.retryAfterMs === 'number'
    ? candidate.retryAfterMs
    : parseRetryAfter(candidate.headers);
  return { status, retryAfterMs };
}

export function isRateLimitError(error: unknown): boolean {
  const status = errorDetails(error).status;
  const message = error instanceof Error ? error.message : String(error);
  return status === 429 || /\b429\b|rate[_ -]?limit|too many requests/i.test(message);
}

export function parseRetryAfter(value: string | { get?: (name: string) => string | null } | Record<string, unknown> | undefined): number | undefined {
  const raw = typeof value === 'string'
    ? value
    : value && typeof value.get === 'function'
      ? value.get('retry-after') ?? value.get('Retry-After')
      : value && typeof value === 'object'
        ? Object.entries(value).find(([key]) => key.toLowerCase() === 'retry-after')?.[1]
        : undefined;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const seconds = Number(raw.trim());
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const timestamp = Date.parse(raw);
  if (!Number.isNaN(timestamp)) return Math.max(0, timestamp - Date.now());
  return undefined;
}

export function retryDelayMs(error: unknown, attempt: number, options: {
  baseDelayMs?: number;
  maxDelayMs?: number;
} = {}): number {
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  const serverDelay = errorDetails(error).retryAfterMs;
  if (serverDelay !== undefined) return Math.min(maxDelayMs, serverDelay);
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  return Math.min(maxDelayMs, Math.max(0, baseDelayMs * 2 ** Math.max(0, attempt - 1)));
}

export async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error('Request cancelled.');
  error.name = 'AbortError';
  return error;
}
