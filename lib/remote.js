// 远程插件静态审计：clone 到临时目录 → 复用 scanner 规则 → 清理。
// 零副作用：不安装、不改 profile、临时目录用完即删。
import { mkdtempSync, rmSync, copyFileSync, mkdirSync, readdirSync, lstatSync, readFileSync, writeFileSync } from "node:fs"
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

// FIX-3 (2026-08-31 battle-test): 检查 npm 发布包是否含入口构建产物（git 源未构建 ≠ npm 未构建，
// filesnap 案例）。返回 { exists, version } 或 null（无包/网络失败——不改变结论）。
// 可注入（测试用）；默认实现查 npm registry + 下载 tarball 检查 package/<entry>。
export const defaultNpmArtifactCheck = async (name, entry) => {
  if (!name || !entry) return null
  let tmp = null
  try {
    const regUrl = 'https://registry.npmjs.org/' + encodeURIComponent(name)
    const reg = await fetch(regUrl, { signal: AbortSignal.timeout(20000) })
    if (!reg.ok) return null
    const j = await reg.json()
    const latest = j['dist-tags']?.latest
    const tarball = latest && j.versions?.[latest]?.dist?.tarball
    if (!tarball) return null
    tmp = mkdtempSync(path.join(tmpdir(), 'dsh-npmck-'))
    const tgz = path.join(tmp, 'pkg.tgz')
    const dl = await fetch(tarball, { signal: AbortSignal.timeout(30000) })
    if (!dl.ok) return null
    writeFileSync(tgz, Buffer.from(await dl.arrayBuffer()))
    const norm = entry.replace(/^\.\//, '')
    const list = spawnSync('tar', ['-tf', tgz], { timeout: 20000, encoding: 'utf8' })
    if (list.status !== 0) return null
    const want = 'package/' + norm
    const has = list.stdout.split(/\r?\n/).some(l => l.trim() === want)
    return { exists: has, version: latest }
  } catch { return null }
  finally { if (tmp) { try { rmSync(tmp, { recursive: true, force: true }) } catch { /* 忽略 */ } } }
}

// 审计一个远程插件：clone → 静态规则 → （可选）隔离安装验证 → 清理
// dynamic=true 时对 clone 目录执行 dyncheck（临时 DSH_HOME 隔离安装 + headless 冒烟）。
// dynamicCheckFn / npmArtifactCheckFn 可注入（测试用），默认用真实实现。
export async function auditRemote({ spec, cloneFn = null, preflight = null, hostPkgVersions = null, dynamic = false, dynamicCheckFn = null, npmArtifactCheckFn = null }) {
  const parsed = parseSpec(spec)
  if (!parsed) return { status: "fail", spec, detail: `Cannot parse plugin spec: ${spec}` }
  const stage = mkdtempSync(path.join(tmpdir(), "dsh-remote-"))
  const dest = path.join(stage, parsed.repo)
  try {
    const clone = cloneFn || gitClone
    await clone(parsed.url, dest)
    // 取被测 commit + 发布新鲜度（dependency-scout 洞察：<24h 是投毒窗口）
    let sourceCommit = null
    let freshness = null
    let dormancy = null
    try {
      sourceCommit = spawnSync("git", ["-C", dest, "rev-parse", "--short", "HEAD"], { timeout: 15000, encoding: "utf8" }).stdout?.trim() || null
      // 最近提交时间（commit 时间戳，秒）
      const ts = spawnSync("git", ["-C", dest, "log", "-1", "--format=%ct"], { timeout: 15000, encoding: "utf8" }).stdout?.trim()
      if (ts && sourceCommit) {
        const ageHours = Math.max(0, (Date.now() / 1000 - Number(ts)) / 3600) // 负值（时钟偏移）钳到 0
        freshness = {
          ageHours: Math.round(ageHours * 10) / 10,
          level: ageHours < 24 ? "very-fresh" : ageHours < 7 * 24 ? "recent" : "stable",
          hint: ageHours < 24 ? "release <24h old (supply-chain attack window - verify carefully)" : null,
        }
        // 停更检测（dependency-scout zombie 洞察）：>180 天无提交 = 休眠
        dormancy = ageHours > 180 * 24
          ? { dormant: true, lastCommitHours: Math.round(ageHours), hint: "no commits in >180 days (dormant - may be abandoned)" }
          : { dormant: false, lastCommitHours: Math.round(ageHours) }
      }
    } catch { /* cloneFn 注入的临时目录可能无 git 历史 */ }
    const r = auditPlugin({
      dir: dest,
      preflight,
      hostPkgVersions: hostPkgVersions || detectHostPkgVersions(),
    })
    // FIX-3: unbuilt-entry 与 npm 发布产物对照（git 源未构建 ≠ npm 未构建，filesnap 案例）
    // 仅命中 unbuilt-entry 时触发；npmArtifactCheckFn 返回 null（无包/网络失败）→ 保持原判
    const unbuilt = (r.findings || []).find(f => f.ruleId === "unbuilt-entry")
    if (unbuilt) {
      const check = npmArtifactCheckFn || defaultNpmArtifactCheck
      try {
        const pkgName = (() => {
          try { return JSON.parse(readFileSync(path.join(dest, "package.json"), "utf8")).name } catch { return null }
        })()
        const artifact = await check(pkgName, unbuilt.entryPath || null)
        if (artifact && artifact.exists) {
          unbuilt.severity = "yellow"
          unbuilt.desc = unbuilt.desc + " (git source lacks build artifacts; npm package " + artifact.version + " has them)"
          // 降级后重算 grade（auditPlugin 的 grade 在降级前已算好）
          r.grade = r.findings.some(f => f.severity === "red") ? "red"
            : r.findings.length ? "yellow" : "green"
        }
      } catch { /* 审计通道失败不改变结论 */ }
    }
    // 补 dependencies（--online 漏洞查询用）
    let dependencies = null
    try {
      const pkg = JSON.parse(readFileSync(path.join(dest, "package.json"), "utf8"))
      dependencies = pkg.dependencies || null
    } catch { /* 无 package.json */ }
    const out = { ...r, spec, source: parsed.url, remote: true, sourceCommit, freshness, dormancy, dependencies }
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