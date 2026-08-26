// OSV 漏洞库查询（D1：--online 模式，零依赖）。
// 行业参考：dependency-scout 用 OSV+NVD 双库；我们用 OSV（免费、无 key、批量查询）。
// 查询：POST https://api.osv.dev/v1/querybatch
import { spawnSync } from "node:child_process"

const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"
const TIMEOUT_MS = 30000

// 批量查询依赖漏洞：packages = [{ name, ecosystem }]（ecosystem 如 npm/pypi）
// 返回 [{ name, vulns: [{id, severity, summary}] }]
export async function queryOSV(packages, { fetchFn = null } = {}) {
  if (!packages?.length) return []
  const queries = packages.map(p => ({
    package: { name: p.name, ecosystem: p.ecosystem || "npm" },
  }))
  const doFetch = fetchFn || ((url, opts) => {
    // 零依赖：用 node:child_process 调 curl 或 node -e fetch？——直接用全局 fetch（Node 18+ 有）
    return globalThis.fetch(url, opts)
  })
  try {
    const resp = await doFetch(OSV_BATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!resp.ok) return []
    const data = await resp.json()
    return parseOsvResponse(data)
  } catch {
    return [] // 网络失败静默降级（保持离线可用性优先）
  }
}

// 解析 OSV querybatch 响应 → [{id, modified}]（querybatch 精简响应只有 id+modified；
// summary/severity 需单条完整查询——保留 id 供用户检索）
export function parseOsvResponse(data) {
  const results = data?.results
  if (!Array.isArray(results)) return []
  const out = []
  for (const r of results) {
    const vulns = r?.vulns || []
    for (const v of vulns) {
      out.push({
        id: v.id || "unknown",
        modified: v.modified || null,
      })
    }
  }
  return out
}