import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, copyFileSync, symlinkSync, mkdtempSync, rmSync } from "node:fs"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIX = path.join(__dirname, "fixtures")

import { parseSpec, auditRemote, copyDir } from "../lib/remote.js"

test("parseSpec: owner/repo 格式", () => {
  const s = parseSpec("chunfenxiazhi-collab/dsh-stability-audit")
  assert.equal(s.owner, "chunfenxiazhi-collab")
  assert.equal(s.repo, "dsh-stability-audit")
  assert.equal(s.url, "https://github.com/chunfenxiazhi-collab/dsh-stability-audit.git")
})

test("parseSpec: github: 前缀格式", () => {
  const s = parseSpec("github:owner/repo")
  assert.equal(s.owner, "owner")
  assert.equal(s.repo, "repo")
})

test("parseSpec: 完整 https 格式", () => {
  const s = parseSpec("https://github.com/owner/repo.git")
  assert.equal(s.owner, "owner")
  assert.equal(s.repo, "repo")
})

test("parseSpec: owner/repo.git 尾部 .git 正确剥离", () => {
  const s = parseSpec("owner/repo.git")
  assert.equal(s.owner, "owner")
  assert.equal(s.repo, "repo")
  assert.equal(s.url, "https://github.com/owner/repo.git")
})

test("parseSpec: 非法格式返回 null", () => {
  assert.equal(parseSpec("不是仓库"), null)
  assert.equal(parseSpec(""), null)
})

test("auditRemote: cloneFn 注入审计 good-plugin → green", async () => {
  const r = await auditRemote({
    spec: "test/good-plugin",
    cloneFn: async (url, dest) => { copyDir(path.join(FIX, "good-plugin"), dest) },
  })
  assert.equal(r.grade, "green", JSON.stringify(r.findings))
  assert.equal(r.name, "good-plugin")
  assert.equal(r.spec, "test/good-plugin")
})

test("auditRemote: cloneFn 注入审计 hook-plugin → red hook-surface", async () => {
  const r = await auditRemote({
    spec: "test/hook-plugin",
    cloneFn: async (url, dest) => { copyDir(path.join(FIX, "hook-plugin"), dest) },
  })
  assert.equal(r.grade, "red")
  assert.ok(r.findings.some(f => f.ruleId === "hook-surface"))
})

test("auditRemote: clone 失败返回 fail 状态", async () => {
  const r = await auditRemote({
    spec: "owner/missing",
    cloneFn: async () => { throw new Error("clone failed") },
  })
  assert.equal(r.status, "fail")
  assert.match(r.detail, /clone failed/)
})

test("auditRemote: 清理临时目录", async () => {
  let tmpSeen = null
  const r = await auditRemote({
    spec: "test/good-plugin",
    cloneFn: async (url, dest) => { tmpSeen = dest; copyDir(path.join(FIX, "good-plugin"), dest) },
  })
  assert.ok(tmpSeen)
  assert.equal(r.grade, "green")
  assert.equal(existsSync(tmpSeen), false, "临时目录应已清理")
})

test("copyDir: 跳过 symlink（防循环）", { skip: process.platform === "win32" && !process.env.CI }, () => {
  const stage = mkdtempSync(path.join(tmpdir(), "dsh-sym-"))
  const out = mkdtempSync(path.join(tmpdir(), "dsh-sym-out-"))
  try {
    copyFileSync(path.join(FIX, "good-plugin", "index.js"), path.join(stage, "real.js"))
    symlinkSync(path.join(stage, "real.js"), path.join(stage, "link.js"))
    copyDir(stage, out)
    assert.ok(existsSync(path.join(out, "real.js")))
    assert.equal(existsSync(path.join(out, "link.js")), false, "symlink 应被跳过")
  } finally {
    rmSync(stage, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
  }
})

test("auditRemote: dynamic=true 时执行隔离验证并返回 dynamic 字段", async () => {
  let dynTarget = null
  const r = await auditRemote({
    spec: "test/good-plugin",
    cloneFn: async (url, dest) => { copyDir(path.join(FIX, "good-plugin"), dest) },
    dynamic: true,
    dynamicCheckFn: async (opts) => { dynTarget = opts.target; return { status: "pass", detail: "隔离安装通过" } },
  })
  assert.ok(dynTarget, "应调用 dynamicCheckFn")
  assert.match(dynTarget, /https?:\/\//, "远程审计应传 git URL 以触发依赖解析")
  assert.equal(r.dynamic.status, "pass")
  assert.equal(r.grade, "green")
})

test("auditRemote: dynamic=false（默认）不执行隔离验证", async () => {
  let called = false
  const r = await auditRemote({
    spec: "test/good-plugin",
    cloneFn: async (url, dest) => { copyDir(path.join(FIX, "good-plugin"), dest) },
    dynamicCheckFn: async () => { called = true; return { status: "pass" } },
  })
  assert.equal(called, false, "默认不应调用 dynamicCheckFn")
  assert.equal(r.dynamic, undefined)
})

test("auditRemote: dynamic 验证失败不掩盖静态结果（fail 记入 dynamic 字段）", async () => {
  const r = await auditRemote({
    spec: "test/hook-plugin",
    cloneFn: async (url, dest) => { copyDir(path.join(FIX, "hook-plugin"), dest) },
    dynamic: true,
    dynamicCheckFn: async () => ({ status: "fail", detail: "boot 异常(exit 1)" }),
  })
  assert.equal(r.grade, "red", "静态结果仍为 red")
  assert.equal(r.dynamic.status, "fail")
})