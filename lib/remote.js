// 远程插件静态审计：clone 到临时目录 → 复用 scanner 规则 → 清理。
// 零副作用：不安装、不改 profile、临时目录用完即删。
import { mkdtempSync, rmSync, copyFileSync, mkdirSync, readdirSync, lstatSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { auditPlugin, detectHostPkgVersions } from "./scanner.js"

// 解析插件规格：owner/repo、github:owner/repo、完整 https URL
export function parseSpec(spec) {
  if (!spec || typeof spec !== "string") return null
  let s = spec.trim()
  if (s.startsWith("github:")) s = s.slice("github:".length)
  // https://github.com/owner/repo(.git)
  let m = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?$/.exec(s)
  if (m) return { owner: m[1], repo: m[2], url: `https://github.com/${m[1]}/${m[2]}.git` }
  // owner/repo（剥尾部 .git）
  m = /^([^\/]+)\/([^\/]+?)(?:\.git)?$/.exec(s)
  if (m) return { owner: m[1], repo: m[2], url: `https://github.com/${m[1]}/${m[2]}.git` }
  return null
}

// 目录递归拷贝（规避 Node 22 Windows cpSync 中文路径栈溢出崩溃）
export function copyDir(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true })
  for (const name of readdirSync(srcDir)) {
    const s = srcDir + "/" + name
    const d = destDir + "/" + name
    const st = lstatSync(s)
    if (st.isSymbolicLink()) continue // 跳过 symlink（防循环，审计不需要链接目标）
    if (st.isDirectory()) copyDir(s, d)
    else copyFileSync(s, d)
  }
}

// 默认 clone 实现（git 浅克隆）
export function gitClone(url, dest) {
  const r = spawnSync("git", ["clone", "--depth", "1", url, dest], { timeout: 120000, encoding: "utf8" })
  if (r.status !== 0) throw new Error(`git clone failed: ${(r.stderr || r.stdout || "").slice(0, 120)}`)
}

// 审计一个远程插件：clone → 静态规则 → （可选）隔离安装验证 → 清理
// dynamic=true 时对 clone 目录执行 dyncheck（临时 DSH_HOME 隔离安装 + headless 冒烟）。
// dynamicCheckFn 可注入（测试用），默认用真实 dyncheck。
export async function auditRemote({ spec, cloneFn = null, preflight = null, hostPkgVersions = null, dynamic = false, dynamicCheckFn = null }) {
  const parsed = parseSpec(spec)
  if (!parsed) return { status: "fail", spec, detail: `Cannot parse plugin spec: ${spec}` }
  const stage = mkdtempSync(path.join(tmpdir(), "dsh-remote-"))
  const dest = path.join(stage, parsed.repo)
  try {
    const clone = cloneFn || gitClone
    await clone(parsed.url, dest)
    // 取被测 commit（数据新鲜度标注；git 不可用时降级）
    let sourceCommit = null
    try {
      sourceCommit = spawnSync("git", ["-C", dest, "rev-parse", "--short", "HEAD"], { timeout: 15000, encoding: "utf8" }).stdout?.trim() || null
    } catch { /* cloneFn 注入的临时目录可能无 git 历史 */ }
    const r = auditPlugin({
      dir: dest,
      preflight,
      hostPkgVersions: hostPkgVersions || detectHostPkgVersions(),
    })
    const out = { ...r, spec, source: parsed.url, remote: true, sourceCommit }
    if (dynamic) {
      const fn = dynamicCheckFn || (await import("./dyncheck.js")).dynamicCheck
      try {
        out.dynamic = await fn({ target: parsed.url }) // git URL 触发依赖解析（本地目录 add 不装依赖）
      } catch (e) {
        out.dynamic = { status: "fail", detail: `Dynamic verification error: ${e.message.slice(0, 120)}` }
      }
    }
    return out
  } catch (e) {
    return { status: "fail", spec, detail: `${e.message.slice(0, 200)}` }
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}