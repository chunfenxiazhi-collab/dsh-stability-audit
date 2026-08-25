# 跨生态参考：插件安全/质量审计方法论对比（REFERENCES.md）

> 调研 2026-08-26：dsh-stability-audit 与其他生态同类工具的定位对比，
> 用于校准我们的规则与探针设计（不限于 dsh 生态）。

## 1. 同类工具清单

| 工具/项目 | 生态 | 定位 | 规模 | 对我们的启示 |
|---|---|---|---|---|
| **Tarnish** (mandatoryprogrammer) | Chrome 扩展 | 静态安全分析（自动提取权限/API 调用/远程端点） | 167⭐ | 自动提取"网络端点/权限清单"做审查——我们可借鉴提取插件声明的远程 URL |
| **vsix-scan** | VS Code | 扩展扫描（依赖/权限/可疑模式） | npm | 扫描依赖树 + manifest 权限 |
| **chrome-review** | Chrome | 扩展审查 | npm | 同上 |
| **dsh-plugin-clinic** | dsh | 已装插件只读健康检查 | npm | **最接近我们**（但我们多：判级+修复建议+远程+探针） |
| **dsh-secure-audit** | dsh | 安全合规（prompt 注入/隐私） | 34⭐ | 安全维度，与我们互补 |
| **dsh-devtools** | dsh | 运行时 profiler（metadata-first） | 2⭐ | 运行时视角，与我们的 P2 探针方向类似（但未成熟） |
| **dsh-doctor** | dsh | 诊断 | 0⭐ | 未成熟 |
| **npm-scan** (lateos-ai) | npm | 恶意包两阶段扫描（velocity/drift/IOC） | 新 | 两阶段评估思路（快速粗筛→深查）与我们"静态→动态→探针"分层一致 |
| **OpenClaw ClawHub 审查清单** | OpenClaw | 10 步技能审查（341 个恶意技能事件后） | 事件驱动 | 事件驱动的生态共识：**市场增长快于信任基建**——我们的价值正是补信任基建 |
| **Safeguard.sh 第三方技能审查** | AI Agent | 安装前审查指南 | 博客 | 方法论文档 |

## 2. 关键方法论借鉴

### 2.1 Tarnish：自动提取"审查面"（我们可加规则）
Chrome 扩展审查的核心是自动列出：声明的权限 / 调用的 API / 访问的远程端点。
→ **dsh 插件对应**：inject 的服务 / 用到的 ctx API / import 的包 / 代码中的 URL。
  我们已有 inject 与 import 检查；**可加：提取代码中硬编码的远程 URL（http/https）**，
  供人工/agent 判断数据外泄风险（OpenClaw 341 恶意技能的第一大模式就是 exfil 到外部服务器）。

### 2.2 npm-scan：两阶段评估（与我们分层一致）
Stage 1 快速粗筛（burst velocity / publisher drift / IOC）→ Stage 2 深查。
→ 对应我们：静态规则（秒级粗筛）→ dyncheck 隔离验证 → 探针 P1/P2（实测深查）。

### 2.3 OpenClaw ClawHub 事件：生态共识
2026-03 ClawHub 341 个恶意技能被移除后，业界共识：
**市场增长快于信任基建，star 数/描述不可信，必须程序化审查。**
→ 我们插件的定位叙事（README 已写）："在踩坑之前"。

## 3. 差距分析（我们缺什么）

| 能力 | 我们 | 参考生态 | 优先级 |
|---|---|---|---|
| 静态判级 + 修复建议 | ✅ 13 规则 | Tarnish/vsix-scan 类似 | — |
| 隔离安装验证 | ✅ dyncheck | 少数 | — |
| 运行时探针 | 🔨 P1 实现中 | dsh-devtools（未成熟） | 高 |
| **远程端点提取**（URL 外泄检测） | ❌ | Tarnish/OpenClaw 清单强调 | 中（v0.10 候选） |
| **依赖树深度扫描**（恶意依赖传递） | ❌ 只查顶层声明 | vsix-scan/npm-scan | 中 |
| **publisher 信誉**（作者历史/漂移） | ❌ | npm-scan | 低（数据难拿） |
| 恶意模式库（exfil/websocket 回连） | ❌ | OpenClaw 清单 | 中（v0.10 候选） |

## 4. 结论

1. **我们定位独特**：dsh 生态内没有"判级+修复+远程+隔离验证"一体的工具；
   clinic/secure-audit/devtools 都只覆盖单维。
2. **探针 P1/P2 方向正确**：跨生态只有 dsh-devtools 做运行时视角且未成熟，我们抢先。
3. **v0.10 候选**（按参考生态排序）：
   - 远程端点提取（URL 硬编码扫描）——OpenClaw 341 事件第一大模式
   - 恶意模式库（process.env 外泄 / WebSocket 回连）
   - 依赖树深度扫描
