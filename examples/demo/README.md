# Reproduce the README demo

The demo runs the built Synapse CLI against a deterministic local OpenAI-compatible server. It does not use an external model or API key.

The script performs these checks:

1. Creates an isolated temporary Synapse data directory.
2. Initializes the local configuration and writes one project-memory rule.
3. Configures a local OpenAI-compatible endpoint.
4. Runs `synapse doctor` through the built CLI.
5. Sends a pipe-mode chat request.
6. Verifies on the server that the saved memory rule is present before returning the response shown in the demo.

From the repository root:

```bash
npm ci
npm run build
node examples/demo/run-demo.mjs
```

To update the checked-in transcript and visual assets:

```bash
node examples/demo/run-demo.mjs --record
python examples/demo/render-assets.py
```

`render-assets.py` requires Pillow. Asset generation is optional and is not part of the Synapse runtime or npm package.
