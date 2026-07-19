# Synapse P1 修复计划

## 进度追踪
- [x] P1-1: `-p` pipe 模式（stdin 管道输入）
- [x] P1-2: MCP 集成到 init.ts
- [x] P1-3: Plugin 集成到 init.ts
- [x] P1-4: Token 精确计数
- [x] P1-5: `/context` 可视化
- [x] P1-6: `/memory` 支持编辑
- [x] P1-7: `--model` 传递到 Provider
- [x] P1-8: `--verbose` 调试模式
- [x] P1-9: `provider list/test/set`（预设目录 + 任意 BaseURL）
- [x] P1-10: `memory inspect/search/prune/export`

## 修复结果
- 测试：178/178 全通过
- 构建：成功（80ms）
- 工具数：19
- 命令数：19（+contextCommand）

## 详细修复记录

### P1-1: `-p` pipe 模式 ✅
- CLI 添加 `-p, --pipe` 选项
- stdin 读取 → Engine 处理 → stdout 输出
- 支持 `-v` verbose 输出工具调用到 stderr

### P1-2: MCP 集成 ✅
- init.ts 创建 MCPClient 实例
- 加载 .mcp.json 配置
- 连接 MCP 服务器并注册工具

### P1-3: Plugin 集成 ✅
- init.ts 创建 PluginRegistry 实例
- 加载 ~/.synapse/plugins/ 目录

### P1-4: Token 精确计数 ✅
- CJK 字符：1.5 chars/token
- 英文/数字/符号：4 chars/token
- 混合文本加权计算

### P1-5: `/context` 可视化 ✅
- 显示 6 层上下文状态
- 显示文件存在性检查
- 显示 token 估算

### P1-6: `/memory` 支持编辑 ✅
- `/memory` 查看
- `/memory add <text>` 追加
- `/memory reload` 清除缓存
- 200 行限制检查

### P1-7: `--model` 传递 ✅
- createProvider 接受 model 参数
- init.ts 传递 opts.model

### P1-8: `--verbose` ✅
- CLI 添加 `-v, --verbose` 选项
- pipe 模式下输出工具调用到 stderr

### P1-9: Provider 管理 ✅
- `synapse provider list` 显示主流预设、当前连接、协议和凭据来源
- `synapse provider set` 支持任意 provider 名称、BaseURL、model、protocol、auth 和 API key 环境变量
- `synapse provider test` 用 1 token 请求验证 key、endpoint、协议和模型
- Provider 工厂仅依赖配置的兼容协议，不再按厂商名称写死分支

### P1-10: Memory 运维 ✅
- `synapse memory inspect` 显示来源、容量和上下文注入状态
- `synapse memory search` 提供带文件和行号的字面量检索
- `synapse memory prune` 默认预览，显式 `--yes` 才删除受管理的旧文件
- `synapse memory export` 支持 JSON/Markdown，默认排除会话记录和所有密钥配置
- REPL `/memory add` 现在真实写盘，`/memory reload` 真实清理上下文缓存
