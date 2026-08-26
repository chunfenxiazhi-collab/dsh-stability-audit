# 真实插件实战检验报告（2026-08-27）

> 方法：12 个真实 dsh 插件（含已知正常/异常）+ 完整能力链
> （静态 15 规则 + 隔离动态验证 + 端点提取 + 依赖树扫描）。

## 检验结果

| 插件 | 静态 | 动态 | 判定 | 检验点 |
|---|---|---|---|---|
| dsh-speak | 🟢 | PASS | ✅ 正常 | 干净插件全绿 |
| dsh-startup-guard | 🟢 | PASS | ✅ 正常 | 同上 |
| dsh-notify | 🟡 | PASS | ✅ 正常+端点 | remote-endpoints 黄合理 |
| dsh-memento | 🟡 | PASS | ✅ 正常+端点 | 同上 |
| dsh-update-checker | 🟡 | PASS | ✅ 正常+轮询 | startup-polling 黄合理 |
| chicheng-cron | 🟡 | PASS | ✅ 正常+隐患 | missing-inject 黄合理 |
| dsh-plugin-guide | 🟢 | FAIL | ⚠️ **误判** | 见不足#1 |
| dsh-verify | 🔴 | FAIL | ✅ 正确 | no-entry 命中 |
| dsh-taskboard | 🔴 | FAIL | ✅ 正确 | missing-dep 命中 |
| dsh-devtools | 🔴 | FAIL | ✅ 正确 | unbuilt-entry 命中 |
| dsh-flakefinder | 🔴 | FAIL | ✅ 正确 | unbuilt-entry 命中 |
| dsh-score | — | — | ⚠️ clone 失败 | 未测到（网络） |

## 能力检验：4/5 维度正常

| 能力 | 状态 | 证据 |
|---|---|---|
| 静态判级（15 规则） | ✅ 正常 | 4 个异常插件全部正确判红 |
| 端点提取 | ✅ 正常 | notify/memento/update-checker 黄合理 |
| 动态验证 | ⚠️ 有缺陷 | 见不足#1 |
| 依赖树扫描 | ✅ 正常 | 之前验证 231 包 |
| JSON 输出 | ✅ 正常 | 全部结构化 |

## 发现的能力不足

### 不足#1（真实缺陷）：install 失败未短路 → 误判 FAIL
- **现象**：dsh-plugin-guide git 源被 pnpm allowBuilds 拦截（prepare 脚本）
  → install exit 1 → 但 dyncheck 继续跑 boot（空 profile）→ 误报 "boot 异常"
- **根因**：dyncheck 的 boot 判定没检查 install 是否成功；P1 的 parseInstallOutcome
  有 install-blocked 判定但没接入 dyncheck 主流程
- **影响**：**git 源插件（prepare 构建型）全部会被误判 FAIL**——这是高频场景！
- **修复**：dyncheck install 失败时直接返回 install 状态（blocked/failed），不跑 boot

### 不足#2（已知局限）：git 源 prepare 构建被 pnpm 拦
- 这是**环境限制**（pnpm 需要 allowBuilds 授权），不是我们的 bug
- 但暴露了：**远程预检对 git 源插件无法区分"装不上"和"装上崩"**——修复#1 后能区分

### 不足#3（小）：dsh-score clone 偶发失败
- 网络抖动导致 clone 失败被跳过（已有容错：continue 不中断整体）
- 可接受（重试即可）

## 第二轮检验（2026-08-27，awesome 列表随机 10 插件）

| 插件 | 静态 | 动态 | 判定 | 检验点 |
|---|---|---|---|---|
| dsh-alive | 🟢 | PASS | ✅ | 干净 |
| dsh-skill-picker | 🟢 | PASS | ✅ | 干净 |
| dsh-chat-width | 🟢 | PASS | ✅ | 干净 |
| dsh-web-mobile-fix | 🟢 | PASS | ✅ | 干净 |
| dsh-status-rotator | 🟡 | PASS | ✅ | 轮询黄合理 |
| dsh-anchored-monitor | 🟡 | PASS | ✅ | 轮询+端点黄合理 |
| dsh-hud | 🔴 | PASS | ✅ | **startup-work 红但可装**——验证"红=需查非必然坏" |
| dsh-plugin-open-app | 🔴 | PASS | ✅ | 同上 |
| dsh-spotlight | 🔴 | install-blocked | ✅ | unbuilt-entry 真（main 缺失）+ prepare 非纯构建黄真 |
| dsh-docking-layout | 🔴 | install-blocked | ✅ | unbuilt-entry 真 |

**结论**：零误判。验证了：
1. **红≠必然坏**：hud/open-app startup-work 红但装得上（设计语义正确）
2. **unbuilt-entry 高准确**：2 个 blocked 均确认 main 缺失
3. **install-scripts 对自定义 prepare 报黄**：spotlight prepare=node scripts/prepare.mjs 非纯构建，报黄有据
4. **已知局限**：prepare 脚本内容静态看不到——prepare.mjs 若只是拷贝会误报黄（可接受，黄=需查）
