# Synapse CLI 中文面试讲稿

这份讲稿用于帮助你解释设计，不是让你背诵。凡是无法在白板上画出、无法在代码中定位、无法回答追问的内容，都不要写进简历。

## 投递前先确认身份边界

Git 历史包含两组主要署名：

- `C.C.Claw <cclaw@cclaw.dev>`：63 个提交；
- `BandageOK/bandageok`：12 个已提交阶段，外加当前来源整改工作。

面试前必须按事实选择一种说法。

### 情况 A：C.C.Claw 是你的旧身份

> C.C.Claw 是我早期开发该项目时使用的提交身份，后来统一到 BandageOK。仓库保留了完整历史，我可以解释早期架构和后续工程化过程。

准备能够证明身份关系的记录。仅凭口头说明不能替代证据。

### 情况 B：C.C.Claw 不是你

> 项目包含早期已有代码。我的贡献从 BandageOK 提交开始，主要是 Provider/Memory 工程化、安全边界、跨平台验证和公开发布。我不会把早期实现算作个人从零开发。

不要说“整个项目都是我写的”。这是最容易在 Git log 和代码追问中被识破的表述。

## 30 秒版本

> Synapse 是一个 TypeScript 编写的本地优先 Coding Agent CLI。我主要解决了三个工程问题：第一，用协议、认证、BaseURL 和模型配置解耦 Provider；第二，把项目记忆限制在可追踪的本地文件和信任边界内；第三，让模型工具调用经过 Schema、路径、权限和严格沙箱，隔离不可用时拒绝自动执行。项目已发布到 npm，并用 Windows/Linux、Node 18/22 CI 和真实 Bubblewrap 隔离测试验证。

## 2 分钟版本

> 我做这个项目时，没有把目标定成“功能最多的 Agent”，而是选择三个容易出真实工程问题的方向。
>
> Provider 方面，我把 Preset 降级成默认数据，运行时统一解析 protocol、auth、BaseURL、model 和 apiKeyEnv。Engine 不知道具体厂商，协议适配器负责 OpenAI-compatible 或 Anthropic-compatible 消息转换，并保留工具调用 ID。主模型只有在没有输出任何 token 时才允许 fallback，避免半段答案后换模型。
>
> Provider 解耦还暴露过一个身份问题：DeepSeek 路由下的模型曾错误自称 Claude。我的修复不是增加一句品牌文案，而是建立三层身份契约：Synapse/BandageOK 是不可变产品归属，IDENTITY.md 只控制本地展示档案，Provider/模型作为转义后的运行时事实单独注入。这样切换模型不会改变产品身份，旧会话中的错误自述也不能覆盖系统事实。
>
> Memory 方面，我把用户级、项目级、局部规则和长期记忆分层加载。include 必须留在所属 root 内，realpath、深度、文件数和总字符数都有边界。最近一次整改还替换了旧的后台维护器：现在只维护实际注入的根目录 MEMORY.md，使用独占 lease 和原子 rename，不再保留未接入运行时的 Prompt 与 SessionIndex 模块。
>
> 安全方面，模型参数先过 AJV Schema，再过工作区路径和敏感文件检查，最后由共享 PermissionManager 做 allow/ask/deny。权限与隔离分开：ask 是逐次确认后宿主执行，auto 从不询问但只允许工作区安全能力，full-access 是显式无询问宿主执行。auto 只有在 Bubblewrap 或 Docker 探测成功时才执行 Shell；失败会返回错误。CI 除了单测，还真的启动 Bubblewrap，验证宿主路径、网络和 PID 隔离。
>
> 我最重要的一次修正是在来源审查时发现 Heartbeat 绕过 ToolRegistry 直接执行 shell。这个问题与公开的 Fail-closed 承诺冲突，所以我删除了这条能力，并用恶意 marker 命令做了回归测试。

## 5 分钟白板顺序

```text
Provider config -> Runtime resolver -> Protocol codec -> Engine
                                             |
User request -> Context builder ------------>|
                                             v
Model tool use -> ToolRegistry -> Permission -> Sandbox -> Result
                     |
                audit.jsonl
```

讲解顺序：

1. 先说为什么 Provider 与 Engine 解耦；
2. 再说 Memory 为什么是上下文，不是权限；
3. 然后说 ToolRegistry 的拒绝路径；
4. 最后用 CI 和真实沙箱证明这些不是文档口号。

## 深挖一：Provider 路由

### 面试官：为什么不用每个厂商一个硬编码配置？

> 企业经常通过自建网关或代理访问模型，厂商名不能决定协议和认证。我的运行时对象由 protocol、auth、BaseURL、model、apiKeyEnv 组成，Preset 只负责填默认值。这样新增兼容端点不需要修改 Engine。

代码入口：

- `src/providers/management.ts`: 配置归一化、密钥来源、Provider probe；
- `src/providers/factory.ts`: 按 protocol 创建 codec；
- `src/providers/openrouter.ts`、`anthropic.ts`: 流式协议转换；
- `tests/provider-tool-protocol.test.ts`: tool call id 和 fallback 语义。

