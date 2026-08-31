# 新发布插件实测报告（2026-08-31）

> 目的：用 8/26–8/30 新发布的真实 dsh 插件实测稳定性检测能力（静态 15 规则 + 隔离动态验证 + OSV）。
> 方法：GitHub topic:dsh-plugin + created:>2026-08-25 检索 → 13 个代表性插件 →
> `node cli.mjs --remote <specs> --dynamic --online --json` → 逐项人工核验（clone 看 package.json/源码）。
> 原始输出：`docs/battletest-20260831.json`。

## 结果总览（7 红 / 4 黄 / 2 绿）

| 插件 | 静态 | 动态 | 判定 | 核验结论 |
|---|---|---|---|---|
| addozhang/dsh-discord | 🔴 unbuilt-entry | FAIL(boot1) | ✅ 真红 | main→lib/index.js 不存在 + boot 真实失败；规则与动态互相印证（最佳案例） |
| vibe-any/dsh-plugin-save-token | 🔴 hook-surface/missing-inject/missing-dep | PASS | ✅ 真红 | src 实际 import `@deepseek-ai/dsh-tools`，package.json 未声明（taskboard 同款缺陷在新插件复现） |
| HuaJi2077/empty-fort-strategy | 🔴 no-entry | PASS | ❌ **误报** | 有 `exports["."] → preset/index.mjs` + dsh.bundle；规则不识别 exports 入口 |
| keman-ai/dsh-skin-pack | 🔴 no-entry | PASS | ❌ **误报** | monorepo workspace 根（private+packages/），插件本体在子包 |
| tiphareth0/dsh-sshworkspaces | 🔴 no-entry | PASS | ❌ **误报** | 同上（workspace 根） |
| extracurricular-ai/dsh-filesnap | 🔴 unbuilt-entry 🟡 no-bundle | PASS | ⚠️ **部分误报** | git 源无 lib/，但 **npm 包（0.2.1）含 lib/index.js**（已构建）；git 源预检误判；另为 client 插件（dsh.client 声明）无 bundle.patch |
| Fakek0f3sT/dsh-mcp-diff | 🔴 unbuilt-entry | FAIL(install-blocked) | ✅ 正确 | git 源 allowBuilds 阻塞（已知模式，install-blocked 区分得当） |
| chen731215-dev/dsh-tavern-v2 | 🟡 missing-inject/remote-endpoints | PASS | ✅ 合理 | client 插件注入列表不完整 + 远程端点 |
| yu-wenchao/dsh-free-models-hub | 🟡 remote-endpoints | PASS | ✅ 合理 | web 插件调远程 API |
| xiaosurongjia/dsh-improved-inline-edit | 🟡 remote-endpoints | PASS | ✅ 合理 | 同上 |
| xianrui69/dsh-quick-phrases | 🟡 remote-endpoints | PASS | ✅ 合理 | 同上 |
| lw-storm/dsh-plugin-masterprompt | 🟢 | PASS | ✅ 正常 | 结构健全 |
| meyaomiao/dsh-github-workbench | 🟢 | PASS | ✅ 正常 | 结构健全 |

## 发现的规则空白（4 条，建议进 roadmap）

1. **no-entry 不识别 `exports["."]` 入口**（empty-fort 证据：preset/index.mjs 存在 + bundle patch 声明）
2. **workspace 根误判**：private:true + packages/ 子目录的 monorepo 根不应判 no-entry/no-bundle（skin-pack/sshworkspaces 证据）
3. **unbuilt-entry 与 git/npm 源脱节**：git clone 无构建产物 ≠ 插件未构建（filesnap 证据：npm 包含 lib/）；--remote 应优先用 npm tarball 审计，或对已发布 npm 的插件提示"git 源未含构建产物"
4. **no-bundle 对 client 插件（dsh.client 声明）语义待定**：client 插件激活路径可能不依赖 bundle.patch（filesnap 证据）

## 正样本确认（规则有效）

- **missing-dep 在新插件上复现**：save-token 运行时 import `@deepseek-ai/dsh-tools` 未声明 → 红，与 taskboard/memento 事故同型 —— 这是本插件最核心的防护价值。
- **unbuilt-entry + 动态 boot 失败**互相印证（discord），规则与动态验证协同工作正常。
- 两个结构健全的新插件（masterprompt/github-workbench）全绿，无误报。

## 修复验证（同日完成，commit 见 git log）

四条规则空白已按 docs/规则修复方案-20260831.md 修复（TDD：6 新用例先红后绿）：

| 修复 | 实现 | 复测结果 |
|---|---|---|
| FIX-1 no-entry 识别 exports 入口 | `resolveEntry(pkg)`（main/exports["."]/exports["./client"]） | empty-fort-strategy red → **green** |
| FIX-2 workspace 根豁免 | `isWorkspaceRoot(pkg, dir)`（private + workspaces/packages/） | skin-pack red → **green**；sshworkspaces red → **green** |
| FIX-3 unbuilt-entry 对照 npm 产物 | `defaultNpmArtifactCheck`（registry + tarball 检查，可注入） | filesnap unbuilt-entry red → **yellow**（注明 npm 0.2.1 已构建） |
| FIX-4 client 插件 no-bundle 豁免 | dsh.client + exports["./client"] 产物存在 → 豁免 | 单测覆盖（client-only fixture） |

- 回归：84 tests / 83 pass / 1 skip / 0 fail（原 78 + 新 6）。
- 踩坑记录：FIX-3 真实链路首跑未生效——`writeFileSync` 未 import（ReferenceError 被静默 catch 吞掉，历史 readFileSync 同款坑重演）；已修复并复测通过。

## 原始证据

- `docs/battletest-20260831.json`（--json 输出，13 插件全量）
- `docs/retest-20260831.json`、`docs/retest-filesnap.json`（修复后复测输出）
- clone 取证目录：`%TEMP%\dsh-verify-*`（package.json/源码核验）
