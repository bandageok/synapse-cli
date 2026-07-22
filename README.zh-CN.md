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
synapse
```

可以直接带入首个任务，也可以使用有界的自动化入口：

```bash
synapse "解释这个失败的测试"
synapse exec "解释这个失败的测试"
```

`synapse chat` 和 `synapse chat --pipe` 仍作为兼容别名保留。交互工作使用 `synapse`，脚本和 CI 使用 `synapse exec`。

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
| 控制危险工具 | 可选择逐次确认、工作区安全自动执行或显式无确认宿主执行 |
| 自动执行但不回退宿主 Shell | `auto` 只在 Bubblewrap 或 Docker 隔离可用时执行命令 |
| 检查执行过程 | 权限决策和工具生命周期写入 `logs/audit.jsonl` |

项目不宣称这些概念只有 Synapse 才有。Synapse 的重点是把 Provider 可移植性、持久上下文和严格执行边界放在一个可检查的 CLI 中。

## 常用工作流

```bash
synapse provider list
synapse exec "解释这个失败的测试"
echo "解释这个失败的测试" | synapse exec
synapse memory search "发布约定"
synapse permissions set auto

synapse mcp add local node ./server.mjs
synapse mcp trust local

synapse network allow docs.example.com
```

## 安全模型

Synapse 将“是否请求确认”和“Shell 是否隔离”分开，提供三种权限配置：

| 配置 | 确认策略 | Shell 执行方式 |
| --- | --- | --- |
| `ask`（默认） | 写入、执行、网络和敏感读取逐次确认 | 确认后使用宿主 Shell |
| `auto` | 从不弹出确认 | 严格 Bubblewrap/Docker 工作区沙箱；不可用时拒绝执行 |
| `full-access` | 从不弹出确认 | 直接使用宿主 Shell，不启用严格隔离 |

可以设置持久默认值、覆盖一次启动，或在当前交互会话中切换：

```bash
synapse permissions set auto                 # 后续新会话
synapse --permission-mode full-access        # 仅本次启动
synapse --yolo                               # full-access 的别名
synapse resume 1 --yolo                      # 恢复会话时同样可覆盖
/permissions ask                             # 交互会话内切换
```

`workspace-auto` 仍是 `auto` 的兼容别名，`yolo` 是 `full-access` 的别名。`full-access` 会在启动和切换时显示警告；它关闭审批与严格 Shell 隔离，但不会绕过 JSON Schema、禁用工具列表、危险命令检查、文件工具路径边界、MCP 信任和网络目标控制。

如果确认框已经出现，可直接按 `F` 或 `Y`：Synapse 会把当前会话切到 `full-access`，并立即允许这次工具调用。`A` 只允许当前一次，`D` 拒绝；弹窗内切换不会修改持久默认值。

`auto` 要求 Bubblewrap 或 Docker 通过实际隔离探测。没有可用的严格后端时，Synapse 会拒绝 Shell 执行，而不是回退到宿主 Shell；无法留在严格边界内的 PowerShell 等能力也会直接拒绝，不再弹出确认。

详细设计见：

- [工具边界与 Provider 编解码](./docs/adr/0001-secure-tool-boundary-and-provider-codecs.md)
- [隔离、MCP 信任、网络策略与 TUI 控制](./docs/adr/0002-isolation-trust-network-context-and-tui.md)
- [可信上下文与可执行文件身份](./docs/adr/0003-trusted-context-and-executable-identity.md)
- [产品身份与 Provider 边界](./docs/adr/0005-product-identity-and-provider-boundary.md)
- [权限配置与动态切换](./docs/adr/0006-permission-profiles-and-dynamic-switching.md)
- [产品事实与运行时状态](./docs/adr/0010-product-truth-and-runtime-state.md)
- [可执行权限测试矩阵](./docs/PERMISSION-TEST-MATRIX.md)

## 记忆与配置

Synapse 的产品身份固定为由 BandageOK 开发和维护的本地优先 Coding Agent CLI。`IDENTITY.md` 只控制可配置的展示档案；当前 Provider 和模型会作为独立的运行时推理路由披露，切换模型不会改变产品归属。

```bash
synapse memory inspect
synapse memory search "项目约定"
synapse memory prune --older-than 90          # 只预览
synapse memory prune --older-than 90 --yes    # 确认删除
synapse memory export memories.json
```

搜索和导出默认排除会话记录，只有显式传入 `--include-sessions` 才会包含。

## 已包含能力

- 支持 Vim 编辑的 Ink 交互界面
- OpenAI 兼容和 Anthropic 兼容 Provider 编解码
- 文件、Shell、搜索、Git、Notebook、Web、图片、TTS 和子 Agent 工具
- 带显式信任与能力漂移检查的 MCP 客户端
- 只读的插件清单验证；第三方插件命令、Skill 和 Hook 仍保持未激活
- 运行时模型切换、明确标注的用量估算和 `resume --last`
- 原子会话持久化、每轮实时加载记忆和项目指令发现
- 运行时 Schema 校验、审计日志和工作区路径隔离

## 验证状态

`v0.6.1` 有 470+ 项测试通过，覆盖单元、状态矩阵、组件、集成、协议、CLI 和对抗性安全路径。只有在所需平台或隔离后端不可用时，才会跳过对应的环境测试。CI 在 Windows 和 Linux 上运行 Node.js 18/22；独立的 Linux 任务会真实运行严格沙箱，检查工作区写入、宿主路径隔离、网络禁用和 PID 隔离。

```bash
npm ci
npm run lint
npm run test:permissions
npm test
npm run build
npm pack --dry-run
npm audit
```

## 项目状态

Synapse 仍处于早期阶段。`v0.6.1` 已完成验证，但在 `v1.0.0` 之前，命令名和配置细节仍可能调整。查看[当前路线图](./docs/ROADMAP.md)和[更新记录](./CHANGELOG.md)。

需要了解真实架构、工程取舍和个人贡献边界时，请阅读[项目案例页](./docs/CASE-STUDY.zh-CN.md)、[中文面试讲稿](./docs/INTERVIEW-GUIDE.zh-CN.md)以及[来源整改 ADR](./docs/adr/0004-provenance-remediation-and-maintenance.md)。

## 参与项目

欢迎提交可复现的 Bug、Provider 兼容性结果、文档修复和范围清晰的 Pull Request。请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。设计讨论可以放到 [Discussions](https://github.com/bandageok/synapse-cli/discussions)。

安全问题请按照 [SECURITY.md](./SECURITY.md) 私下报告，不要创建公开 Issue。

## 许可证

MIT，详见 [LICENSE](./LICENSE)。
