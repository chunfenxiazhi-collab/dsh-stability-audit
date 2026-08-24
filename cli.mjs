#!/usr/bin/env node
// CLI: node cli.mjs [profile] [--dynamic] — 审计一个 dsh profile 的全部插件
import { collectPlugins } from "./lib/collect.js"
import { auditProfile } from "./lib/scanner.js"
import { renderReport } from "./lib/report.js"

const profileArg = process.argv[2] || "web"
const dynamic = process.argv.includes("--dynamic")
const { plugins, preflight } = collectPlugins(undefined, profileArg)
if (!plugins.length) {
  console.error(`profile 不存在或无插件: ${profileArg}`)
  process.exit(1)
}
const audit = await auditProfile({ plugins, preflight, dynamic })
console.log(renderReport(audit))