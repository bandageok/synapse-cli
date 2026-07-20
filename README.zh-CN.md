# Synapse CLI

<p align="center">
  <strong>切换模型，也不用重新教一遍项目上下文。</strong>
</p>

<p align="center">
  Synapse 是一个开源、本地优先的终端编程 Agent。项目指令和长期记忆保存在本机，可连接 OpenAI 兼容或 Anthropic 兼容端点；严格隔离不可用时，危险工具默认拒绝执行。
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

![Synapse CLI 演示](https://raw.githubusercontent.com/bandageok/synapse-cli/main/docs/assets/demo.gif)

演示运行的是真实 CLI，并连接到一个确定性的本地 OpenAI 兼容端点。演示会验证项目记忆确实进入 Provider 请求。[本地复现方法](./examples/demo/README.md)。

## 快速开始

需要 Node.js 18 或更高版本。

```bash
npm install -g @bandageok/synapse-cli
synapse onboard
synapse doctor
synapse chat
```

可以选择预设 Provider，也可以配置任意兼容端点：

```bash
# 预设 Provider
synapse provider set deepseek --api-key-env DEEPSEEK_API_KEY

# 自定义 OpenAI 兼容端点
synapse provider set company-gateway \
  --base-url https://llm.example.com/v1 \
  --protocol openai \
  --model company-model \
  --api-key-env COMPANY_LLM_API_KEY

# 发送最小请求，检查端点、模型和密钥
synapse provider test
```

密钥来自环境变量或 `~/.synapse/.env`。Synapse 不会把密钥写入 `.synapse.json`，也不会在命令输出中显示密钥值。

## 为什么使用 Synapse

Synapse 适合需要切换模型或网关，同时希望保留同一套项目上下文和安全策略的开发者。

| 需求 | Synapse 的处理方式 |
| --- | --- |
| 切换 Provider | 通过协议、认证方式、BaseURL、模型和密钥环境变量进行配置 |
| 保留项目上下文 | 从本地加载 `AGENTS.md`、`CLAUDE.md`、`SOUL.md` 和长期记忆 |
| 控制危险工具 | 写文件、Shell、网络、敏感读取和子 Agent 都受权限控制 |
| 自动执行但不回退宿主 Shell | `workspace-auto` 只在 Bubblewrap 或 Docker 隔离可用时执行命令 |
| 检查执行过程 | 权限决策和工具生命周期写入 `logs/audit.jsonl` |

项目不宣称这些概念只有 Synapse 才有。Synapse 的重点是把 Provider 可移植性、持久上下文和严格执行边界放在一个可检查的 CLI 中。

## 常用工作流

```bash
synapse provider list
echo "解释这个失败的测试" | synapse chat --pipe
synapse memory search "发布约定"

synapse mcp add local node ./server.mjs
synapse mcp trust local

synapse network allow docs.example.com
```

## 安全模型

工具权限分为 `allow`、`ask` 和 `deny`。非敏感的工作区读取可以直接运行；写入、命令执行、网络访问、敏感文件读取、Git 提交和子 Agent 默认需要确认。

明确授权一个工作区自动执行时，可以使用：

```bash
synapse chat --permission-mode workspace-auto --sandbox-backend auto
```

自动执行要求 Bubblewrap 或 Docker 通过实际隔离探测。没有可用的严格后端时，Synapse 会拒绝执行，而不是回退到宿主 Shell。

详细设计见：

- [工具边界与 Provider 编解码](./docs/adr/0001-secure-tool-boundary-and-provider-codecs.md)
- [隔离、MCP 信任、网络策略与 TUI 控制](./docs/adr/0002-isolation-trust-network-context-and-tui.md)
- [可信上下文与可执行文件身份](./docs/adr/0003-trusted-context-and-executable-identity.md)

## 记忆与配置

```bash
synapse memory inspect
synapse memory search "项目约定"
synapse memory prune --older-than 90          # 只预览
synapse memory prune --older-than 90 --yes    # 确认删除
synapse memory export memories.json
```

搜索和导出默认排除会话记录，只有显式传入 `--include-sessions` 才会包含。

## 验证状态

`v0.3.2` 本地验证有 260 项测试通过、2 项按环境跳过，覆盖单元、集成、协议、CLI 和对抗性安全路径。CI 在 Windows 和 Linux 上运行 Node.js 18/22；独立的 Linux 任务会真实运行严格沙箱，检查工作区写入、宿主路径隔离、网络禁用和 PID 隔离。

```bash
npm ci
npm run lint
npm test
npm run build
npm pack --dry-run
npm audit
```

## 项目状态

Synapse 仍处于早期阶段。`v0.3.2` 已完成验证，但在 `v1.0.0` 之前，命令名和配置细节仍可能调整。查看[当前路线图](./docs/ROADMAP.md)和[更新记录](./CHANGELOG.md)。

需要了解真实架构、工程取舍和个人贡献边界时，请阅读[项目案例页](./docs/CASE-STUDY.zh-CN.md)、[中文面试讲稿](./docs/INTERVIEW-GUIDE.zh-CN.md)以及[来源整改 ADR](./docs/adr/0004-provenance-remediation-and-maintenance.md)。

## 参与项目

欢迎提交可复现的 Bug、Provider 兼容性结果、文档修复和范围清晰的 Pull Request。请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。设计讨论可以放到 [Discussions](https://github.com/bandageok/synapse-cli/discussions)。

安全问题请按照 [SECURITY.md](./SECURITY.md) 私下报告，不要创建公开 Issue。

## 许可证

MIT，详见 [LICENSE](./LICENSE)。
