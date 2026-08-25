import { test } from "node:test"
import assert from "node:assert/strict"

import { parseBootOutcome, parseInstallOutcome, verdictFromDelta } from "../lib/probe.js"

test("P1: parseBootOutcome 正常退出无错误 → booted", () => {
  const r = parseBootOutcome({ exitCode: 0, stderr: "", timedOut: false, startMs: 1345 })
  assert.equal(r.outcome, "booted")
  assert.equal(r.startMs, 1345)
  assert.equal(r.ruleHint, null)
})

test("P1: parseBootOutcome 崩溃 + Cannot find package → missing-dep 实测确认", () => {
  const err = "Error: Cannot find package 'schemastery' imported from index.mjs"
  const r = parseBootOutcome({ exitCode: 1, stderr: err, timedOut: false, startMs: 800 })
  assert.equal(r.outcome, "crashed")
  assert.equal(r.ruleHint, "missing-dep")
})

test("P1: parseBootOutcome Stripping types → unbuilt-entry 实测确认", () => {
  const err = "Stripping types is currently unsupported for files under node_modules"
  const r = parseBootOutcome({ exitCode: 1, stderr: err, timedOut: false, startMs: 900 })
  assert.equal(r.ruleHint, "unbuilt-entry")
})

test("P1: parseBootOutcome plugin tree failed → tree-failure", () => {
  const err = "Error: dsh: plugin tree failed to load"
  const r = parseBootOutcome({ exitCode: 1, stderr: err, timedOut: false, startMs: 700 })
  assert.equal(r.outcome, "crashed")
  assert.equal(r.ruleHint, "tree-failure")
})

test("P1: parseBootOutcome 超时 → startup-work 铁证", () => {
  const r = parseBootOutcome({ exitCode: null, stderr: "", timedOut: true, startMs: 30000 })
  assert.equal(r.outcome, "timed-out")
  assert.equal(r.ruleHint, "startup-work")
})

test("P1: parseBootOutcome pending 环境依赖 → env-pending（非故障）", () => {
  const err = "Error: dsh: plugin tree failed to load: dsh: 1 entry did not activate\ndsh-notify: pending (waiting for service: webServer)"
  const r = parseBootOutcome({ exitCode: 1, stderr: err, timedOut: false, startMs: 2000 })
  assert.equal(r.outcome, "booted") // pending = 环境依赖，不算崩溃
  assert.equal(r.ruleHint, null)
})

test("P1: verdictFromDelta 差分>500ms → startupSlow", () => {
  const v = verdictFromDelta({ startDeltaMs: 1755, lagDeltaMs: 0 })
  assert.equal(v.startupSlow, true)
})

test("P1: verdictFromDelta 差分正常 → 不判红", () => {
  const v = verdictFromDelta({ startDeltaMs: 100, lagDeltaMs: 5 })
  assert.equal(v.startupSlow, false)
  assert.equal(v.eventLoopLag, false)
})

test("P1: 正常插件 exit 1 + MISSING_CREDENTIAL → booted（不能只看 exit code）", () => {
  const r = parseBootOutcome({ exitCode: 1, stderr: "dsh: MISSING_CREDENTIAL: no API key", timedOut: false, startMs: 1723 })
  assert.equal(r.outcome, "booted")
})

test("P1: stderr 含 API key 提示但 exit 1 → booted", () => {
  const r = parseBootOutcome({ exitCode: 1, stderr: "dsh: MISSING_CREDENTIAL: llm-deepseek: no API key", timedOut: false, startMs: 1600 })
  assert.equal(r.outcome, "booted")
})

test("P1: Cannot find package '<插件自身路径>/index.js' → no-entry", () => {
  const err = "Cannot find package 'C:\\Users\\x\\profiles\\headless\\node_modules\\dsh-verify\\index.js'"
  const r = parseBootOutcome({ exitCode: 1, stderr: err, timedOut: false, startMs: 1800 })
  assert.equal(r.ruleHint, "no-entry")
})

test("P1: exit 1 但 stderr 完全为空（静默失败）→ crashed unknown", () => {
  const r = parseBootOutcome({ exitCode: 1, stderr: "", timedOut: false, startMs: 1800 })
  assert.equal(r.outcome, "crashed")
  assert.equal(r.ruleHint, "unknown")
})

test("P1: install 被 pnpm allowBuilds 拦截 → install-blocked", () => {
  const r = parseInstallOutcome({ installExit: 1, installStderr: "dsh: pnpm failed ... git-hosted plugins build on install via their prepare script, which pnpm blocks until allowBuilds" })
  assert.equal(r.installOk, false)
  assert.equal(r.ruleHint, "install-blocked")
})

test("P1: install 成功 → installOk", () => {
  const r = parseInstallOutcome({ installExit: 0, installStderr: "" })
  assert.equal(r.installOk, true)
})