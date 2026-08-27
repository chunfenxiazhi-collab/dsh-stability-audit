# dsh-archify 评估记录（2026-08-28）

> 任务：试用新的架构图绘制插件 dsh-archify（GongYuanCaiJi/dsh-archify），为本项目绘制运行时架构图，
> 并评估它对本项目/后续文档工作是否值得作为参考工具。

## 产物

- `runtime.architecture.json` —— 架构规格（14 组件 / 17 连接 / 2 边界 / 3 引导视图）
- `docs/dsh-stability-audit-architecture.html` —— 渲染产物（单文件 663KB，交互式）

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `archify validate`（standard） | ✅ 0 errors / 19 warnings |
| `archify check`（artifact） | ✅ pass（composition standard: 0 errors） |
| `archify render`（showcase） | ❌ 因 strict composition 规则拒绝（proper-crossing/ambiguous-corridor） |
| 浏览器渲染 | ✅ 标题/副标题/3 个引导视图/边界/17 条连线均正常 |

## 图内容（真实调用图，先证据后验证）

图里的每条边都对照了源码 import/动态 import 验证过，过程中**纠正了两个错误认知**：

1. `remote → probe` 不成立：probe.js（P1 故障分类）目前**只被测试直接使用**，
   未接入 dyncheck.js 运行时路径（dyncheck 内联正则分类）。图上如实标注「仅测试 · 未接入」。
2. `remote → osv` 不成立：OSV 查询实际由 cli.mjs 的 `--online` 触发（cli → osv）。
3. `cli → report-store` 不成立：persistReport 只在 index.js（工具处理器）里调用。

## 工具能力与坑（给后续使用者的经验）

1. **grid 不是自动布局**：layout.mode=grid 只做固定单元格定位（row/col），连线全部靠正交自动路由。
2. **clean-flow 校验非常严格**：首/末段必须垂直进出端口（fromSide/toSide 语义）；线段不能穿过无关组件
   （edge-through-node）。密集 hub 图必须规划"走廊"：留空行列作为布线通道。
3. **自动端口分散（port spread）**：同一侧多条连接会自动错开端口（gutter 16 / spacing ≤14）。
   ⚠️ 但连接带 `via` / `labelAt` / `channelX/Y` 时会被**排除**出 spread，端口回落到中心锚点——
   这是本图踩坑最多的地方（via 终点必须精确落在端口正上方/正下方，否则产生斜线段报错）。
4. **standard vs showcase**：showcase 要求不同连接零共用走廊（proper-crossing 连共线重叠都算）、
   标签与其它连线保持 ≥4px。hub 型图（cli→5 目标、index→4 目标）在紧凑网格里几乎不可能达标；
   standard 是实用线。本图 19 个 warning 全是走廊共用/标签贴近，不影响可读性。
5. **标签定位**：labelAt/labelDx/labelDy/labelSegment 可精调；密集扇区建议显式 labelAt。
6. **引导视图（views）** 直接可用：3 个 chapter 带 focus 高亮，交互体验好，适合做文档配图。

## 结论（对本项目是否值得参考）

**值得**。理由：

- 零依赖、单文件 HTML、校验先行（validate→check→deliver 的流水线理念与本项目
  "数据门槛先行/先验证后动手" 完全同构）；
- 严格 clean-flow 校验能倒逼架构图反映真实调用关系（本图就纠正了 2 处认知错误）；
- 交互式引导视图适合放进 README/升级记录做可视化；
- 但它只适合"人工维护的规格 → 渲染"模式（不是 Mermaid 式自动布局），
  对 hub 密集图需要预留走廊，showcase 标准不宜强求。

## 备查

- archify 克隆：`C:\Users\29704\.dsh\plugin-src\dsh-archify`（Node ^22.19、dsh 0.1.0-rc.6）
- 渲染命令：
  `node archify/bin/archify.mjs validate architecture runtime.architecture.json --quality standard`
  `node archify/bin/archify.mjs render architecture runtime.architecture.json docs/dsh-stability-audit-architecture.html --quality standard`
