// v2 运行时探针：P1 启动耗时 + 故障错误解析（分层设计第一层）。
// 原理：headless 冷启动 = 插件树加载 + apply() + 服务就绪。同步阻塞（codegraph 式扫描）
// 线性拉长启动；崩溃/卡死直接反映在退出码与 stderr。测量 = 基线 vs 被测的差分。
// 复用 dyncheck 的隔离 DSH_HOME 框架，不碰宿主 profile。

// 错误文本 → 规则映射（实测闭环：静态规则的真实验证）
const RULE_HINTS = [
  // 插件树级故障最高危，必须先判（否则伴随的 Cannot find package 会抢先）
  { re: /plugin tree failed to load/, rule: "tree-failure" },
  // 自身入口缺失（Cannot find package '<路径>\<插件名>\index.js'）→ 入口问题
  { re: /Cannot find package '[^']*(?:\\|\/)index\.[cm]?js'/, rule: "no-entry" },
  { re: /Stripping types|unsupported for files under node_modules/, rule: "unbuilt-entry" },
  { re: /Cannot find package/, rule: "missing-dep" },
  { re: /ERR_MODULE_NOT_FOUND/, rule: "entry-missing" },
]

// 解析一次启动的结果 → outcome + 规则提示
// 注意：headless 无 API key 时正常插件也 exit 1（任务不完成）——不能只看 exit code，
// 必须看 stderr 错误特征（与 dyncheck 语义一致）。
export function parseBootOutcome({ exitCode, stderr = "", timedOut = false, startMs }) {
  if (timedOut) return { outcome: "timed-out", startMs, ruleHint: "startup-work" }
  // pending (waiting for service) = 隔离环境缺宿主服务，非插件缺陷（沿用 dyncheck 语义）
  const pendingEnv = /pending \(waiting for services?: [A-Za-z, ]+\)/.test(stderr)
  if (pendingEnv && /plugin tree failed/i.test(stderr)) {
    return { outcome: "booted", startMs, ruleHint: null, note: "env-pending" }
  }
  // 崩溃特征优先于 exit code（正常插件无 API key 也 exit 1）
  for (const { re, rule } of RULE_HINTS) {
    if (re.test(stderr)) return { outcome: "crashed", startMs, ruleHint: rule }
  }
  // 无 API key 正常退出（MISSING_CREDENTIAL 提示 = 插件树加载成功，仅任务无凭据）→ booted
  if (/MISSING_CREDENTIAL|no API key|DEEPSEEK_API_KEY/i.test(stderr)) {
    return { outcome: "booted", startMs, ruleHint: null, note: "no-api-key" }
  }
  if (exitCode === 0) return { outcome: "booted", startMs, ruleHint: null }
  // 非零退出且无已知特征：空 stderr = 静默失败（如 score 未构建静默退出）→ crashed unknown
  return { outcome: "crashed", startMs, ruleHint: "unknown", stderrTail: stderr.slice(0, 120) }
}

// 基线 vs 被测差分判定（阈值初版，实测后校准）
export function verdictFromDelta({ startDeltaMs, lagDeltaMs = 0 }) {
  return {
    startupSlow: startDeltaMs > 500,
    eventLoopLag: lagDeltaMs > 50,
    grade: startDeltaMs > 500 || lagDeltaMs > 50 ? "red" : "green",
  }
}
// P1 完整流程：install 阶段失败必须短路（score 案例：git 源被 pnpm allowBuilds 拦截 → 插件未装 → boot 无意义）
export function parseInstallOutcome({ installExit, installStderr = "" }) {
  if (installExit === 0) return { installOk: true }
  if (/allowBuilds|build scripts|pnpm block|git-hosted/i.test(installStderr)) {
    return { installOk: false, ruleHint: "install-blocked", note: "pnpm blocked git-source build scripts (allowBuilds approval required)" }
  }
  if (/Cannot find package|ERR_MODULE_NOT_FOUND/i.test(installStderr)) {
    return { installOk: false, ruleHint: "missing-dep", note: "Dependency resolution failed" }
  }
  return { installOk: false, ruleHint: "install-failed", stderrTail: installStderr.slice(0, 120) }
}