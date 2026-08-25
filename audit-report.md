# 网上 dsh 插件批量隔离测控报告（2026-08-25 核查后终版）

> 方法：git URL 隔离安装（完整依赖解析）→ 静态 11 规则 → 临时 DSH_HOME + headless 冒烟 → 清理。
> 全程不影响宿主 profile 与运行中的 dsh。18 个插件 = 本地已装插件的网上 GitHub 源。

## 总览：🔴8 🟡3 🟢7

## 核查结论（先证据后修复）

**修正了 2 类误判：**

1. **dyncheck 方法局限**：`dsh plugin add <本地目录>` 不装依赖 → 5 个插件误报 ❌。
   修复：远程审计改用 git URL 安装（触发完整依赖解析）→ memento、python-env 转 ✅。
2. **unbuilt-entry 规则缺陷**：`tsc --noEmit`（类型检查无输出）被误认为构建脚本 →
   secret-guard（main 指向 src/index.ts）漏判。修复：构建判定排除 --noEmit → 现正确判红。

## 最终判定

| 插件 | 静态 | 动态 | 结论 |
|---|---|---|---|
| dsh-notify | 🟢 | ✅ | ✅ 可装 |
| dsh-plugin-guide | 🟢 | ✅ | ✅ 可装 |
| dsh-speak | 🟢 | ✅ | ✅ 可装 |
| dsh-startup-guard | 🟢 | ✅ | ✅ 可装 |
| dsh-memento | 🟢 | ✅ | ✅ 可装（修复方法后） |
| dsh-python-env | 🟢 | ✅ | ✅ 可装（修复方法后） |
| dsh-plugin-dev-kb | 🔴 startup-work | ✅ | ⚠️ 能装但启动重任务 |
| dsh-research-plugins | 🟡 no-bundle | ✅ | ⚠️ 能装不激活 |
| dsh-update-checker | 🟡 polling | ✅ | ⚠️ 能装，轮询注意 |
| chicheng-cron | 🟡 missing-inject | ✅ | ⚠️ 能装，skills 隐患 |
| dsh-secret-guard | 🔴 TS 入口无构建 | ❌ | ❌ 网上源装即崩（真实：Stripping types unsupported） |
| dsh-taskboard | 🟢(规则缺口) | ❌ | ❌ 包名自引用失败（真实：Cannot find package @ttmouse/...） |
| dsh-verify | 🟢(规则缺口) | ❌ | ❌ 入口路径解析失败 |
| dsh-devtools | 🔴 unbuilt | ❌ | ❌ 未构建 |
| dsh-flakefinder | 🔴 unbuilt | ❌ | ❌ 未构建 |
| dsh-library | 🔴 unbuilt | ❌ | ❌ 未构建 |
| dsh-score | 🔴 unbuilt | ❌ | ❌ 未构建 |
| dsh-test-drive | 🔴 unbuilt | ❌ | ❌ 未构建 |

## 规则改进（本次沉淀）

1. dyncheck 远程安装改用 git URL（本地目录 add 不装依赖）
2. unbuilt-entry：`tsc --noEmit` 不算构建脚本
3. 已知规则缺口（v0.9 候选）：包名自引用失败（taskboard）、入口路径解析失败（verify）

## 建议

- 装插件优先 npm 包（发布版已构建），github: 源仅开发/预览
- 新插件先跑 `node cli.mjs --remote owner/repo --dynamic`（90 秒 18 个）
