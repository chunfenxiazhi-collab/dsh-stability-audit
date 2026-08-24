// 收集 profile 插件目录（node_modules 优先，plugin-src 兜底）+ 预检报告
import { existsSync, readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

export function dshHomeOf() {
  return process.env.DSH_HOME || path.join(os.homedir(), ".dsh")
}

export function collectPlugins(dshHome = dshHomeOf(), profile = "web") {
  const profileDir = path.join(dshHome, "profiles", profile)
  const pkgPath = path.join(profileDir, "package.json")
  if (!existsSync(pkgPath)) return { plugins: [], preflight: null }
  let pkg
  try { pkg = JSON.parse(readFileSync(pkgPath, "utf8")) } catch { return { plugins: [], preflight: null } }
  const plugins = []
  const seen = new Set()
  for (const dep of Object.keys(pkg.dependencies || {})) {
    if (seen.has(dep)) continue
    seen.add(dep)
    const nm = path.join(profileDir, "node_modules", dep)
    const src = path.join(dshHome, "plugin-src", dep)
    const dir = existsSync(nm) ? nm : (existsSync(src) ? src : null)
    if (dir) plugins.push({ dir, name: dep })
  }
  let preflight = null
  const pf = path.join(dshHome, "dsh-preflight-report.json")
  if (existsSync(pf)) {
    try { preflight = JSON.parse(readFileSync(pf, "utf8")) } catch { /* ignore */ }
  }
  return { plugins, preflight }
}