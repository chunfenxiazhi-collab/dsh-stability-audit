import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.join(__dirname, "fixtures")
const PREFLIGHT = JSON.parse(readFileSync(path.join(__dirname, "preflight-report.json"), "utf8"))

import { auditPlugin, auditProfile } from "../lib/scanner.js"

function audit(name) {
  return auditPlugin({ dir: path.join(FIX, name), preflight: PREFLIGHT })
}

test("good-plugin 判绿", () => {
  const r = audit("good-plugin")
  assert.equal(r.grade, "green", JSON.stringify(r.findings))
})

test("hook-plugin 判红（钩子面）", () => {
  const r = audit("hook-plugin")
  assert.equal(r.grade, "red")
  assert.ok(r.findings.some(f => f.ruleId === "hook-surface"), "应命中 hook-surface")
})

test("startup-plugin 判红（启动重任务）", () => {
  const r = audit("startup-plugin")
  assert.equal(r.grade, "red")
  assert.ok(r.findings.some(f => f.ruleId === "startup-work"), "应命中 startup-work")
})

test("no-bundle-plugin 判黄（无 bundle）", () => {
  const r = audit("no-bundle-plugin")
  assert.equal(r.grade, "yellow")
  assert.ok(r.findings.some(f => f.ruleId === "no-bundle"))
})

test("heavy-deps-plugin 判黄（依赖过多）", () => {
  const r = audit("heavy-deps-plugin")
  assert.equal(r.grade, "yellow")
  assert.ok(r.findings.some(f => f.ruleId === "heavy-deps"))
})

test("many-events-plugin 判黄（事件监听多）", () => {
  const r = audit("many-events-plugin")
  assert.equal(r.grade, "yellow")
  assert.ok(r.findings.some(f => f.ruleId === "many-events"))
})

test("preflight 判红（配置无效 unresolved/fail）", () => {
  const r = auditPlugin({ dir: path.join(FIX, "good-plugin"), preflight: PREFLIGHT, name: "broken-config-plugin" })
  assert.equal(r.grade, "red")
  assert.ok(r.findings.some(f => f.ruleId === "preflight-fail"))
})

test("auditProfile 聚合多个插件", async () => {
  const names = ["good-plugin", "hook-plugin", "startup-plugin", "no-bundle-plugin", "heavy-deps-plugin", "many-events-plugin"]
  const r = await auditProfile({ plugins: names.map(n => ({ dir: path.join(FIX, n) })), preflight: PREFLIGHT })
  assert.equal(r.plugins.length, 6)
  const counts = r.plugins.reduce((a, p) => (a[p.grade] = (a[p.grade] || 0) + 1, a), {})
  assert.equal(counts.green, 1)
  assert.equal(counts.red, 2)
  assert.equal(counts.yellow, 3)
})

import { renderReport } from "../lib/report.js"

test("renderReport 输出 markdown 含分级", async () => {
  const r = await auditProfile({ plugins: [path.join(FIX, "hook-plugin"), path.join(FIX, "good-plugin")].map(d => ({ dir: d })), preflight: PREFLIGHT })
  const md = renderReport(r)
  assert.ok(md.includes("🔴") && md.includes("🟢"), "应含红绿标记")
  assert.ok(md.includes("hook-plugin"))
})