# dsh-stability-audit（插件稳定性审计）

扫描已安装的 DeepSeek Harness (dsh) 插件，在它们搞坏你的 harness 之前给出**稳定性风险分级**——对已装代码做静态分析，外加可选的**隔离安装验证**（临时 DSH_HOME，与你的真实 profile 零接触）。

> 社区插件往往是年轻项目。本插件只回答一个问题：**装/留这个插件会不会伤到我的 dsh？** 它对每个已装插件给出 🔴/🟡/🟢 分级和证据，让你用事实决策，而不是凭感觉。

## 为什么需要

- 一个插件可以废掉**整个工具层**（钩子面——barricade 事故）
- 启动扫描可以在大工作区上**冻结事件循环**几分钟（codegraph 事故）
- 坏插件配置让 dsh **静默半激活**插件（预检失败）
- @deepseek-ai/* 依赖版本冲突可以**杀掉整条工具管线**

这些就是本插件要静态检测的真实故障模式——在踩坑之前。

## 安装

```sh
dsh plugin --profile web add github:chunfenxiazhi-collab/dsh-stability-audit
```

重启 dsh web 后，agent 即可调用 `stability_audit` 工具（直接说"跑插件稳定性审计"）；也可以命令行使用：

```sh
git clone https://github.com/chunfenxiazhi-collab/dsh-stability-audit.git
cd dsh-stability-audit && npm test
node cli.mjs            # 扫描真实 web profile
node cli.mjs --dynamic  # 附带隔离安装验证（约 2 秒/插件）
```

## 判级维度

| 信号 | 判级 | 案例 |
|---|---|---|
| 工具钩子/中间件注册（pre/post-execute） | 🔴 | 可拦截整条工具链（barricade） |
| 启动时顶层同步扫描/索引 | 🔴 | 阻塞事件循环（codegraph） |
| setInterval 轮询 | 🟡 | 更新检查常见；注意频率 |
| ≥10 处全局事件监听 | 🟡 | 每个广播事件都变慢 |
| 未声明 dsh.bundle manifest | 🟡 | 装了但不激活（research-plugins） |
| 依赖 >50 | 🟡 | 依赖树污染风险 |
| 非构建类安装脚本（prepare 等） | 🟡 | npm 生命周期执行任意代码 |
| 预检报告 critical | 🔴 | dsh 启动时已标记 |
| 加载期同步访问服务未在 inject 声明 | 🔴 | 启动崩溃（doc-guard/barricade 事故） |
| 延迟访问服务未在 inject 声明 | 🟡 | 运行时可能 undefined（cron 式延迟访问） |
| main 指向未构建源码（TS/缺失文件） | 🔴 | 加载即崩溃（7 插件未构建事故） |
| @deepseek-ai/* 依赖区间不含宿主同步包版本 | 🟡 | pnpm 提升旧版 → 工具层全废（trailmap 事故） |
| **隔离安装 + 启动冒烟** | ✅/❌ | 临时 DSH_HOME + dsh plugin add + headless 启动无 loader 错误 |

## 工作原理

1. 从 ~/.dsh/profiles/<name>/package.json 收集插件（node_modules + plugin-src）
2. 静态扫描：入口文件 + package.json 信号（正则实现，零依赖、无 AST）
3. 可选动态验证（lib/dyncheck.js）：临时 DSH_HOME → 隔离 dsh plugin add → headless 启动 → loader 错误扫描 → 清理
4. 渲染 Markdown 报告：每插件命中规则、证据文件、建议动作

**原则**：只读、绝不运行被审插件、零副作用。分级是"供人工确认的建议"，不是判决。

## 已知局限（诚实清单）

- 静态分析测不了运行时行为（钩子抛错、真实卡顿时长）——🔴 表示"需要查"，不是"必然坏"
- 隔离启动用 headless profile：依赖 web 专属服务（如 storageDomain）的插件在隔离环境显示 ❌ 但 web 里可能正常——当作"环境依赖提示"
- 运行时探针（事件循环延迟、钩子耗时）在 v2 路线图

## 许可

MIT (c) 2026 chunfenxiazhi

## 贡献

欢迎 issue 和 PR。测试：npm test（node:test，零依赖）。