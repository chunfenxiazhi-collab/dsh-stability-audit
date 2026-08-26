// profile 级 pnpm-lock.yaml 深度扫描（v0.12：依赖树健康）。
// 行业背景：event-stream 事件证明依赖链投毒真实存在——lock 里的传递依赖
// 是"顶层看不到"的风险面。离线扫描（读 lock，不联网）。
import { readFileSync, existsSync } from "node:fs"

// 解析 pnpm-lock.yaml 的 packages 区（lockfileVersion 9.x）
// 返回 { total, hasBins: [], aiVersions: {name: [versions]} }
export function scanLockfile(lockPath) {
  if (!existsSync(lockPath)) return null
  let text
  try { text = readFileSync(lockPath, "utf8") } catch { return null }
  const packagesIdx = text.indexOf("packages:")
  if (packagesIdx < 0) return null
  const body = text.slice(packagesIdx + 9)
  const lines = body.split("\n")
  // 包条目行：恰好两空格 + 名字 + 冒号（4 空格子项排除）
  const pkgs = lines
    .filter(l => /^  [^ ]/.test(l) && !/^    /.test(l))
    .map(l => l.trim().replace(/^'|'$/g, "").replace(/:$/, ""))
    .filter(n => n && !n.includes(" "))
  if (!pkgs.length) return null
  // hasBin：每个包条目到下一个包条目之间的块内含 hasBin: true
  const hasBins = []
  const entryIdx = []
  lines.forEach((l, i) => { if (/^  [^ ]/.test(l) && !/^    /.test(l)) entryIdx.push(i) })
  for (let i = 0; i < entryIdx.length; i++) {
    const start = entryIdx[i]
    const end = i + 1 < entryIdx.length ? entryIdx[i + 1] : lines.length
    const block = lines.slice(start, end).join("\n")
    const name = lines[start].trim().replace(/^'|'$/g, "").replace(/:$/, "").replace(/'$/, "")
    if (/hasBin: true/.test(block) && !name.includes(" ")) hasBins.push(name)
  }
  // @deepseek-ai/* 版本（name@version；清理尾引号）
  const aiVersions = {}
  for (const p of pkgs) {
    if (!p.startsWith("@deepseek-ai/")) continue
    const clean = p.replace(/'$/, "")
    const at = clean.lastIndexOf("@")
    const name = clean.slice(0, at)
    const ver = clean.slice(at + 1).split("(")[0]
    aiVersions[name] = aiVersions[name] || new Set()
    aiVersions[name].add(ver)
  }
  return {
    total: pkgs.length,
    hasBins,
    aiVersions: Object.fromEntries(Object.entries(aiVersions).map(([k, v]) => [k, [...v]])),
  }
}

// 与宿主版本对比 → 不一致的 @deepseek-ai 包
export function aiVersionMismatches(lockScan, hostPkgVersions = null) {
  if (!lockScan?.aiVersions || !hostPkgVersions) return []
  const out = []
  for (const [name, versions] of Object.entries(lockScan.aiVersions)) {
    const hostVer = hostPkgVersions[name]
    if (!hostVer) continue
    const hasHost = versions.some(v => v === hostVer)
    if (!hasHost) out.push({ name, lockVersions: versions, hostVersion: hostVer })
  }
  return out
}