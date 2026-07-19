# Synapse P2-4 & P2-5 实现方案

## P2-4: `synapse update` 自动更新

### 方案设计
- 对标 OpenClaw `openclaw update`
- 使用 npm registry 检查最新版本
- 比较本地 package.json 版本
- 自动执行 `npm update -g synapse`

### 实现步骤
1. CLI 添加 `update` 命令
2. 读取本地版本（package.json）
3. 查询 npm registry 最新版本
4. 比较版本号
5. 执行更新命令

## P2-5: `synapse logs` 日志系统

### 方案设计
- 对标 OpenClaw `openclaw logs --follow`
- 日志文件：`~/.synapse/logs/synapse.log`
- 支持实时跟踪（tail -f）
- 日志级别：info/warn/error/debug

### 实现步骤
1. 创建 Logger 类
2. 在关键位置注入日志
3. CLI 添加 `logs` 命令
4. 支持 `--follow` 实时跟踪
