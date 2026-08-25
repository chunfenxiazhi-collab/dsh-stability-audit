#!/usr/bin/env node
// CLI: node cli.mjs [profile] [--dynamic] — 审计一个 dsh profile 的全部插件
//      node cli.mjs --remote <owner/repo> — 审计一个远程 GitHub 插件（clone 到临时目录）
import { collectPlugins } from "./lib/collect.js"
import { auditProfile } from "./lib/scanner.js"
import { renderReport, renderJson } from "./lib/report.js"
import { auditRemote } from "./lib/remote.js"

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