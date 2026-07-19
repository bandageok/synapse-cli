# Synapse v0.3.0 — 完善计划

> 目标：将 Synapse 从 40% 骨架完成度提升到 90%+，达到独立 CLI 编程 Agent 产品的完整度

## 阶段 1：核心引擎加固（P0）

### 1.1 BashTool 沙箱隔离
- [ ] 添加 sandbox-exec 支持（macOS）/ seccomp（Linux）
- [ ] 超时控制从 30s 改为可配置
- [ ] 添加工作目录白名单
- [ ] 添加命令黑名单（rm -rf /, dd, mkfs 等）

### 1.2 权限系统完善
- [ ] ToolRegistry.checkPermission 实现完整逻辑
- [ ] 权限对话框集成到 REPL
- [ ] 权限持久化（permissions.json）
- [ ] 工具权限分级：read < write < execute < network

### 1.3 错误恢复增强
- [ ] 添加熔断器（circuit breaker）到 ErrorRecovery
- [ ] 添加指数退避重试
- [ ] 添加 context_too_long 自动压缩触发
- [ ] 添加 rate_limit 自动等待

## 阶段 2：工具系统扩展（P1）

### 2.1 新增工具
- [ ] TaskTool — 真实子代理实现（替换 AgentTool stub）
- [ ] McpTool — MCP 协议客户端
- [ ] LspTool — LSP 集成
- [ ] PowerShellTool — Windows PowerShell 支持
- [ ] ImageTool — 图片读取/生成
- [ ] TtsTool — 文字转语音

### 2.2 工具增强
- [ ] BashTool: 添加 pty 支持
- [ ] FileEditTool: 支持多处替换
- [ ] WebFetchTool: 添加 markdown 提取模式
- [ ] GrepTool: 添加 ripgrep 支持

## 阶段 3：CLI & REPL 完善（P1）

### 3.1 CLI 命令扩展（7 → 20+）
- [ ] synapse config — 配置管理
- [ ] synapse update — 自更新
- [ ] synapse login — API key 管理
- [ ] synapse logs — 日志查看
- [ ] synapse benchmark — 性能测试
- [ ] synapse export — 会话导出
- [ ] synapse import — 会话导入
- [ ] synapse theme — 主题管理
- [ ] synapse alias — 命令别名
- [ ] synapse shell — 交互式 shell
- [ ] synapse serve — HTTP API 服务
- [ ] synapse watch — 文件监控模式
- [ ] synapse pipe — 管道模式

### 3.2 REPL 命令扩展（16 → 30+）
- [ ] /undo — 撤销上一步
- [ ] /redo — 重做
- [ ] /diff — 显示变更
- [ ] /commit — git commit
- [ ] /branch — 分支管理
- [ ] /test — 运行测试
- [ ] /lint — 代码检查
- [ ] /format — 代码格式化
- [ ] /deploy — 部署
- [ ] /monitor — 监控
- [ ] /debug — 调试模式
- [ ] /trace — 执行追踪
- [ ] /benchmark — 性能测试
- [ ] /snapshot — 快照
- [ ] /restore — 恢复快照
- [ ] /share — 分享会话
- [ ] /collab — 协作模式

### 3.3 REPL UI 增强
- [ ] 添加语法高亮
- [ ] 添加自动补全
- [ ] 添加历史搜索（Ctrl+R）
- [ ] 添加多行编辑
- [ ] 添加分屏模式
- [ ] 添加主题系统

## 阶段 4：MCP 完整实现（P1）

### 4.1 MCP 协议
- [ ] 实现 MCP 1.0 规范
- [ ] 支持 stdio 传输
- [ ] 支持 SSE 传输
- [ ] 支持 WebSocket 传输
- [ ] 工具发现和注册
- [ ] 资源管理
- [ ] 提示词管理

### 4.2 MCP 管理
- [ ] synapse mcp add — 添加服务器
- [ ] synapse mcp remove — 移除服务器
- [ ] synapse mcp list — 列出服务器
- [ ] synapse mcp test — 测试连接
- [ ] synapse mcp logs — 查看日志

## 阶段 5：灵魂系统增强（P2）

### 5.1 Dream 整合完善
- [ ] 添加 LLM 调用到 Dream consolidation
- [ ] 添加记忆去重
- [ ] 添加记忆重要性评分
- [ ] 添加记忆衰减

### 5.2 Self-Improvement 增强
- [ ] 添加模式识别（3x 确认提升）
- [ ] 添加自动修正建议
- [ ] 添加知识图谱

### 5.3 Heartbeat 增强
- [ ] 添加任务依赖
- [ ] 添加任务优先级
- [ ] 添加任务超时
- [ ] 添加任务重试

## 阶段 6：基础设施（P2）

### 6.1 测试覆盖
- [ ] 添加 MCP 测试
- [ ] 添加权限系统测试
- [ ] 添加沙箱测试
- [ ] 添加 E2E 测试
- [ ] 添加性能测试

### 6.2 文档
- [ ] API 文档
- [ ] 插件开发指南
- [ ] MCP 集成指南
- [ ] 贡献指南

### 6.3 CI/CD
- [ ] GitHub Actions
- [ ] 自动发布
- [ ] 代码覆盖率
- [ ] 安全扫描

## 阶段 7：发布准备（P3）

### 7.1 打包
- [ ] npm 包优化
- [ ] Docker 镜像
- [ ] Homebrew formula
- [ ] Scoop manifest

### 7.2 社区
- [ ] GitHub 仓库
- [ ] 文档站点
- [ ] 示例项目
- [ ] 插件市场
