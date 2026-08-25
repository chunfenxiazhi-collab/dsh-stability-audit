import { test } from "node:test"
import assert from "node:assert/strict"
import { homedir } from "node:os"
import path from "node:path"
import { existsSync, rmSync, mkdirSync } from "node:fs"

import { diffReport, persistReport, summaryLine, reportPath } from "../lib/report-store.js"

test("diffReport: 新增红插件 → added", () => {
  const prev = { plugins: [{ name: "a", version: "1", grade: "green" }] }
  const curr = { plugins: [{ name: "a", version: "1", grade: "green" }, { name: "b", version: "1", grade: "red" }] }
  const d = diffReport(prev, curr)
  assert.deepEqual(d.added, ["b → red"])
})

test("diffReport: 状态从黄变红 → changed", () => {
  const prev = { plugins: [{ name: "a", version: "1", grade: "yellow" }] }
  const curr = { plugins: [{ name: "a", version: "1", grade: "red" }] }
  const d = diffReport(prev, curr)
  assert.deepEqual(d.changed, ["a: yellow → red"])
})

test("persistReport: 首次写报告 → changed=true", () => {
  const p = path.join(homedir(), ".dsh", "stability-report.json")
  try { rmSync(p, { force: true }) } catch {}
  const r = persistReport({ generatedAt: "x", summary: { red: 1, yellow: 0, green: 0 }, plugins: [{ name: "a", version: "1", grade: "red" }] })
  assert.equal(r.changed, true)
  assert.ok(existsSync(p))
  assert.equal(r.written, p)
  // 再次写相同状态 → changed=false（不打扰）
  const r2 = persistReport({ generatedAt: "y", summary: { red: 1, yellow: 0, green: 0 }, plugins: [{ name: "a", version: "1", grade: "red" }] })
  assert.equal(r2.changed, false)
})

test("summaryLine: 输出摘要行", () => {
  const s = summaryLine({ summary: { red: 2, yellow: 4, green: 22 } })
  assert.ok(s.includes("🔴2") && s.includes("🟡4") && s.includes("🟢22"))
})
