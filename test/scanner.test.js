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

test("v0.8: 每条 finding 都带 fix 修复建议（可执行命令）", () => {
  const cases = [
    ["hook-plugin", "hook-surface"],
    ["startup-plugin", "startup-work"],
    ["missing-inject-plugin", "missing-inject"],
    ["unbuilt-entry-plugin", "unbuilt-entry"],
  ]
  for (const [fixture, ruleId] of cases) {
    const r = auditPlugin({ dir: path.join(FIX, fixture), preflight: PREFLIGHT })
    const f = r.findings.find(x => x.ruleId === ruleId)
    assert.ok(f, `${fixture} 应命中 ${ruleId}`)
    assert.ok(f.fix && f.fix.length > 10, `${ruleId} 应有可执行修复建议: ${JSON.stringify(f.fix)}`)
  }
})

test("v0.8: no-bundle/heavy-deps/install-scripts 也带 fix", () => {
  for (const [fixture, ruleId] of [["no-bundle-plugin", "no-bundle"], ["heavy-deps-plugin", "heavy-deps"]]) {
    const r = auditPlugin({ dir: path.join(FIX, fixture), preflight: PREFLIGHT })
    const f = r.findings.find(x => x.ruleId === ruleId)
    assert.ok(f && f.fix && f.fix.length > 5, `${ruleId} 应有 fix`)
  }
})

test("v0.8: renderJson 结构化输出含 fix", async () => {
  const { renderJson } = await import("../lib/report.js")
  const r = await auditProfile({ plugins: [{ dir: path.join(FIX, "hook-plugin") }], preflight: PREFLIGHT })
  const j = JSON.parse(renderJson(r))
  assert.equal(j.schema, "dsh-stability-audit/v1")
  assert.equal(j.plugins[0].findings[0].ruleId, "hook-surface")
  assert.ok(j.plugins[0].findings[0].fix.length > 5, "fix 应存在")
})

