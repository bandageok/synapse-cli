# Provider and Memory CLI

## Provider configuration

Synapse has a catalog of mainstream provider presets, but runtime routing is not tied to provider names. A connection is defined by these fields:

```json
{
  "provider": "company-gateway",
  "providerName": "company-gateway",
  "protocol": "openai",
  "auth": "bearer",
  "apiKeyEnv": "SYNAPSE_API_KEY",
  "baseUrl": "https://llm.example.com/v1",
  "model": "company-model",
  "fallbackModels": ["company-model-small"],
  "hasCompletedOnboarding": true
}
```

- `protocol: openai` calls `<baseUrl>/chat/completions`.
- `protocol: anthropic` calls `<baseUrl>/v1/messages`.
- `auth` is `bearer` or `x-api-key`.
- `apiKeyEnv` is read from the process environment first, then `~/.synapse/.env`.
- Presets only supply defaults. Any provider name and compatible BaseURL can be configured.
- `fallbackModels` are tried in order on the same endpoint only when a request fails before any streamed output. Synapse never switches after partial output.

```bash
synapse provider list
synapse provider set openrouter --api-key "$OPENROUTER_API_KEY"
synapse provider set openrouter --model primary-model --fallback-model smaller-model local-model
synapse provider set local-llm --base-url http://127.0.0.1:8080/v1 --protocol openai --model local-model --api-key local-key
synapse provider test
```

The test command sends a live request with a one-token output limit. It validates the API key, BaseURL, protocol, and model, and may incur a very small provider charge.

## Memory operations

```bash
synapse memory inspect --json
synapse memory search "keyword" --limit 20
synapse memory prune --older-than 90 --scope memory
synapse memory prune --older-than 90 --scope memory --yes
synapse memory export backup.json
```

Safety and privacy behavior:

- Prune is preview-only without `--yes`.
- The default `memory` prune scope only considers dated files and `archive-*.md` files.
- `MEMORY.md`, unknown files, and symlinks are never removed by the default scope.
- Search and export exclude session transcripts unless `--include-sessions` is present.
- Export never reads `.env` or provider configuration.
- Existing export files are not overwritten unless `--force` is present.
