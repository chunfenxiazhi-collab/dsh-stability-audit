import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { stageTarget, findDshBin, dynamicCheck } from "../lib/dyncheck.js"

test("stageTarget 无空格路径原样返回", () => {
  const r = stageTarget("C:\\no-space\\dir")
  assert.equal(r.dir, "C:\\no-space\\dir")
  assert.equal(r.cleanup, null)
})

test("findDshBin 返回存在的 bin 或 null", () => {
  const b = findDshBin()
  if (b) { assert.ok(path.isAbsolute(b)) } else { assert.equal(b, null) }
})

test("dynamicCheck 对无效 DSH_CLI 优雅处理（fallback 或 skipped）", () => {
  const prev = process.env.DSH_CLI
  process.env.DSH_CLI = "C:\\nonexistent\\dsh\\lib\\bin.js"
  try {
    const r = dynamicCheck({ target: "C:\\tmp\\whatever" })
    // 本机存在宿主 dsh bin 时 fallback 后可能 pass/fail；无 bin 时 skipped——
    // 不允许抛异常/挂起即可（优雅降级语义）
    assert.ok(["pass", "fail", "skipped"].includes(r.status), `意外状态: ${r.status}`)
    assert.ok(typeof r.detail === "string" && r.detail.length > 0)
  } finally {
    if (prev === undefined) delete process.env.DSH_CLI
    else process.env.DSH_CLI = prev
  }
})