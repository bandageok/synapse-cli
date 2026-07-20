export interface LinkedAbortSignal {
  signal: AbortSignal;
  dispose: () => void;
}

export function linkAbortSignal(parent: AbortSignal, timeoutMs: number): LinkedAbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent.reason);
  const timeout = setTimeout(() => controller.abort(new Error(`Operation timed out after ${timeoutMs}ms.`)), timeoutMs);
  if (parent.aborted) onAbort();
  else parent.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      parent.removeEventListener('abort', onAbort);
    },
  };
}
