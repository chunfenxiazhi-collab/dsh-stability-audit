
## 兼容性评估：我们依赖的外部面

### 1. dsh API（最高风险面）

| 依赖 | 用在哪 | 稳定性 | 风险 |
|---|---|---|---|
| ctx.tools.register | index.js 注册工具 | dsh 核心 API，0.1.0 起存在 | 低——官方插件都这么写 |
| inject: ["tools"] | index.js | 核心机制 | 低 |
| cordis.patch.yml 加载 | 插件激活 | 核心机制 | 低 |
| dsh.bundle manifest | package.json | 官方 PR 模板要求 | 低 |

### 2. 文件系统路径（中风险面）

| 路径 | 用在哪 | 风险 |
|---|---|---|
| ~/.dsh/profiles/<name>/package.json | collectPlugins | 低——dsh 标准布局 |
| ~/.dsh/plugin-src/ | collectPlugins 兜底 | 中——**我们本地环境的 junction 布局，官方可能不同**（官方是 node_modules 为主） |
| ~/.dsh/dsh-preflight-report.json | 预检解析 | 中——文件存在性做了容错（catch 忽略） |
| ~/.dsh/stability-report.json | 报告落盘（v0.10） | 低——自建路径 |

### 3. 环境（低风险面）

| 依赖 | 用在哪 | 风险 |
|---|---|---|
| DSH_HOME 环境变量 | dyncheck 隔离 | 低——dsh 标准 |
| dsh bin 路径探测 | dyncheck 定位宿主 | 低——多候选探测（APPDATA/DSH_CLI/源码） |

### 4. 我们避免的兼容坑（v0.7 起的设计）

- ❌ 不 import @deepseek-ai/*（零依赖）→ **不依赖 dsh-tools 的版本**（最大的兼容性胜利——别人升级 dsh 不会破坏我们）
- ❌ 不用 dsh-tools 的 defineTool → 工具注册纯对象，**schema 是我们自己写的标准 JSON Schema**

### 5. 版本兼容矩阵（评估）

| 用户 dsh 版本 | 工具注册 | collectPlugins | dyncheck | 结论 |
|---|---|---|---|---|
| 0.1.x（当前主流） | ✅ | ✅ | ✅ | 完全兼容 |
| 0.2.x（未来） | ✅（API 稳定） | ⚠️ 路径可能变 | ⚠️ bin 路径探测多候选 | 大概率兼容 |
| <0.1.0（旧版） | ⚠️ | ⚠️ | ❌ | 不兼容（太旧） |

### 结论

**兼容性风险集中在 2 处**，但都有缓解：
1. **plugin-src 布局**：collectPlugins 先查 node_modules（官方标准），plugin-src 只是兜底——官方用户走 node_modules 路径没问题
2. **路径/文件容错**：preflight 读取有 catch、bin 探测多候选——缺失时优雅降级
