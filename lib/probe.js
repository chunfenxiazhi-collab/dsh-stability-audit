// v2 运行时探针：P1 启动耗时 + 故障错误解析（分层设计第一层）。
// 原理：headless 冷启动 = 插件树加载 + apply() + 服务就绪。同步阻塞（codegraph 式扫描）
// 线性拉长启动；崩溃/卡死直接反映在退出码与 stderr。测量 = 基线 vs 被测的差分。
// 复用 dyncheck 的隔离 DSH_HOME 框架，不碰宿主 profile。

// 错误文本 → 规则映射（实测闭环：静态规则的真实验证）
const RULE_HINTS = [
  { re: /Cannot find package/, rule: "missing-dep" },
  { re: /Stripping types|unsupported for files under node_modules/, rule: "unbuilt-entry" },
  { re: /plugin tree failed to load/, rule: "tree-failure" },
  { re: /ERR_MODULE_NOT_FOUND/, rule: "entry-missing" },
]

// 解析一次启动的结果 → outcome + 规则提示
export function parseBootOutcome({ exitCode, stderr = "", timedOut = false, startMs }) {
  if (timedOut) return { outcome: "timed-out", startMs, ruleHint: "startup-work" }
  if (exitCode !== 0) {
    // pending (waiting for service) = 隔离环境缺宿主服务，非插件缺陷（沿用 dyncheck 语义）
    const pendingEnv = /pending \(waiting for services?: [A-Za-z, ]+\)/.test(stderr)
    if (pendingEnv && /plugin tree failed/i.test(stderr)) {
      return { outcome: "booted", startMs, ruleHint: null, note: "env-pending" }
    }
    for (const { re, rule } of RULE_HINTS) {
      if (re.test(stderr)) return { outcome: "crashed", startMs, ruleHint: rule }
    }
    return { outcome: "crashed", startMs, ruleHint: "unknown", stderrTail: stderr.slice(0, 120) }
  }
  return { outcome: "booted", startMs, ruleHint: null }
}

// 基线 vs 被测差分判定（阈值初版，实测后校准）
export function verdictFromDelta({ startDeltaMs, lagDeltaMs = 0 }) {
  return {
    startupSlow: startDeltaMs > 500,
    eventLoopLag: lagDeltaMs > 50,
    grade: startDeltaMs > 500 || lagDeltaMs > 50 ? "red" : "green",
  }
}
