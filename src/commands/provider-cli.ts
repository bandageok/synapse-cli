import type { Command } from 'commander';
import {
  getSynapseDataDir,
  listProviders,
  setProvider,
  testProvider,
} from '../providers/management.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(error: unknown): void {
  console.error(`Error: ${errorMessage(error)}`);
  process.exitCode = 1;
}

function printProviderList(json = false): void {
  const entries = listProviders(getSynapseDataDir());
  if (json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }
  console.log('Providers:');
  for (const entry of entries) {
    const marker = entry.active ? '*' : ' ';
    const status = entry.configured ? `configured via ${entry.keySource}` : `missing ${entry.keyName}`;
    console.log(`${marker} ${entry.id.padEnd(12)} ${entry.protocol.padEnd(9)} ${status}`);
    console.log(`  model: ${entry.model}`);
    if (entry.baseUrl) console.log(`  url:   ${entry.baseUrl}`);
  }
  console.log('\n* active provider');
}

export function registerProviderCli(program: Command): void {
  const provider = program
    .command('provider')
    .description('List, configure, and test model providers')
    .action(() => {
      try {
        printProviderList(false);
      } catch (error) {
        fail(error);
      }
    });

  provider
    .command('list')
    .description('List supported providers and configuration status')
    .option('--json', 'Output machine-readable JSON')
    .action((options: { json?: boolean }) => {
      try {
        printProviderList(Boolean(options.json));
      } catch (error) {
        fail(error);
      }
    });

  provider
    .command('set')
    .description('Set a preset or arbitrary compatible provider')
    .argument('<provider>', 'Preset id or a custom provider name')
    .option('-m, --model <model>', 'Default model')
    .option('--base-url <url>', 'Provider API base URL')
    .option('--protocol <protocol>', 'openai | anthropic')
    .option('--auth <auth>', 'bearer | x-api-key')
    .option('--api-key-env <name>', 'Environment variable used for the API key')
    .option('--api-key <key>', 'Store the provider API key in ~/.synapse/.env')
    .option('--json', 'Output machine-readable JSON')
    .action((providerId: string, options: {
      model?: string;
      baseUrl?: string;
      protocol?: string;
      auth?: string;
      apiKeyEnv?: string;
      apiKey?: string;
      json?: boolean;
    }) => {
      try {
        const runtime = setProvider(providerId, {
          model: options.model,
          baseUrl: options.baseUrl,
          protocol: options.protocol,
          auth: options.auth,
          apiKeyEnv: options.apiKeyEnv,
          apiKey: options.apiKey,
          dataDir: getSynapseDataDir(),
        });
        const output = {
          provider: runtime.id,
          model: runtime.model,
          baseUrl: runtime.baseUrl,
          protocol: runtime.protocol,
          auth: runtime.auth,
          configured: Boolean(runtime.apiKey),
          keySource: runtime.keySource,
          keyName: runtime.keyName,
        };
        if (options.json) console.log(JSON.stringify(output, null, 2));
        else {
          console.log(`Active provider: ${runtime.id}`);
          console.log(`Model: ${runtime.model}`);
          console.log(`Protocol: ${runtime.protocol} (${runtime.auth})`);
          if (runtime.baseUrl) console.log(`Base URL: ${runtime.baseUrl}`);
          console.log(runtime.apiKey
            ? `API key: configured via ${runtime.keySource} (${runtime.keyName})`
            : `API key: missing ${runtime.keyName}`);
        }
      } catch (error) {
        fail(error);
      }
    });

  provider
    .command('test')
    .description('Run a minimal live request against a provider')
    .argument('[provider]', 'Provider to test; defaults to the active provider')
    .option('--timeout <ms>', 'Request timeout in milliseconds', '15000')
    .option('--json', 'Output machine-readable JSON')
    .action(async (providerId: string | undefined, options: { timeout: string; json?: boolean }) => {
      try {
        const timeoutMs = Number(options.timeout);
        const result = await testProvider({
          provider: providerId,
          timeoutMs,
          dataDir: getSynapseDataDir(),
        });
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else {
          console.log(`Provider test passed: ${result.provider}`);
          console.log(`Model: ${result.model}`);
          console.log(`Endpoint: ${result.endpoint}`);
          console.log(`Latency: ${result.latencyMs}ms`);
        }
      } catch (error) {
        fail(error);
      }
    });
}