test("v0.8: main 指向 TS 且仅 --noEmit 类型检查 → unbuilt-entry 红", async () => {
  const { mkdtempSync, rmSync, writeFileSync, mkdirSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const stage = mkdtempSync(path.join(tmpdir(), "dsh-noemit-"))
  try {
    mkdirSync(path.join(stage, "src"))
    writeFileSync(path.join(stage, "src", "index.ts"), "export const name = 'x'")
    writeFileSync(path.join(stage, "package.json"), JSON.stringify({
      name: "noemit-plugin", version: "1.0.0", main: "src/index.ts",
      scripts: { typecheck: "tsc --noEmit", test: "node --test" },
    }))
    const r = auditPlugin({ dir: stage, preflight: PREFLIGHT })
    assert.equal(r.grade, "red", JSON.stringify(r.findings))
    assert.ok(r.findings.some(f => f.ruleId === "unbuilt-entry"), "应命中 unbuilt-entry")
  } finally { rmSync(stage, { recursive: true, force: true }) }
})

test("v0.9: missing-dep 红（入口 import 未声明依赖）", () => {
  const r = auditPlugin({ dir: path.join(FIX, "missing-dep-plugin"), preflight: PREFLIGHT })
  assert.equal(r.grade, "red", JSON.stringify(r.findings))
  const f = r.findings.find(x => x.ruleId === "missing-dep")
  assert.ok(f, "应命中 missing-dep")
  assert.ok(f.desc.includes("schemastery"), "应指出 schemastery")
  assert.ok(f.fix && f.fix.length > 5, "应有 fix")
})

test("v0.9: no-entry 红（无 main 且无候选入口）", () => {
  const r = auditPlugin({ dir: path.join(FIX, "no-entry-plugin"), preflight: PREFLIGHT })
  assert.equal(r.grade, "red", JSON.stringify(r.findings))
  assert.ok(r.findings.some(f => f.ruleId === "no-entry"), "应命中 no-entry")
})

test("v0.9: good-plugin 不误报 missing-dep/no-entry", () => {
  const r = auditPlugin({ dir: path.join(FIX, "good-plugin"), preflight: PREFLIGHT })
  assert.ok(!r.findings.some(f => ["missing-dep", "no-entry"].includes(f.ruleId)), JSON.stringify(r.findings))
})

test("v0.11: 端点提取——process.env 外泄 → red exfil", () => {
  const r = auditPlugin({ dir: path.join(FIX, "exfil-plugin"), preflight: PREFLIGHT })
  const f = r.findings.find(x => x.ruleId === "exfil")
  assert.ok(f, "应命中 exfil: " + JSON.stringify(r.findings))
  assert.equal(f.severity, "red")
  assert.ok(f.endpoints?.some(e => e.includes("evil.example.com")), "应列出外泄端点")
  assert.ok(f.fix && f.fix.length > 5, "应有 fix")
})

test("v0.11: 端点提取——WebSocket 回连 → yellow remote-endpoint", () => {
  const r = auditPlugin({ dir: path.join(FIX, "ws-plugin"), preflight: PREFLIGHT })
  const f = r.findings.find(x => x.ruleId === "remote-endpoints")
  assert.ok(f, "应命中 remote-endpoints: " + JSON.stringify(r.findings))
  assert.equal(f.severity, "yellow")
  assert.ok(f.endpoints?.some(e => e.includes("wss://")), "应列出 wss 端点")
})

test("v0.11: 端点提取——正常 API 调用 → 仅 yellow（人工确认）", () => {
  const r = auditPlugin({ dir: path.join(FIX, "api-plugin"), preflight: PREFLIGHT })
  const f = r.findings.find(x => x.ruleId === "remote-endpoints")
  assert.ok(f, "应命中 remote-endpoints")
  assert.equal(f.severity, "yellow")
  assert.equal(r.grade, "yellow", "不应红（正常 API 是常见行为）")
})

test("v0.11: 端点提取——good-plugin 无端点不误报", () => {
  const r = auditPlugin({ dir: path.join(FIX, "good-plugin"), preflight: PREFLIGHT })
  assert.ok(!r.findings.some(f => ["exfil", "remote-endpoints"].includes(f.ruleId)), JSON.stringify(r.findings))
})

test("v0.11: renderJson 输出带 endpoints 字段", async () => {
  const { renderJson } = await import("../lib/report.js")
  const r = await auditProfile({ plugins: [{ dir: path.join(FIX, "api-plugin") }], preflight: PREFLIGHT })
  const j = JSON.parse(renderJson(r))
  const f = j.plugins[0].findings.find(x => x.ruleId === "remote-endpoints")
  assert.ok(f && f.endpoints && f.endpoints.some(e => e.includes("api.deepseek.com")), JSON.stringify(f))
})

// ===== FIX 2026-08-31 battle-test：exports 入口 / workspace 根 / client 豁免 =====
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"

function tmpDirWith(files) {
  const d = mkdtempSync(path.join(tmpdir(), "audit-fix-"))
  for (const [rel, content] of Object.entries(files)) {
    const fp = path.join(d, rel)
    mkdirSync(path.dirname(fp), { recursive: true })
    writeFileSync(fp, content)
  }
  return d
}

test("FIX-1: exports[\".\"] 入口存在 → 不判 no-entry/unbuilt-entry", () => {
  const d = tmpDirWith({ "preset/index.mjs": "export default {}" })
  const r = auditPlugin({ dir: d, pkg: { name: "exports-entry", version: "0.1.0", exports: { ".": "./preset/index.mjs" }, dsh: { bundle: { patch: "./cordis.patch.yml" } } } })
  assert.ok(!r.findings.some(f => f.ruleId === "no-entry"), JSON.stringify(r.findings))
  assert.ok(!r.findings.some(f => f.ruleId === "unbuilt-entry"), JSON.stringify(r.findings))
})

test("FIX-1b: exports 指向不存在文件 → unbuilt-entry 红", () => {
  const d = tmpDirWith({})
  const r = auditPlugin({ dir: d, pkg: { name: "exports-unbuilt", version: "0.1.0", exports: { ".": "./lib/missing.js" }, dsh: { bundle: { patch: "./x.yml" } } } })
  assert.ok(r.findings.some(f => f.ruleId === "unbuilt-entry" && f.severity === "red"), JSON.stringify(r.findings))
})

test("FIX-2: workspace 根（private + packages/）豁免 no-entry/no-bundle/unbuilt-entry", () => {
  const d = tmpDirWith({ "packages/a/package.json": "{}" })
  const r = auditPlugin({ dir: d, pkg: { name: "ws-root", version: "0.0.0", private: true } })
  assert.equal(r.grade, "green", JSON.stringify(r.findings))
  assert.ok(!r.findings.some(f => f.ruleId === "no-entry"), JSON.stringify(r.findings))
  assert.ok(!r.findings.some(f => f.ruleId === "no-bundle"), JSON.stringify(r.findings))
  assert.ok(!r.findings.some(f => f.ruleId === "unbuilt-entry"), JSON.stringify(r.findings))
})

test("FIX-4: client 插件（dsh.client + exports[\"./client\"] 产物存在）豁免 no-bundle/no-entry", () => {
  const d = tmpDirWith({ "lib/client.js": "export default {}" })
  const r = auditPlugin({ dir: d, pkg: { name: "client-only", version: "0.1.0", exports: { "./client": "./lib/client.js" }, dsh: { client: { inject: [], platform: "web" } } } })
  assert.ok(!r.findings.some(f => f.ruleId === "no-bundle"), JSON.stringify(r.findings))
  assert.ok(!r.findings.some(f => f.ruleId === "no-entry"), JSON.stringify(r.findings))
})