### 面试官：Fallback 为什么不能随时切？

> 如果主模型已经输出一部分内容，再切模型会重复回答、丢失隐藏状态或改变工具调用语义。因此只在首个输出之前 fallback。401 和参数错误属于确定性配置问题，也不应通过换模型掩盖。

### 面试官：API key 怎么处理？

> 配置保存环境变量名，不保存明文值。运行时先查进程环境，再查用户数据目录的 `.env`。Provider list 只显示 key 来源和变量名。CLI 写 `.env` 时用临时文件和 rename，并拒绝包含换行的 key。

### 面试官：为什么模型会把 Synapse 说成 Claude？你怎么修？

> 大模型没有稳定的产品自我认知，只会根据当前 system prompt 和历史消息生成答案。旧实现写了“You are Synapse”，但没有开发者事实，也没有注入当前 Provider/模型，IDENTITY.md 甚至没有接入 Context。模型在信息缺口里产生了身份幻觉。修复后，官方产品身份进入不可变内核，配置文件只能调整档案风格，运行时路由以单行、限长、JSON 引号包裹的数据注入，并用真实 CLI 假 endpoint 捕获最终请求做回归测试。

## 深挖二：记忆系统

### 面试官：Memory 和 RAG 有什么区别？

> 当前实现更接近受控的文件上下文，不是向量数据库 RAG。它强调可读、可编辑、可导出和确定性搜索。对个人 CLI 来说，这是成本更低且容易审计的起点。未来只有在用户规模和检索质量数据支持时才需要向量检索。

### 面试官：仓库里的 AGENTS.md 能不能改变安全规则？

> 不能。MemoryLoader 把它当低优先级、可能不可信的项目上下文。安全内核在 Context 中独立构建，工具侧还有 Schema、权限和路径硬边界。Prompt 顺序只是纵深防御，不是最终授权机制。

### 面试官：为什么删除 MemoryExtractor 和 SessionIndex？

> 它们只被自身测试引用，没有接入 Provider、SessionStore 或 memory CLI。继续保留会制造“看起来有功能”的假复杂度和来源风险。删除后，我把真实需求收敛成确定性 MemoryMaintenance，并给锁、路径和字节限制补测试。

### 面试官：维护器如何处理崩溃？

> 运行前用 `wx` 独占创建 lease。lease 超过配置时间视为陈旧，可以恢复。状态和 MEMORY.md 先写临时文件再 rename。只有维护成功才更新时间戳，失败不会让下一次维护被错误延迟。

## 深挖三：Fail-closed 沙箱

### 面试官：你如何定义 Fail-closed？

> 不是“尽量安全”，而是关键前置条件缺失时拒绝执行。例如权限没有初始化、Schema 不存在、路径越界、ask 需要审批但没有 humanApproved、auto 没有严格隔离后端，都会返回错误，而不是降级到更危险路径。full-access 是用户显式选择的另一种策略，不是 auto 的隐式降级。

### 面试官：为什么要同时提供 auto 和 full-access？

> 因为“是否询问”和“在哪里执行”是两个问题。auto 的 approval policy 是 never，但 Bash 必须进入严格工作区沙箱，不能隔离的 PowerShell 等工具直接 deny；full-access 同样 never，但明确使用宿主 shell 并显示警告。两者不能混成一个模糊的 yolo 开关，否则沙箱失败时就可能静默扩大权限。

### 面试官：会话内切换为什么需要共享状态？

> 如果 REPL、ToolRegistry 和 Bash 各自保存模式，`/permissions` 可能只改了界面，旧 Bash 实例仍使用原隔离方式。我让它们共享一个 PermissionManager，子 Agent 的受限 Registry clone 也引用同一模式，所以一次切换会同时改变审批决策和 Shell 隔离。持久默认、单次启动覆盖和会话内切换是三个明确作用域。

### 面试官：ToolRegistry 的顺序为什么重要？

> Schema 和路径检查必须发生在工具执行前，权限判断也不能依赖工具自己实现。集中边界可以覆盖内置工具和受限子 Agent，并减少每个工具各写一套策略产生的遗漏。

### 面试官：Windows 上怎么做严格隔离？

> 当前 auto 模式在 Windows 依赖 Docker。PowerShell 的 Constrained Language Mode 不是操作系统级沙箱，所以不会被描述成等价替代；auto 会直接拒绝宿主 PowerShell。ask 可在明确审批后运行宿主命令，full-access 则是用户显式选择的不询问宿主模式。

### 面试官：你发现过安全设计与实现不一致吗？

> 有。Heartbeat 过去会解析 HEARTBEAT.md 中的 shell 代码块并直接 execSync。它绕过了 ToolRegistry。我删除了用户文件命令执行，只保留进程内观察器，并加了 marker 文件回归测试。这也促使我把审计方法从“检查 ToolRegistry”扩大到“搜索所有进程创建点”。

