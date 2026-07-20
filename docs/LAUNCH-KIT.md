# Synapse launch kit

This document keeps launch claims, links, and measurement consistent. Update the proof points before each public post.

## Core message

Synapse is a local-first coding agent CLI that keeps project memory when you switch models. It supports compatible OpenAI and Anthropic endpoints and denies strict shell automation when an isolation backend is unavailable.

Short version:

> Keep project memory when you switch models.

## Proof points

- 275 passing tests in the v0.3.3 suite, plus two environment-gated skips locally
- Node.js 18 and 22 CI on Windows and Linux
- A Linux job that runs the strict sandbox and checks filesystem, network, and PID isolation
- A deterministic offline demo that verifies local memory reaches the provider request
- Provider configuration based on protocol, auth, BaseURL, model, and key environment variable
- Three explicit permission profiles: prompted `ask`, fail-closed workspace `auto`, and warned no-prompt host `full-access`

Do not claim that memory, MCP, Vim editing, plugins, or multi-provider support are unique to Synapse. Explain how Synapse combines them and link to reproducible evidence.

## Public assets

- Repository: https://github.com/bandageok/synapse-cli
- npm: https://www.npmjs.com/package/@bandageok/synapse-cli
- Demo: `docs/assets/demo.gif`
- Social preview: `docs/assets/social-preview.png`
- Reproducible demo: `examples/demo/README.md`
- Security model: `README.md#safety-model`
- Roadmap: `docs/ROADMAP.md`

## Show HN draft

Title:

> Show HN: Synapse, a local-first coding CLI that keeps memory across models

Body:

> I built Synapse because switching model providers usually meant rebuilding the surrounding workflow and project context. Synapse keeps instructions and curated memory in local files, while provider routing is configured separately by protocol, BaseURL, model, and key environment variable.
>
> The part I spent the most time on is the tool boundary. Approval and shell isolation are separate: ask prompts before risky actions, auto never prompts but only runs shell commands through a working Bubblewrap or Docker backend, and full-access is an explicit warned host mode. Schema, path, trust, network, and audit controls remain centralized in every profile.
>
> v0.3.3 is on npm. The repository includes 275 passing tests, Windows/Linux CI, adversarial security tests, and a deterministic offline demo that checks whether project memory reaches the provider request.
>
> I would value feedback on provider compatibility, onboarding friction, and whether the memory model is useful in real repositories.

## Reddit draft

Title:

> I built a local-first coding CLI that keeps project memory across model providers

Body:

> Synapse stores project instructions, curated memory, and sessions locally. Provider configuration is separate, so the same workflow can use a preset, a compatible gateway, or a local endpoint.
>
> The demo in the README runs the real CLI against a deterministic local endpoint and verifies that a saved project rule reaches the provider request. The repository also documents the permission and sandbox model rather than treating prompt text as a security boundary.
>
> I am looking for reproducible feedback from people who use multiple providers or local models. Which provider and operating system should I test next?

## Chinese community draft

Title:

> 我做了一个能跨模型保留项目记忆的本地 CLI 编程 Agent

Body:

> 我做 Synapse 的原因很直接：更换模型或网关时，我不想重新配置项目规则、长期记忆和工具权限。
>
> Synapse 把项目上下文保存在本地文件中，Provider 则通过协议、BaseURL、模型和密钥环境变量独立配置。权限与 Shell 隔离分开：ask 逐次确认，auto 从不询问但只在严格工作区沙箱执行 Shell，full-access 是显式带警告的无询问宿主模式。所有模式仍经过集中 Schema、路径、信任、网络与审计边界。
>
> README 中的离线演示运行真实 CLI，并验证本地记忆确实进入 Provider 请求。v0.3.3 目前有 275 项测试通过和 Windows/Linux CI。我更需要真实的安装失败、Provider 兼容性问题和工作流反馈，而不是单纯的 star。

## Launch sequence

1. Merge the public-surface pull request after CI passes.
2. Confirm the README image, badges, issue forms, Discussions, and security policy on GitHub.
3. Run the clean-install smoke test from the public npm package.
4. Publish one primary post with a tagged URL.
5. Reply to early questions before posting to the next community.
6. Record each external post and result in the table below.

Do not publish every draft at once. Each community should get a native post and active follow-up.

## Link tracking

Use a different `utm_source` value for every post:

```text
https://github.com/bandageok/synapse-cli?utm_source=hackernews&utm_medium=community&utm_campaign=v0_3_2_launch
https://github.com/bandageok/synapse-cli?utm_source=reddit&utm_medium=community&utm_campaign=v0_3_2_launch
https://github.com/bandageok/synapse-cli?utm_source=v2ex&utm_medium=community&utm_campaign=v0_3_2_launch
```

GitHub may not expose full UTM reporting in repository traffic. Keep the tags anyway so external analytics and copied links stay distinguishable.

## Measurement

Track qualified use, not only package requests.

| Week | Repository visitors | Confirmed installs | First task completed | Useful reports | External mentions |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 0 | 0 | 0 | 0 | 0 |
| Week 1 | 200 | 20 | 8 | 5 | 2 |
| Week 2 | 500 | 50 | 20 | 10 | 4 |
| Week 4 | 1,000 | 100 | 40 | 20 | 8 |

Treat these as working targets. Change them after the first week of real data. npm download counts are not unique users and should not be reported as confirmed installs.

## Post log

| Date | Channel | URL | Repository visitors | Useful responses | Follow-up |
| --- | --- | --- | ---: | ---: | --- |
| | | | | | |
