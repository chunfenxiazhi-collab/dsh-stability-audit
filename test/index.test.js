// 冒烟：index.js 可导入、apply 注册工具
import { test } from "node:test"
import assert from "node:assert/strict"
import { name, apply } from "../index.js"
test("index 导出 name/apply", () => {
  assert.equal(name, "dsh-stability-audit")
  assert.equal(typeof apply, "function")
})
test("apply 注册 stability_audit 工具", () => {
  const registered = []
  const ctx = { tools: { register: (t) => registered.push(t) } }
  apply(ctx)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, "stability_audit")
  assert.ok(typeof registered[0].execute === "function")
})