## 深挖四：测试策略

### 面试官：为什么 200 多个单测还不够？

> Mock 可以证明参数拼装，但不能证明 Bubblewrap 在 CI 机器上真的隔离了宿主路径和网络。因此测试分为单元、协议、CLI 集成、对抗和运行时隔离五层。高风险边界至少需要一个真实执行路径。

### 面试官：跨平台主要踩过什么坑？

> Node 18 API 差异、Windows 命令入口、路径大小写/盘符、junction、Linux shell 行为和容器挂载 ownership。CI 使用 Windows/Ubuntu 与 Node 18/22 组合，严格沙箱只在具备 Bubblewrap 的 Linux 作业运行。

### 面试官：你怎么避免测试数量成为虚荣指标？

> 删除未使用模块时，我也删除了只证明 Prompt 包含某个字符串的测试。新测试围绕用户可见契约和失败模式，例如错误 MEMORY.md 路径、并发 lease、`d0` 解析、Heartbeat shell 旁路。覆盖的是风险，不是行数。

## 可验证的个人贡献讲法

不要一次讲完所有提交。按岗位选择两组。

### AI Agent / LLM 应用岗位

> 我主要完成了 `a59df02` 的 Provider/Memory 管理和 `cdc8944` 的 Agent 边界加固。前者把 Provider 变成配置驱动协议层，后者补了工具协议、上下文信任、MCP 指纹、网络策略和沙箱。我可以从 Provider request 一直讲到 tool result 回传。

### TypeScript / Node.js 工程岗位

> 我重点负责跨平台发布与测试：`e39818a`、`ee7cc74` 增加 CI、Doctor、Node 18/Linux 兼容；`0bbc297` 把 Onboarding 和真实会话拆成可测试流程；后续用干净 npm 安装和 Windows/Linux CI 验证发布路径。

### 安全 / Developer Tools 岗位

> 我在 `cdc8944` 建立集中 ToolRegistry 边界，并通过四个后续提交把 Bubblewrap 探测、网络隔离和工作区 ownership 从 mock 修到真实 CI 可运行。最近又删除了 Heartbeat 的宿主 shell 旁路。

当前版本还把 Codex 中“审批策略与沙箱策略分离”的原则落成 Synapse 自己的三配置模型。我实现了共享 PermissionManager、持久/启动/会话三层入口、兼容别名、状态展示和真实 `--yolo` Bash 往返测试，同时保留集中校验与审计层。

## AI 辅助开发怎么回答

推荐直接回答，不要回避：

> 我使用了 Codex 等 AI 工具辅助代码检索、实现和测试，但需求边界、设计取舍、验收标准和发布责任由我承担。我不会把整个历史仓库说成纯手写，也会通过提交、测试和设计记录说明我实际负责的部分。对关键模块，我能在不依赖 AI 的情况下解释调用链、失败模式和取舍。

说完后，面试官通常会用代码追问验证。必须提前做到：

- 能手画 Provider 与 ToolRegistry 调用链；
- 能解释 `auto` 为什么不会回退，以及它与 `full-access` 的区别；
- 能现场指出一个安全测试；
- 能解释本次删除三个模块的依据；
- 能说出一个自己判断错误后如何修正的例子。

## 现场演示脚本

控制在 3 分钟：

```bash
npm install -g @bandageok/synapse-cli
synapse init
synapse provider set company-gateway \
  --base-url http://127.0.0.1:8080/v1 \
  --protocol openai \
  --model local-model \
  --api-key-env COMPANY_LLM_API_KEY
synapse doctor
synapse permissions set auto
synapse memory inspect
```

没有可用 Provider 时，运行仓库内的离线 Demo：

```bash
npm ci
node examples/demo/run-demo.mjs
```

演示时说清楚：本地 endpoint 是确定性测试服务，用于证明 Provider 协议和 Memory 注入，不是假装调用真实模型。

## 不要说的话

- “这是完全从零、纯手写的原创项目。”
- “已经有几百个真实用户。”
- “Windows PowerShell 有完整沙箱。”
- “支持所有 OpenAI/Anthropic API 行为。”
- “有 200 多测试，所以没有安全问题。”
- “MIT License 已经解决历史代码来源问题。”

## 面试前检查清单

- [ ] 确认 `C.C.Claw` 是否是本人历史身份，并准备一致说法
- [ ] 只在简历写自己能解释的提交范围
- [ ] 重新跑 lint、test、build 和离线 Demo
- [ ] 打开 ADR-0001 到 ADR-0005，能各用一句话解释
- [ ] 准备一个失败案例：Heartbeat shell 旁路
- [ ] 准备一个兼容案例：Node 18 / Windows / Linux
- [ ] 准备一个取舍案例：删除未接入的 MemoryExtractor/SessionIndex
- [ ] 不把 npm 下载量当作活跃用户数
