# Synapse P0 修复计划

## 进度追踪
- [x] P0-1: 实现 /resume（读 SessionStore + 恢复 messages）
- [x] P0-2: 实现 /compact（调用 Compressor.autoCompact）
- [x] P0-3: 实现 /undo（FileEdit 前快照 + 回滚）
- [x] P0-4: AgentTool → 调用 createTaskTool（TaskTool.ts 已实现）
- [x] P0-5: REPL 注册 diffCommand + undoCommand + 遗漏工具
- [x] P0-6: init.ts 注册 PowerShell/Image/TTS/Task 工具
- [x] P0-7: REPL 添加 permission === 'ask' 交互逻辑
- [x] P0-8: init.ts 实例化 Heartbeat + Dream 并启动

## 修复结果
- 测试：178/178 全通过
- 构建：成功（94ms）
- 工具数：17 → 19（Task + PowerShell/Image/TTS 注册，AgentTool 移除）
- 命令：16 → 18（+diffCommand, +undoCommand）

## 详细修复记录

### P0-1: /resume 实现 ✅
- CommandDeps 添加 setMessages 可选字段
- REPL 使用 allMessagesRef 同步 messages
- resumeCommand 使用 setMessages 恢复会话

### P0-2: /compact 实现 ✅
- 估算 token 数（length/4）
- 保留最近 6 条消息生成摘要
- 使用 setMessages 替换消息历史

### P0-3: /undo 实现 ✅
- FileEdit 执行前创建 .synapse-bak 快照
- /undo 从 .synapse-bak 恢复或反向替换
- 支持 FileEdit 反向操作

### P0-4: AgentTool 替换 ✅
- createTaskTool 注入 provider/tools/context/hooks/compressor/errorRecovery
- 支持子代理多轮对话 + 工具过滤

### P0-5: REPL 注册遗漏命令 ✅
- builtin/index.ts 导出 diffCommand + undoCommand
- REPL 注册列表添加这两个命令

### P0-6: init.ts 注册遗漏工具 ✅
- PowerShellTool, ImageReadTool, ImageGenerateTool, TtsTool
- 工具总数 17 → 19

### P0-7: permission 'ask' 交互 ✅
- Engine 添加 EngineOptions.onPermissionAsk 回调
- types.ts 添加 permission_ask 事件类型
- REPL 弹出权限确认 UI（A/D 输入）

### P0-8: Heartbeat/Dream 接入 ✅
- init.ts 实例化 Heartbeat + Dream
- Heartbeat.setDream(dream) 注入
- Heartbeat.tick() 中检查 Dream.shouldTrigger()
- REPL 启动时调用 heartbeat.start()
