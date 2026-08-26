import { test } from "node:test"
import assert from "node:assert/strict"

import { parseOsvResponse } from "../lib/osv.js"

test("parseOsvResponse: 无漏洞 → 空列表", () => {
  const r = parseOsvResponse({ results: [{ vulns: [] }] })
  assert.deepEqual(r, [])
})

test("parseOsvResponse: 命中漏洞 → 提取 id/modified（querybatch 精简响应）", () => {
  const resp = { results: [{ vulns: [{ id: "GHSA-1234", modified: "2024-01-01T00:00:00Z" }] }] }
  const r = parseOsvResponse(resp)
  assert.equal(r.length, 1)
  assert.equal(r[0].id, "GHSA-1234")
  assert.equal(r[0].modified, "2024-01-01T00:00:00Z")
})

test("parseOsvResponse: 响应缺失 → 空列表", () => {
  assert.deepEqual(parseOsvResponse(null), [])
  assert.deepEqual(parseOsvResponse({}), [])
})

test("queryOSV: 注入 fetchFn 模拟命中", async () => {
  const { queryOSV } = await import("../lib/osv.js")
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ results: [{ vulns: [{ id: "GHSA-X", modified: "2024-01-01T00:00:00Z" }] }] }),
  })
  const r = await queryOSV([{ name: "lodash", ecosystem: "npm" }], { fetchFn: fakeFetch })
  assert.equal(r.length, 1)
  assert.equal(r[0].id, "GHSA-X")
})