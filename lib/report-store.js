// 报告持久化：写 ~/.dsh/stability-report.json + 状态变化检测（零依赖）。
// 行业经验（杀毒软件可用性研究）：被动扫描 + 只在状态变化时打扰，避免 alert fatigue。
import { homedir } from "node:os"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"

export function reportPath() {
  return path.join(homedir(), ".dsh", "stability-report.json")
}

// 与上次报告对比 → 新增/消失的红黄（用于"状态变化才提示"）
export function diffReport(prev, curr) {
  const key = (p) => `${p.name}@${p.version}` // 不含 grade：同名同版本才能检测"状态变化"
  const prevMap = new Map((prev?.plugins || []).map(p => [key(p), p]))
  const currMap = new Map((curr?.plugins || []).map(p => [key(p), p]))
  const added = [], removed = [], changed = []
  for (const [k, p] of currMap) {
    if (p.grade === "green") continue
    const old = prevMap.get(k)
    if (!old) added.push(`${p.name} → ${p.grade}`)
    else if (old.grade !== p.grade) changed.push(`${p.name}: ${old.grade} → ${p.grade}`)
  }
  for (const [k, p] of prevMap) {
    if (p.grade === "green") continue
    if (!currMap.has(k)) removed.push(`${p.name}（已消失）`)
  }
  return { added, removed, changed }
}

// 写报告；返回 { written, changed } —— changed 仅在状态变化时 true
export function persistReport(audit) {
  const p = reportPath()
  try { mkdirSync(path.dirname(p), { recursive: true }) } catch { /* 目录已存在 */ }
  let prev = null
  if (existsSync(p)) {
    try { prev = JSON.parse(readFileSync(p, "utf8")) } catch { /* 旧报告损坏，忽略 */ }
  }
  writeFileSync(p, JSON.stringify(audit, null, 2))
  const diff = diffReport(prev, audit)
  const changed = diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0
  return { written: p, changed, diff }
}

// 健康摘要一行（focus 时附在报告头）
export function summaryLine(audit) {
  const s = audit.summary || {}
  return `📋 插件健康度: 🔴${s.red || 0} 🟡${s.yellow || 0} 🟢${s.green || 0}（报告: ${reportPath()}）`
}