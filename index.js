import { existsSync, readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { defineTool } from "@deepseek-ai/dsh-tools"
import { auditProfile } from "./lib/scanner.js"
import { renderReport } from "./lib/report.js"

export const name = "dsh-stability-audit"
export const inject = ["tools"]

// 收集 profile 插件目录（node_modules 优先，plugin-src 兜底）
function collectPlugins(dshHome = path.join(os.homedir(), ".dsh"), profile = "web") {
  const profileDir = path.join(dshHome, "profiles", profile)
  const pkgPath = path.join(profileDir, "package.json")
  if (!existsSync(pkgPath)) return { plugins: [], preflight: null }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
  const plugins = []
  for (const dep of Object.keys(pkg.dependencies || {})) {
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

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "stability_audit",
    description: "扫描已安装插件的稳定性风险（静态判级：钩子面/启动任务/事件监听/打包/依赖/预检），可选隔离环境动态验证，输出分级 Markdown 报告。",
    parameters: {
      dynamic: { type: "boolean", default: false, description: "对黄/红插件跑隔离安装验证（临时 DSH_HOME，~2s/插件）" },
      profile: { type: "string", default: "web", description: "要审计的 profile 名" },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute(args) {
      const { plugins, preflight } = collectPlugins(undefined, args.profile || "web")
      const audit = await auditProfile({ plugins, preflight, dynamic: !!args.dynamic })
      return renderReport(audit)
    },
  }))
}