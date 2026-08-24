// 静态稳定性扫描：分析插件目录 + 预检报告 → 风险分级（red/yellow/green）。
// 原则：只读文件、不运行被审插件（审计零副作用）。
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

const SEVERITY_RANK = { red: 2, yellow: 1, green: 0 }

// 入口文件候选（按优先级取第一个存在的）
const ENTRY_CANDIDATES = ["index.js", "index.mjs", "index.cjs", "index.ts", "plugin.js", "lib/index.js"]

// 钩子面：pre/post-execute 与中间件 = 拦截全工具链
const HOOK_RE = /(?:pre|post)-execute|ctx\.middleware\(|onToolCall|beforeTool|afterTool/
// 启动期重任务信号（入口文件内出现即提示，v1 保守）
const STARTUP_RE = /readdirSync|readFileSync\([^)]*[\.]|setInterval|bootstrap\s*\(|initIndex|walkSync/
// 事件监听计数
const EVENT_RE = /ctx\.on\(/g
// 安装脚本（非构建类 = 运行时行为不可审查）
const RISKY_SCRIPT_RE = /install|prepare|postinstall|preinstall/
const BUILD_SCRIPT_RE = /build|tsc|compile|test|lint/

function readEntry(dir) {
  for (const f of ENTRY_CANDIDATES) {
    const fp = path.join(dir, f)
    if (existsSync(fp)) {
      try { return { file: f, text: readFileSync(fp, "utf8") } } catch { return null }
    }
  }
  return null
}

export function auditPlugin({ dir, name, preflight = null, pkg = null }) {
  const pkgJson = pkg || (existsSync(path.join(dir, "package.json"))
    ? JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) : null)
  const pluginName = name || pkgJson?.name || path.basename(dir)
  const findings = []
  const entry = readEntry(dir)
  const code = entry?.text || ""

  // ① 钩子面（红）
  if (HOOK_RE.test(code)) {
    findings.push({ ruleId: "hook-surface", severity: "red",
      desc: "注册工具钩子/中间件（pre/post-execute 拦截全工具链，barricade 案例）",
      evidence: entry?.file || "?" })
  }
  // ② 启动期重任务（红）
  if (STARTUP_RE.test(code)) {
    findings.push({ ruleId: "startup-work", severity: "red",
      desc: "入口含启动期重任务（扫描/轮询/索引，codegraph bootstrap 案例）",
      evidence: entry?.file || "?" })
  }
  // ③ 事件监听过多（黄）
  const evCount = (code.match(EVENT_RE) || []).length
  if (evCount >= 10) {
    findings.push({ ruleId: "many-events", severity: "yellow",
      desc: `全局事件监听 ${evCount} 处（高频广播事件拖慢每回合）`, evidence: entry?.file || "?" })
  }
  // ④ 未声明 dsh.bundle（黄）
  if (pkgJson && !pkgJson.dsh?.bundle) {
    findings.push({ ruleId: "no-bundle", severity: "yellow",
      desc: "未声明 dsh.bundle manifest（装为普通依赖，不激活）", evidence: "package.json" })
  }
  // ⑤ 依赖过多（黄）
  const depCount = Object.keys(pkgJson?.dependencies || {}).length
  if (depCount > 50) {
    findings.push({ ruleId: "heavy-deps", severity: "yellow",
      desc: `依赖 ${depCount} 个（依赖树污染/安装膨胀风险）`, evidence: "package.json" })
  }
  // ⑥ 安装脚本非构建类（黄）
  if (pkgJson?.scripts) {
    const bad = Object.entries(pkgJson.scripts)
      .filter(([k, v]) => RISKY_SCRIPT_RE.test(k) && !BUILD_SCRIPT_RE.test(v))
    if (bad.length) {
      findings.push({ ruleId: "install-scripts", severity: "yellow",
        desc: `安装脚本非纯构建: ${bad.map(([k]) => k).join(",")}（npm 生命周期执行任意代码）`,
        evidence: "package.json" })
    }
  }
  // ⑦ 预检报告（红：critical findings）
  if (preflight) {
    const crit = collectPreflightCritical(preflight, pluginName)
    if (crit.length) {
      findings.push({ ruleId: "preflight-fail", severity: "red",
        desc: `预检 smoke 失败/未解析: ${crit[0].message?.slice(0, 80)}`,
        evidence: "dsh-preflight-report.json" })
    }
  }

  const grade = findings.some(f => f.severity === "red") ? "red"
    : findings.length ? "yellow" : "green"
  return { name: pluginName, version: pkgJson?.version || "?", grade, findings }
}

function collectPreflightCritical(preflight, pluginName) {
  const out = []
  for (const prof of preflight.profiles || []) {
    for (const pl of prof.plugins || []) {
      if (pl.plugin === pluginName) {
        for (const f of pl.findings || []) {
          if (f.severity === "critical") out.push(f)
        }
      }
    }
  }
  return out
}

// 扫描整个 profile：plugins = [{name, dir, pkg?}]；preflight 可选
export function auditProfile({ plugins, preflight = null }) {
  const results = plugins.map(p => auditPlugin({
    dir: p.dir, name: p.name, preflight, pkg: p.pkg || null,
  }))
  return { generatedAt: new Date().toISOString(), plugins: results,
    summary: {
      red: results.filter(r => r.grade === "red").length,
      yellow: results.filter(r => r.grade === "yellow").length,
      green: results.filter(r => r.grade === "green").length,
    } }
}

export { SEVERITY_RANK }