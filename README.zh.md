# dsh-stability-audit（插件稳定性审计）

扫描已安装的 DeepSeek Harness (dsh) 插件，在它们搞坏你的 harness 之前给出**稳定性风险分级 + 修复建议**——静态分析 + 可选隔离安装验证 + 机器可读输出，供任何 agent 快速发现问题和修复方法。

> 社区插件往往是年轻项目。本插件只回答一个问题：**装/留这个插件会不会伤到我的 dsh？** 它对每个已装插件给出 🔴/🟡/🟢 分级、证据和 🔧 修复建议，让你用事实决策，而不是凭感觉。

## 为什么需要

- 一个插件可以废掉**整个工具层**（钩子面——barricade 事故；dsh-tools 单实例——trailmap 事故）
- 启动扫描可以在大工作区上**冻结事件循环**几分钟（codegraph 事故）
- 坏插件配置让 dsh **静默半激活**插件（预检失败）
- @deepseek-ai/* 依赖版本冲突可以**杀掉整条工具管线**
- **每次故障期都会污染活跃会话**（悬空 tool-call），恢复后需清理

这些就是本插件要静态检测的真实故障模式——在踩坑之前。

## 安装

```sh
# 方式一：npm（推荐，免 allowBuilds 授权，一键安装）
dsh plugin --profile web add dsh-stability-audit

# 方式二：GitHub 源
dsh plugin --profile web add github:chunfenxiazhi-collab/dsh-stability-audit
```

重启 dsh web 后，agent 即可调用 `stability_audit` 工具（直接说"跑插件稳定性审计"）；也可以命令行使用：

```sh
git clone https://github.com/chunfenxiazhi-collab/dsh-stability-audit.git
cd dsh-stability-audit && npm test
node cli.mjs                    # 扫描真实 web profile
node cli.mjs --dynamic          # 附带隔离安装验证（约 2 秒/插件）
node cli.mjs --json             # 机器可读输出（其他 agent 消费）
node cli.mjs --remote owner/repo          # 远程插件静态预检（clone 到临时目录，不安装）
node cli.mjs --remote owner/repo --dynamic  # 远程插件完整预检（clone + 隔离安装冒烟）
node cli.mjs --remote owner/repo --json    # 远程预检 JSON 输出
```

## 判级维度

| 信号 | 判级 | 案例 |
|---|---|---|
| 工具钩子/中间件注册（pre/post-execute） | 🔴 | 可拦截整条工具链（barricade） |
| 启动时顶层同步扫描/索引 | 🔴 | 阻塞事件循环（codegraph） |
| 加载期同步访问服务未在 inject 声明 | 🔴 | 启动崩溃（doc-guard/barricade 事故） |
| main 指向未构建源码（TS/缺失文件） | 🔴 | 加载即崩溃（7 插件未构建事故） |
| 预检报告 critical | 🔴 | dsh 启动时已标记 |
| setInterval 轮询 | 🟡 | 更新检查常见；注意频率 |
| ≥10 处全局事件监听 | 🟡 | 每个广播事件都变慢 |
| 未声明 dsh.bundle manifest | 🟡 | 装了但不激活（research-plugins） |
| 依赖 >50 | 🟡 | 依赖树污染风险 |
| 非构建类安装脚本（prepare 等） | 🟡 | npm 生命周期执行任意代码 |
| 延迟访问服务未在 inject 声明 | 🟡 | 运行时可能 undefined（cron 式延迟访问） |
| @deepseek-ai/* 依赖区间不含宿主同步包版本 | 🟡 | pnpm 提升旧版 → 工具层全废（trailmap 事故） |
| **隔离安装 + 启动冒烟** | ✅/❌ | 临时 DSH_HOME + dsh plugin add + headless 启动无 loader 错误 |

每条命中都附 **🔧 修复建议**（可执行命令或人工动作），可直接交给用户或其他 agent 执行。

**批量测控**：`--remote` 支持多仓库（逗号分隔或空格隔开），可一次预检一批网上插件（clone → 静态 → 隔离安装冒烟，全程不影响宿主）。实测样例见 [docs/audit-report.md](./docs/audit-report.md)（18 个插件核查后判定）。

## 工作原理

1. 从 ~/.dsh/profiles/<name>/package.json 收集插件（node_modules + plugin-src）
2. 静态扫描：入口文件 + package.json 信号（正则实现，零依赖、无 AST）
3. 可选动态验证（lib/dyncheck.js）：临时 DSH_HOME → 隔离 dsh plugin add → headless 启动 → loader 错误扫描 → 清理
4. 可选远程预检（lib/remote.js）：git 浅克隆到临时目录 → 静态规则 →（可选）隔离安装冒烟 → 清理
5. 渲染报告：Markdown（人读）或 JSON（`--json`，schema `dsh-stability-audit/v1`，agent 读）

**原则**：只读、绝不运行被审插件、零副作用。分级是"供人工确认的建议"，不是判决。

## JSON 输出（供 agent 消费）

```sh
node cli.mjs --json
```

每插件输出：name / version / grade / source / dynamic / findings[]，每条 finding 含 `ruleId` / `severity` / `desc` / `evidence` / `fix`（修复建议）。其他 agent 可直接据此自动修复或提示用户。

## 已知局限（诚实清单）

- 静态分析测不了运行时行为（钩子抛错、真实卡顿时长）——🔴 表示"需要查"，不是"必然坏"
- 隔离启动用 headless profile：依赖 web 专属服务（如 storageDomain）的插件在隔离环境显示 ❌ 但 web 里可能正常——当作"环境依赖提示"
- 运行时探针（事件循环延迟、钩子耗时）在 v2 路线图
- 修复建议是**提示而非自动执行**：环境差异大（junction/overrides 等修复依赖具体机制），agent 应先确认再执行

### 隔离测控 vs 真实环境（能测到什么、测不到什么）

隔离测控（临时 DSH_HOME + headless 冒烟）回答的是：**"这个插件能不能独立装上去、能不能正常启动"**——过滤掉约 80% 的坑（未构建、inject 缺失、依赖冲突、加载崩溃）。

| 维度 | 隔离环境 | 真实 web profile | 影响 |
|---|---|---|---|
| 服务 | headless 启动 | web 服务 + 全部宿主服务 | 依赖 webServer/webRuntime 的插件在隔离里 pending，判不出真实行为 |
| 插件共存 | 只装被测 1 个 | 多个插件互相作用 | 插件间冲突测不出（钩子互踩、服务覆盖） |
| 配置 | 空配置 | 真实 config（API key、模型、路径） | 依赖配置的插件路径测不到 |
| 凭据/网络 | 无 API key | 有模型 API | 需真实调 LLM 的功能只冒烟不实跑 |
| 数据 | 空存储 | 真实会话/库 | 数据迁移类插件测不到 |
| 运行时长 | 启动冒烟（秒级） | 常驻运行（小时/天） | setInterval 泄漏、内存增长测不到 |
| 权限/构建 | 同机器同权限 | 同机器同权限 | ✅ 一致 |

**建议用法**：隔离测控做批量筛查，🔴/❌ 直接排除；筛选后想用的插件再走"手动装 + 观察"的谨慎流程。不建议自动在真实环境试插件——插件有真实破坏力（见 dsh-troubleshooting 系列事故）。

## 发布与版本

- 发布流程见 [RELEASE.md](./RELEASE.md)（GitHub + npm + Release 三渠道同步）
- npm: https://www.npmjs.com/package/dsh-stability-audit
- GitHub Release（含 tarball 资产）: https://github.com/chunfenxiazhi-collab/dsh-stability-audit/releases

## 许可

MIT (c) 2026 chunfenxiazhi

## 贡献

欢迎 issue 和 PR。测试：npm test（node:test，零依赖）。

**提交约定**：commit message 用英文标题 + 中文正文（如 `feat: remote plugin pre-audit`），兼顾国际可读性。