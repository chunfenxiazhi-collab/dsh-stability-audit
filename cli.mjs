#!/usr/bin/env node
// CLI: node cli.mjs [profile] [--dynamic] — 审计一个 dsh profile 的全部插件
//      node cli.mjs --remote <owner/repo> — 审计一个远程 GitHub 插件（clone 到临时目录）
import { collectPlugins } from "./lib/collect.js"
import { auditProfile } from "./lib/scanner.js"
import { renderReport } from "./lib/report.js"
import { auditRemote } from "./lib/remote.js"

const remoteArg = process.argv.indexOf("--remote")
if (remoteArg !== -1) {
  const spec = process.argv[remoteArg + 1]
  if (!spec) { console.error("用法: node cli.mjs --remote <owner/repo>"); process.exit(1) }
  const result = await auditRemote({ spec })
  if (result.status === "fail") { console.error(`远程审计失败: ${result.detail}`); process.exit(1) }
  const audit = { generatedAt: new Date().toISOString(), plugins: [result],
    summary: { red: result.grade === "red" ? 1 : 0, yellow: result.grade === "yellow" ? 1 : 0, green: result.grade === "green" ? 1 : 0 } }
  console.log(renderReport(audit))
  process.exit(0)
}

const profileArg = process.argv[2] || "web"
const dynamic = process.argv.includes("--dynamic")
const { plugins, preflight } = collectPlugins(undefined, profileArg)
if (!plugins.length) {
  console.error(`profile 不存在或无插件: ${profileArg}`)
  process.exit(1)
}
const audit = await auditProfile({ plugins, preflight, dynamic })
console.log(renderReport(audit))
