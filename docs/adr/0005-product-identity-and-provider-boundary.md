# ADR-0005: Product Identity and Provider Boundary

- Status: Accepted
- Date: 2026-07-20
- Scope: system prompt assembly, local identity profile, provider metadata, and resumed conversations

## Context

Synapse previously told the model only that it was "Synapse, an agentic coding CLI." The CLI generated an `IDENTITY.md` file but never loaded it into the provider system prompt. The prompt also omitted the project developer and the configured provider/model route.

In a real session configured for `deepseek / deepseek-v4-flash`, the first answer correctly used the Synapse name, but a follow-up question about the developer incorrectly claimed that Anthropic developed the CLI and that the agent was a Claude variant. No active prompt instructed the model to make that claim. The model filled a missing product-provenance fact from its learned associations.

This contradicted both Synapse branding and provider portability. A replaceable inference provider must not become the product identity.

## Decision

Synapse uses three explicit identity layers:

1. The immutable product identity names Synapse and BandageOK as its developer and maintainer.
2. `IDENTITY.md` is a configurable local agent profile for display name, tone, and style. It cannot override official product provenance, runtime routing facts, or safety rules.
3. The resolved provider id/name, protocol, primary model, and fallback models are injected as quoted runtime data. API keys and credential sources are never included.

The immutable prompt instructs the model to distinguish Synapse from its inference provider, never infer its identity from protocol compatibility or model training, and correct conflicting self-attributions preserved in resumed conversation history.

Direct questions such as "你是谁开发的?" and "Who developed you?" are answered deterministically inside the Engine before a Provider request. Product provenance is local application metadata, so correctness must not depend on whether a replaceable model follows a prompt. The recognizer accepts a small, bounded set of explicit identity questions and does not intercept broader questions about dependencies or source history.

Provider metadata is normalized to one line, length-bounded, and JSON-quoted before prompt insertion. This prevents a locally configured provider name or model id from becoming an instruction channel.

Existing data directories receive the default `IDENTITY.md` on the next CLI startup when the file is absent. Existing files are never overwritten.

## Consequences

- Asking who developed Synapse has a stable product answer across OpenAI-compatible, Anthropic-compatible, and custom endpoints.
- Switching providers changes only the disclosed runtime route, not product ownership.
- Resumed sessions can retain old assistant text, but the current system prompt marks conflicting identity claims as errors rather than authority.
- Product ownership now exists in both runtime constants and npm package metadata; changes must update both locations and their regression tests.
- Deterministic tests inspect the actual provider request envelope instead of asserting stochastic wording from an external model.
- Direct identity questions do not consume Provider tokens or inherit model-specific self-identification behavior.
