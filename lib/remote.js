// 远程插件静态审计：clone 到临时目录 → 复用 scanner 规则 → 清理。
// 零副作用：不安装、不改 profile、临时目录用完即删。
import { mkdtempSync, rmSync, copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs"
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
  if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, ""), url: `https://github.com/${m[1]}/${m[2].replace(/\.git$/, "")}.git` }
  // owner/repo
  m = /^([^\/]+)\/([^\/]+)$/.exec(s)
  if (m) return { owner: m[1], repo: m[2], url: `https://github.com/${m[1]}/${m[2]}.git` }
  return null
}

// 目录递归拷贝（规避 Node 22 Windows cpSync 中文路径栈溢出崩溃）
export function copyDir(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true })
  for (const name of readdirSync(srcDir)) {
    const s = srcDir + "/" + name
    const d = destDir + "/" + name
    if (statSync(s).isDirectory()) copyDir(s, d)
    else copyFileSync(s, d)
  }
}

// 默认 clone 实现（git 浅克隆）
export function gitClone(url, dest) {
  const r = spawnSync("git", ["clone", "--depth", "1", url, dest], { timeout: 60000, encoding: "utf8" })
  if (r.status !== 0) throw new Error(`git clone 失败: ${(r.stderr || r.stdout || "").slice(0, 120)}`)
}

// 审计一个远程插件：clone → 静态规则 → 清理
export async function auditRemote({ spec, cloneFn = null, preflight = null, hostPkgVersions = null }) {
  const parsed = parseSpec(spec)
  if (!parsed) return { status: "fail", spec, detail: `无法解析插件规格: ${spec}` }
  const stage = mkdtempSync(path.join(tmpdir(), "dsh-remote-"))
  const dest = path.join(stage, parsed.repo)
  try {
    const clone = cloneFn || gitClone
    await clone(parsed.url, dest)
    const r = auditPlugin({
      dir: dest,
      preflight,
      hostPkgVersions: hostPkgVersions || detectHostPkgVersions(),
    })
    return { ...r, spec, source: parsed.url, remote: true }
  } catch (e) {
    return { status: "fail", spec, detail: `${e.message.slice(0, 200)}` }
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
}