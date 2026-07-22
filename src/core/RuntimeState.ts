import type { Provider } from '../providers/base.js';
import type { Compressor } from './Compressor.js';
import type { ContextBuilder } from './Context.js';

export function switchRuntimeModel(
  model: string,
  provider: Provider,
  context: ContextBuilder,
  compressor: Compressor,
): string {
  const next = model.trim();
  if (!next) throw new Error('Model id cannot be empty.');
  if (!provider.setModel) {
    throw new Error(`Provider ${provider.name} does not support runtime model switching.`);
  }
  provider.setModel(next);
  context.setRuntimeModel(next);
  compressor.setModel(next);
  return next;
}
