# GLM Usage SwiftBar 插件 - 使用说明

## ✅ 配置完成

您的 GLM 用量监控插件已成功配置并运行！

## 📊 当前状态

- **API 配置**: ✅ 已配置真实的 GLM API 凭据
- **测试插件**: ✅ 已移除
- **数据源**: ✅ 从 GLM 平台实时获取

## 🎯 插件功能

### 菜单栏显示
- **🟢 GLM: X%** - 显示当前 Token 使用量（5小时窗口）
- 颜色自动变化：
  - 🟢 绿色: < 30%
  - 🟡 黄色: 30-60%
  - 🟠 橙色: 60-85%
  - 🔴 红色: ≥ 85%

### 下拉菜单信息
- Token 使用百分比和限制
- 总调用次数
- 总 Token 数量
- 手动刷新按钮
- 清除缓存按钮

## 📁 文件位置

### 插件文件
- **位置**: `~/Library/Application Support/SwiftBar/plugins/swiftbar-glm-usage.10m.sh`
- **更新频率**: 每 10 分钟自动刷新

### 配置文件
- **位置**: `~/.glm-usage.config`
- **内容**:
  ```bash
  GLM_API_BASE="https://api.z.ai"
  GLM_API_KEY="your-api-key"
  GLM_QUOTA_LIMIT_ENDPOINT="/api/monitor/usage/quota/limit"
  ```

### 缓存文件
- **位置**: `~/Library/Application Support/SwiftBar/plugins/.glm_usage_cache`
- **缓存时间**: 5 分钟

## 🔧 配置详情

### API 端点
插件使用以下 GLM API 端点：
- **配额限制**: `/api/monitor/usage/quota/limit`
- **模型使用量**: `/api/monitor/usage/model-usage`（备用）
- **工具使用量**: `/api/monitor/usage/tool-usage`（备用）

### 认证方式
- **方法**: Authorization Header
- **Token**: 从环境变量 `ANTHROPIC_AUTH_TOKEN` 获取

## 🛠️ 高级设置

### 启用调试模式
编辑配置文件：
```bash
nano ~/.glm-usage.config
# 将 DEBUG=false 改为 DEBUG=true
```

调试信息会输出到 SwiftBar 的插件日志中（SwiftBar 菜单 → Open Plugin Log）。

### 手动刷新
1. 点击菜单栏的 **GLM: X%**
2. 选择 **🔄 Refresh**

### 清除缓存
1. 点击菜单栏的 **GLM: X%**
2. 选择 **🗑️ Clear Cache**

## 📝 更新日志

### 2025-02-11
- ✅ 配置真实 GLM API
- ✅ 移除测试插件
- ✅ 实现实时数据采集
- ✅ 当前使用率: **5%** （绿色）

## ⚠️ 注意事项

1. **API 密钥安全**: 配置文件包含 API 密钥，请勿分享
2. **缓存机制**: 数据缓存 5 分钟，不会频繁请求 API
3. **网络要求**: 需要能访问 `api.z.ai`

## 🎉 完成

插件现在在您的 macOS 菜单栏中显示 GLM Coding Plan 的实时 Token 使用量！
