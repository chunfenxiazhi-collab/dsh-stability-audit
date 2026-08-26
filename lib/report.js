// 风险报告渲染：markdown 输出
export function renderReport(audit) {
  const L = { red: "🔴", yellow: "🟡", green: "🟢" }
  const lines = []
  lines.push(`# Plugin Stability Audit Report (${audit.generatedAt.slice(0, 19).replace("T", " ")})`)
  lines.push("")
  lines.push(`Total ${audit.plugins.length} plugins: 🔴${audit.summary.red} 🟡${audit.summary.yellow} 🟢${audit.summary.green}`)
  lines.push("")
  const order = { red: 0, yellow: 1, green: 2 }
  const sorted = [...audit.plugins].sort((a, b) => order[a.grade] - order[b.grade])
  for (const p of sorted) {
    const commitTag = p.sourceCommit ? ` (commit ${p.sourceCommit})` : ""
    const freshTag = p.freshness?.level === "very-fresh" ? " ⚠️[very-fresh]" : p.freshness?.level === "recent" ? " [recent]" : ""
    const dormantTag = p.dormancy?.dormant ? " 💤[dormant]" : ""
    lines.push(`## ${L[p.grade]} ${p.name}@${p.version}${commitTag}${freshTag}${dormantTag}`)
    if (!p.findings.length) { lines.push("- No risk signals"); continue }
    for (const f of p.findings) {
      lines.push(`- **[${f.severity}] ${f.desc}** — Evidence: ${f.evidence}`)
      if (f.fix) lines.push(`  - 🔧 Fix: ${f.fix}`)
    }
    if (p.dynamic) {
      const icon = p.dynamic.status === "pass" ? "✅" : p.dynamic.status === "fail" ? "❌" : "⏭️"
      const tag = p.dynamic.installStatus === "install-blocked" ? " [install-blocked]" : ""
      lines.push(`- **${icon} Isolated verification${tag}: ${p.dynamic.detail}** (${p.dynamic.durationMs}ms)`)
    }
  }
  lines.push("")
  lines.push("> Legend: 🔴=fix or isolate before enabling; 🟡=usable with caution; 🟢=no risk signals. Audit is static analysis (incl. dsh preflight report); audited plugins are never executed.")
  return lines.join("\n")
}
// v0.8: JSON 输出（供其他 agent 程序化消费：每 finding 带 ruleId/severity/fix）
export function renderJson(audit) {
  return JSON.stringify({
    schema: "dsh-stability-audit/v1",
    generatedAt: audit.generatedAt,
    summary: audit.summary,
    plugins: audit.plugins.map(p => ({
      name: p.name,
      version: p.version,
      grade: p.grade,
      source: p.source || null,
      sourceCommit: p.sourceCommit || null,
      freshness: p.freshness || null,
      dormancy: p.dormancy || null,
      dynamic: p.dynamic || null,
      findings: (p.findings || []).map(f => ({
        ruleId: f.ruleId,
        severity: f.severity,
        desc: f.desc,
        evidence: f.evidence,
        fix: f.fix || null,
        endpoints: f.endpoints || null,
      })),
    })),
  }, null, 2)
}