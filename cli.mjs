#!/usr/bin/env node
// CLI: node cli.mjs [profile] [--dynamic] — 审计一个 dsh profile 的全部插件
//      node cli.mjs --remote <owner/repo> — 审计一个远程 GitHub 插件（clone 到临时目录）
import { collectPlugins } from "./lib/collect.js"
import path from "node:path"
import { detectHostPkgVersions } from "./lib/scanner.js"
import { auditProfile } from "./lib/scanner.js"
import { renderReport, renderJson } from "./lib/report.js"
import { auditRemote } from "./lib/remote.js"
import { scanLockfile, aiVersionMismatches } from "./lib/lockscan.js"

// --lock: profile 依赖树健康扫描（pnpm-lock 深度）
if (process.argv.includes("--lock")) {
  const { dshHomeOf } = await import("./lib/collect.js")
  const profile = process.argv[process.argv.indexOf("--lock") + 1] || "web"
  const lockPath = path.join(dshHomeOf(), "profiles", profile, "pnpm-lock.yaml")
  const scan = scanLockfile(lockPath)
  if (!scan) { console.error("lock 文件不存在: " + lockPath); process.exit(1) }
  const host = await detectHostPkgVersions()
  const mism = aiVersionMismatches(scan, host)
  const lines = ["# 依赖树健康报告 (pnpm-lock 深度扫描)"]
  lines.push("")
  lines.push("依赖包总数: " + scan.total)
  const binNames = scan.hasBins.map(n => n.length > 50 ? n.slice(0, 50) + "…" : n)
  lines.push("hasBin 包: " + scan.hasBins.length + (scan.hasBins.length ? ": " + binNames.join(", ") : ""))
  if (mism.length) {
    lines.push("")
    lines.push("⚠️ @deepseek-ai/* 版本与宿主不一致:")
    for (const m of mism) lines.push("  - " + m.name + ": lock=" + m.lockVersions.join("/") + " host=" + m.hostVersion)
  } else {
    lines.push("@deepseek-ai/* 版本与宿主一致 ✅")
  }
  console.log(lines.join("\n"))
  process.exit(0)
}

const remoteArg = process.argv.indexOf("--remote")
if (remoteArg !== -1) {
  // 支持多个 spec：--remote a/b,c/d 或 --remote a/b c/d（直到下一个 -- 参数）
  const specs = []
  for (let i = remoteArg + 1; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a.startsWith("--")) break
    specs.push(...a.split(",").map(s => s.trim()).filter(Boolean))
  }
  if (!specs.length) { console.error("Usage: node cli.mjs --remote <owner/repo[,owner/repo...]> [--dynamic]"); process.exit(1) }
  const dynamic = process.argv.includes("--dynamic")
  const results = []
  for (const spec of specs) {
    const result = await auditRemote({ spec, dynamic })
    if (result.status === "fail") { console.error(`Remote audit failed ${spec}: ${result.detail}`); continue }
    results.push(result)
  }
  const audit = { generatedAt: new Date().toISOString(), plugins: results,
    summary: { red: results.filter(r => r.grade === "red").length,
               yellow: results.filter(r => r.grade === "yellow").length,
               green: results.filter(r => r.grade === "green").length } }
  console.log(process.argv.includes("--json") ? renderJson(audit) : renderReport(audit))
  process.exit(0)
}

const profileArg = process.argv[2] || "web"
const dynamic = process.argv.includes("--dynamic")
const { plugins, preflight } = collectPlugins(undefined, profileArg)
if (!plugins.length) {
  console.error(`Profile not found or has no plugins: ${profileArg}`)
  process.exit(1)
}
const audit = await auditProfile({ plugins, preflight, dynamic })
console.log(process.argv.includes("--json") ? renderJson(audit) : renderReport(audit))