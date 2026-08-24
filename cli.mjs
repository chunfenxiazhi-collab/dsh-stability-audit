#!/usr/bin/env node
// CLI: node cli.mjs [profileDir] — 审计一个 dsh profile 的全部插件
import { readFileSync, existsSync, readdirSync } from "node:fs"
import path from "node:path"
import os from "node:os"
import { auditProfile } from "./lib/scanner.js"
import { renderReport } from "./lib/report.js"

const dshHome = process.env.DSH_HOME || path.join(os.homedir(), ".dsh")
const profileArg = process.argv[2] || "web"
const profileDir = path.join(dshHome, "profiles", profileArg)

const pkgJsonPath = path.join(profileDir, "package.json")
if (!existsSync(pkgJsonPath)) {
  console.error(`profile 不存在: ${profileDir}`)
  process.exit(1)
}
const profile = JSON.parse(readFileSync(pkgJsonPath, "utf8"))
const deps = Object.keys(profile.dependencies || {})

// 插件目录：优先 node_modules（pnpm 提升），再 plugin-src（link 挂载）
const plugins = []
const seen = new Set()
for (const name of deps) {
  if (seen.has(name)) continue
  seen.add(name)
  const nmDir = path.join(profileDir, "node_modules", name)
  const srcDir = path.join(dshHome, "plugin-src", name)
  const dir = existsSync(nmDir) ? nmDir : (existsSync(srcDir) ? srcDir : null)
  if (dir) plugins.push({ dir, name })
}

// 预检报告（可选）
let preflight = null
const pfPath = path.join(dshHome, "dsh-preflight-report.json")
if (existsSync(pfPath)) {
  try { preflight = JSON.parse(readFileSync(pfPath, "utf8")) } catch {}
}

const dynamic = process.argv.includes("--dynamic")
const audit = await auditProfile({ plugins, preflight, dynamic })
console.log(renderReport(audit))