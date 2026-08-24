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


// ===== v0.6 新增规则 =====

test("missing-inject-plugin 判红（ctx 服务未 inject 声明）", () => {
  const r = auditPlugin({ dir: path.join(FIX, "missing-inject-plugin"), preflight: PREFLIGHT })
  assert.equal(r.grade, "red", JSON.stringify(r.findings))
  assert.ok(r.findings.some(f => f.ruleId === "missing-inject"), "应命中 missing-inject")
})

test("unbuilt-entry-plugin 判红（main 指向未构建的 TS 源码）", () => {
  const r = auditPlugin({ dir: path.join(FIX, "unbuilt-entry-plugin"), preflight: PREFLIGHT })
  assert.equal(r.grade, "red", JSON.stringify(r.findings))
  assert.ok(r.findings.some(f => f.ruleId === "unbuilt-entry"), "应命中 unbuilt-entry")
})

test("dep-range-plugin 判黄（@deepseek-ai/* 依赖区间不含宿主版本）", () => {
  const r = auditPlugin({ dir: path.join(FIX, "dep-range-plugin"), preflight: PREFLIGHT, hostPkgVersions: { "@deepseek-ai/dsh-tools": "0.1.1-rc.2" } })
  assert.equal(r.grade, "yellow", JSON.stringify(r.findings))
  assert.ok(r.findings.some(f => f.ruleId === "dsh-dep-range"), "应命中 dsh-dep-range")
})

test("dep-range-ok-plugin 判绿（依赖区间含宿主版本）", () => {
  const r = auditPlugin({ dir: path.join(FIX, "dep-range-ok-plugin"), preflight: PREFLIGHT, hostPkgVersions: { "@deepseek-ai/dsh-tools": "0.1.1-rc.2" } })
  assert.equal(r.grade, "green", JSON.stringify(r.findings))
})

test("inject 声明齐全的插件不误报", () => {
  const r = auditPlugin({ dir: path.join(FIX, "good-plugin"), preflight: PREFLIGHT, hostPkgVersions: { "@deepseek-ai/dsh-tools": "0.1.1-rc.2" } })
  assert.ok(!r.findings.some(f => f.ruleId === "missing-inject"), "good-plugin 不应命中 missing-inject")
})

test("const-inject 形式声明齐全不误报（构建产物常见）", () => {
  const r = auditPlugin({ dir: path.join(FIX, "const-inject-plugin"), preflight: PREFLIGHT })
  assert.ok(!r.findings.some(f => f.ruleId === "missing-inject"), JSON.stringify(r.findings))
  assert.equal(r.grade, "green", JSON.stringify(r.findings))
})

test("deferred-inject-plugin 判黄（函数内延迟访问未声明）", () => {
  const r = auditPlugin({ dir: path.join(FIX, "deferred-inject-plugin"), preflight: PREFLIGHT })
  assert.equal(r.grade, "yellow", JSON.stringify(r.findings))
  const f = r.findings.find(x => x.ruleId === "missing-inject")
  assert.ok(f && f.severity === "yellow", "应为 yellow 而非 red")
})

test("sctx 别名不误报 missing-inject（词边界）", () => {
  const r = auditPlugin({ dir: path.join(FIX, "sctx-plugin"), preflight: PREFLIGHT })
  assert.ok(!r.findings.some(f => f.ruleId === "missing-inject"), JSON.stringify(r.findings))
})
