import { test } from "node:test"
import assert from "node:assert/strict"

import { parseBootOutcome, verdictFromDelta } from "../lib/probe.js"

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