// 风险报告渲染：markdown 输出
export function renderReport(audit) {
  const L = { red: "🔴", yellow: "🟡", green: "🟢" }
  const lines = []
  lines.push(`# 插件稳定性审计报告（${audit.generatedAt.slice(0, 19).replace("T", " ")}）`)
  lines.push("")
  lines.push(`共 ${audit.plugins.length} 个插件：🔴${audit.summary.red} 🟡${audit.summary.yellow} 🟢${audit.summary.green}`)
  lines.push("")
  const order = { red: 0, yellow: 1, green: 2 }
  const sorted = [...audit.plugins].sort((a, b) => order[a.grade] - order[b.grade])
  for (const p of sorted) {
    lines.push(`## ${L[p.grade]} ${p.name}@${p.version}`)
    if (!p.findings.length) { lines.push("- 无风险信号"); continue }
    for (const f of p.findings) {
      lines.push(`- **[${f.severity}] ${f.desc}** — 证据: ${f.evidence}`)
    }
    if (p.dynamic) {
      const icon = p.dynamic.status === "pass" ? "✅" : p.dynamic.status === "fail" ? "❌" : "⏭️"
      lines.push(`- **${icon} 隔离验证: ${p.dynamic.detail}**（${p.dynamic.durationMs}ms）`)
    }
  }
  lines.push("")
  lines.push("> 判级说明：🔴=建议修复或隔离后再启用；🟡=可启用但关注；🟢=无风险信号。审计为静态分析（含 dsh 预检报告），不运行被审插件。")
  return lines.join("\n")
}