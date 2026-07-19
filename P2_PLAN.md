# Synapse P2 修复计划

## 进度追踪
- [x] P2-1: `--add-dir` 多目录 CLAUDE.md 加载
- [x] P2-2: `/context` 可视化增强（显示文件路径 + 内容摘要）
- [x] P2-3: Compressor LLM 摘要（用 Provider 生成摘要而非截断）
- [x] P2-4: `synapse update` 自动更新
- [x] P2-5: `synapse logs` 日志系统
- [x] P2-6: FakeExecutionWatchdog 接入 Engine
- [x] P2-7: SelfImprovement 接入 Engine
- [x] P2-8: MemoryExtractor 接入 Heartbeat

## 修复结果
- 测试：178/178 全通过
- 构建：成功（114ms）
- 工具数：19
- 命令数：21（+update, +logs）
- 源文件：79 个，193KB

## 详细修复记录

### P2-1: `--add-dir` 多目录 ✅
- CLI 添加 `--add-dir <dirs...>` 选项
- ContextBuilder 添加 additionalDirs 配置
- layer4_userContext 加载额外目录的 CLAUDE.md

### P2-2: `/context` 可视化增强 ✅
- 树形结构显示 6 层上下文
- 显示文件大小和行数
- 显示 .synapse/rules/ 规则文件

### P2-3: Compressor LLM 摘要 ✅
- CompressorConfig 添加 provider 可选字段
- autoCompact 优先使用 LLM 生成摘要
- 无 Provider 时回退到截断模式

### P2-4: `synapse update` ✅
- 查询 npm registry 最新版本
- 比较本地版本号
- `--check` 只检查不更新
- 自动执行 `npm update -g synapse`

### P2-5: `synapse logs` ✅
- Logger 类：debug/info/warn/error 级别
- 日志文件：~/.synapse/logs/synapse.log
- `--follow` 实时跟踪
- `--lines <n>` 显示行数
- Engine 注入 logger 记录 turn 和 error

### P2-6: FakeExecutionWatchdog 接入 ✅
- EngineOptions 添加 watchdog 字段
- Engine 在每次 assistant 回复后调用 watchdog.recordTurn

### P2-7: SelfImprovement 接入 ✅
- EngineOptions 添加 selfImprovement 字段
- 工具执行错误时自动记录到 .learnings/ERRORS.md

### P2-8: MemoryExtractor 接入 ✅
- Heartbeat 添加 memoryExtractor 字段
- 检查最近会话是否需要提取记忆
