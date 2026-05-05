# GLM Usage SwiftBar 插件

在 macOS 顶栏显示 GLM Coding Plan 的 Token 使用量（5小时窗口）。

## 功能特性

- 📊 实时显示 Token 使用百分比
- 🎨 根据使用率自动变色（绿色 < 30%，黄色 < 60%，橙色 < 85%，红色 ≥ 85%）
- 🔄 支持手动刷新和清除缓存
- 📈 显示总调用次数和总 Token 数
- ⚙️ 支持配置文件和 API 密钥

## 安装步骤

### 1. 安装 SwiftBar

首先需要安装 [SwiftBar](https://github.com/swiftbar/SwiftBar)：

```bash
brew install --cask swiftbar
```

或从官网下载：https://swiftbar.app/

### 2. 安装插件

将插件脚本复制到 SwiftBar 插件目录：

```bash
# 方法 1: 创建符号链接（推荐）
ln -s /Users/guoruidong/ppray.github.io/swiftbar-glm-usage.10m.sh \
  ~/Library/Application\ Support/SwiftBar/plugins/

# 方法 2: 直接复制文件
cp /Users/guoruidong/ppray.github.io/swiftbar-glm-usage.10m.sh \
  ~/Library/Application\ Support/SwiftBar/plugins/
```

### 3. 配置 API 密钥（可选）

如果需要使用真实的 GLM API 数据：

1. 编辑配置文件：
   ```bash
   cp glm-usage.config.sh ~/.glm-usage.config
   ```

2. 编辑 `~/.glm-usage.config`，填入您的 API 密钥：
   ```bash
   GLM_API_KEY="your_actual_api_key_here"
   GLM_API_BASE="https://api.zai.com"
   ```

**注意**：如果不配置 API 密钥，插件将显示演示数据。

## 使用方法

1. 启动 SwiftBar 应用
2. 插件会自动运行（每 10 分钟更新一次）
3. 点击菜单栏的 "GLM: XX%" 查看详细信息

### 菜单功能

- **🔄 Refresh**: 手动刷新数据
- **🗑️ Clear Cache**: 清除缓存并重新获取数据

## 配置选项

配置文件位置（按优先级排序）：

1. `~/.glm-usage.config` （用户级配置，推荐）
2. `<插件目录>/.glm-usage.config`
3. `<插件目录>/glm-usage.config.sh`

配置选项：

```bash
# API 密钥
GLM_API_KEY="your_api_key_here"

# API 基础 URL
GLM_API_BASE="https://api.zai.com"

# 用量查询端点
GLM_USAGE_ENDPOINT="/v1/usage"

# 调试模式
DEBUG=false
```

## 依赖工具

插件需要以下工具：

- `bash` - Shell 解释器（macOS 自带）
- `curl` - HTTP 客户端（macOS 自带）
- `jq` - JSON 处理工具

安装 `jq`：
```bash
brew install jq
```

## 文件说明

- `swiftbar-glm-usage.10m.sh` - 主插件脚本（10 分钟更新一次）
- `glm-usage.config.sh` - 配置文件模板
- `.glm_usage_cache` - 数据缓存文件（自动生成）

## 自定义更新频率

修改文件名中的时间来改变更新频率：

- `swiftbar-glm-usage.5s.sh` - 每 5 秒更新
- `swiftbar-glm-usage.1m.sh` - 每 1 分钟更新
- `swiftbar-glm-usage.1h.sh` - 每 1 小时更新

## 故障排除

### 1. 菜单栏显示 "GLM: 22%"

这是演示数据。要显示真实数据，需要配置 API 密钥。

### 2. 启用调试模式

在配置文件中设置：
```bash
DEBUG=true
```

调试信息会输出到 SwiftBar 日志中（SwiftBar 菜单 → Open Plugin Log）。

### 3. 数据不更新

- 点击菜单中的 "Clear Cache"
- 检查网络连接
- 验证 API 密钥是否正确

## API 数据格式

如果使用自定义 API，需要返回以下 JSON 格式：

```json
{
  "usage_percentage": 22,
  "total_calls": 1054,
  "total_tokens": 32286478,
  "window_tokens": 50000000,
  "peak_hours": [
    {"hour": "2026-02-10 02:00", "tokens": 12593760, "calls": 262}
  ]
}
```

## 许可证

MIT License

## 相关链接

- [SwiftBar GitHub](https://github.com/swiftbar/SwiftBar)
- [SwiftBar 文档](https://github.com/swiftbar/SwiftBar/wiki)
- GLM Coding Plan 文档（内部）
