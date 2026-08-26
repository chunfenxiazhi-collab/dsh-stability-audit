import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { scanLockfile, aiVersionMismatches } from "../lib/lockscan.js"

test("scanLockfile: 解析包数与 hasBin", () => {
  const r = scanLockfile(path.join(__dirname, "fixtures", "lock-risk-plugin", "pnpm-lock.yaml"))
  assert.ok(r)
  assert.equal(r.total, 3)
  assert.ok(r.hasBins.includes("evil-pkg@2.0.0"))
  assert.ok(r.hasBins.includes("risky-pkg@3.0.0"))
})

test("scanLockfile: 文件不存在返回 null", () => {
  assert.equal(scanLockfile("C:/nonexistent/lock.yaml"), null)
})

test("aiVersionMismatches: lock 版本与宿主不一致 → 检出", () => {
  const r = scanLockfile(path.join(__dirname, "fixtures", "lock-risk-plugin", "pnpm-lock.yaml"))
  const mism = aiVersionMismatches(r, { "@deepseek-ai/dsh-tools": "0.1.1-rc.2" })
  assert.deepEqual(mism, [])
})