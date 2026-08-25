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
