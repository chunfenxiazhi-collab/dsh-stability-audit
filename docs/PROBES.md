# v2 运行时探针设计（PROBES.md）

> 状态：设计稿（v0.9 之后）。目标：把"静态判红"升级为"实测佐证"——
> 用运行时测量验证 startup-work / hook-surface / polling 等静态信号的真实影响。

## 1. 目标与原则

| 项 | 内容 |
|---|---|
| 目标 | 测量插件对 dsh **启动耗时 / 事件循环 / 任务吞吐** 的真实影响 |
| 原则 1 | **零侵入**：不改被测插件、不装探针进宿主 profile（沿用隔离 DSH_HOME） |
| 原则 2 | **对比基线**：所有测量都是"空 profile 基线 vs 被测插件"的差分，抵消环境噪声 |
| 原则 3 | **可复现**：每次测量跑 N 次取中位数（基线抖动已实测 <30ms） |

## 2. 三个探针（P1/P2/P3）

### P1 启动耗时探针（启动阶段同步阻塞 → startup-work 实测化）

**原理**：dsh headless 冷启动 = 插件树加载 + 各插件 apply() + 服务就绪。插件在 apply 顶层做同步扫描/索引（codegraph 案例）会线性拉长启动。测量 spawn → 进程退出 的墙钟时间。

- 基线：空 headless profile（~1.3s，已实测稳定）
- 被测：隔离安装目标插件后同测
- 差分 > 阈值（如 +500ms）→ 佐证 startup-work 红
- 每轮跑 3 次取中位数，去掉首轮（冷缓存）

### P2 事件循环漂移探针（钩子/中间件耗时 → hook-surface 实测化）

**原理**：Node 单线程。插件注册的 pre/post-execute 钩子若在每次工具调用时做重活（barricade 案例），会推高事件循环延迟。测量方法：在 headless 进程内用一个 **1KB 微型探针插件**（审计仓库自带，无外部依赖）：

```js
// probe-plugin：setInterval(10ms) 记录实际间隔与期望的偏差，运行 3s 后写 JSON
let maxLag = 0, total = 0, n = 0
setInterval(() => {
  const expected = (++n) * 10
  const actual = Date.now() - start
  maxLag = Math.max(maxLag, actual - expected)
}, 10)
setTimeout(() => { require('fs').writeFileSync(out, JSON.stringify({ maxLag, n })) }, 3000)
```

- 基线：只装探针插件 → maxLag_B
- 被测：探针 + 目标插件 → maxLag_T
- 差分 = maxLag_T - maxLag_B；>50ms 说明有钩子/定时任务在抢占事件循环
- 探针插件本身走 dsh 插件机制（cordis.patch.yml + bundle），零 @deepseek-ai 依赖（同 v0.7 教训）

### P3 任务吞吐探针（整体开销 → 综合信号）

**原理**：headless 无 API key 时任务不真正执行，但**插件树启动本身**就是固定工作负载。P3 = P1 的扩展：启动后额外等待 1s 让 setInterval 类插件跑几轮，对比"启动+首轮轮询"总耗时。用于佐证 startup-polling（update-checker 等）的实测影响。

## 3. 输出与判定

```json
{
  "schema": "dsh-stability-audit/probe/v1",
  "target": "owner/repo",
  "baseline": { "startMs": 1345, "maxLagMs": 8, "runs": 3 },
  "measured": { "startMs": 3100, "maxLagMs": 210, "runs": 3 },
  "delta": { "startMs": 1755, "maxLagMs": 202 },
  "verdict": { "startupSlow": true, "eventLoopLag": true, "grade": "red" }
}
```

阈值（初版，实测后校准）：
- 启动差分 > 500ms → startupSlow
- 事件循环差分 > 50ms → eventLoopLag
- 任一为 true → probe 判红（在报告动态列显示 "⏱ 运行时探针: 启动+1755ms / 事件循环+202ms"）

## 4. 运行方式

```sh
# 本地已装插件：测某个插件（按名字定位）
node cli.mjs --probe dsh-update-checker

# 远程插件：clone + 隔离安装 + 探针（不装进宿主）
node cli.mjs --remote owner/repo --probe

# 全部已装插件逐个探针（慢，约 10s/插件）
node cli.mjs web --probe --dynamic
```

流程：临时 DSH_HOME → 装基线/被测 → 跑 P1/P2/P3 → 汇总差分 → 清理。全程不影响宿主 profile。

## 5. 与现有能力的关系

| 现有 | 探针后 |
|---|---|
| dyncheck 动态验证（装得上吗） | P1 加启动耗时（装得快吗） |
| startup-work 静态红 | P1 实测佐证（真卡还是虚惊） |
| hook-surface 静态红 | P2 实测钩子开销 |
| startup-polling 静态黄 | P3 实测轮询影响 |

## 6. 实现计划

1. lib/probe.js：P1（spawn 计时）+ P2（探针插件 + 漂移解析）+ P3（扩展计时）
2. 探针插件静态资源：probe/ 目录（1KB，零依赖）
3. cli.mjs：--probe 参数（本地/远程/批量）
4. 测试：注入式 fake（不真跑 dsh），阈值判定单元测试
5. 报告：动态列加 "⏱ 运行时探针" 行；--json 加 probe 字段

## 7. 已知局限（诚实清单）

- headless 环境无 web 服务/真实流量，测的是"加载与空闲"开销，不是生产负载
- 事件循环漂移探针本身占用事件循环（10ms 间隔极轻，可接受）
- 阈值需真实数据校准（初版可能误报，先跑一批校准）
- 只测启动期与空闲期，测不了长时间运行泄漏（仍属 v2 范围外）
## 8. 故障插件场景（启动报错时探针如何工作）

**核心认知**：dsh 加载器对坏插件是致命崩溃（plugin tree failed），不是跳过。
被测插件拖垮插件树时，**同树的探针插件也加载不了** → P2/P3 天然不可用。
因此探针必须分层：

### 分层结构

\`\`\`
第一层 P1（故障检测）：启动耗时 + 错误解析 + 超时判定
   ↓ 仅当正常启动通过
第二层 P2/P3（性能检测）：事件循环漂移 + 任务吞吐
\`\`\`

### 第一层：P1 三结局 → 规则映射

| 探针结局 | 信号 | 判定 |
|---|---|---|
| 崩溃退出 + stderr 含 Cannot find package | 错误文本 | 🔴 missing-dep 实测确认 |
| 崩溃 + Stripping types | 错误文本 | 🔴 unbuilt-entry 实测确认 |
| 崩溃 + plugin tree failed | 错误文本 | 🔴 插件树级故障（最高危） |
| 超时（探针自设 30s 不退出） | 无错误但卡住 | 🔴 startup-work 铁证（静态红变实测卡死） |
| 正常退出但启动差分 >500ms | 耗时差分 | 🟡 startup-work 佐证 |
| 正常退出且差分正常 | 耗时 | 进入第二层 |

**原则**：探针错误解析 = 静态规则的实测闭环——错误文本直接映射规则 ID，
比静态扫描更可信（这是真实加载行为，不是代码猜测）。

### 实现要点

- probe.js 捕获三种结局：崩溃（exit!=0 + stderr）/ 超时（timeout）/ 正常（计时）
- stderr 错误文本 → 规则映射表（Cannot find package→missing-dep 等）
- 超时判定给 startup-work 提供"实测卡死"证据（静态只能猜"疑似阻塞"）
- 报告动态列区分：⏱ 探针-故障（崩溃/超时） vs ⏱ 探针-性能（差分数字）
