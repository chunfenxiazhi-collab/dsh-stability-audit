// 静态稳定性扫描：分析插件目录 + 预检报告 → 风险分级（red/yellow/green）。
// 原则：只读文件、不运行被审插件（审计零副作用）。
import { readFileSync, existsSync, readdirSync } from "node:fs"
import path from "node:path"

const SEVERITY_RANK = { red: 2, yellow: 1, green: 0 }
// 探测宿主同步包版本表：宿主 dsh 的 node_modules/@deepseek-ai/* 每个包的真实版本。
// 插件若声明这些包的依赖区间且不含宿主版本，pnpm 可能提升旧版导致工具层崩溃（案例 2.6 trailmap）。
export function detectHostPkgVersions() {
  const cands = [
    process.env.DSH_CLI,
    process.env.DSH_BIN,
    path.join(process.env.APPDATA || "", "Roaming", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
    path.join(process.env.APPDATA || "", "npm", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js"),
  ].filter(Boolean)
  for (const c of cands) {
    if (!c || !existsSync(c)) continue
    // bin.js 在 <pkg>/lib/bin.js → 包根 = dirname(dirname(c))
    const pkgRoot = path.join(path.dirname(c), "..")
    const scoped = path.join(pkgRoot, "node_modules", "@deepseek-ai")
    const out = {}
    // 宿主 dsh 自身版本
    try {
      const self = JSON.parse(readFileSync(path.join(pkgRoot, "package.json"), "utf8"))
      out["@deepseek-ai/dsh"] = self.version
    } catch { /* ignore */ }
    if (!existsSync(scoped)) continue
    for (const name of readDirSafe(scoped)) {
      const pp = path.join(scoped, name, "package.json")
      try {
        const p = JSON.parse(readFileSync(pp, "utf8"))
        if (p.version) out[`@deepseek-ai/${name}`] = p.version
      } catch { /* ignore */ }
    }
    if (Object.keys(out).length) return out
  }
  return null
}

function readDirSafe(dir) {
  try { return readdirSync(dir) } catch { return [] }
}


// 入口文件候选（按优先级取第一个存在的）
const ENTRY_CANDIDATES = ["index.js", "index.mjs", "index.cjs", "index.ts", "plugin.js", "lib/index.js"]

// 钩子面：pre/post-execute 与中间件 = 拦截全工具链
const HOOK_RE = /(?:pre|post)-execute|ctx\.middleware\(|onToolCall|beforeTool|afterTool/
// 启动期重任务信号：仅顶层语句（行首非空白/非注释）的同步扫描 = 启动即阻塞；
// 函数内读取与 setInterval 轮询（更新检查/心跳）是常见正常功能，不判红
const TOPLEVEL_RE = /^(?:const\s+[\w$]+\s*=\s*)?[^/\s][^\n]*?(readdirSync|walkSync|bootstrap\s*\(|initIndex)/m
const POLL_RE = /setInterval\s*\(/
// 事件监听计数
const EVENT_RE = /ctx\.on\(/g
// 安装脚本（非构建类 = 运行时行为不可审查）
const RISKY_SCRIPT_RE = /install|prepare|postinstall|preinstall/
const BUILD_SCRIPT_RE = /build|tsc|compile|test|lint|tsdown|tsup|vite|rollup|esbuild/

// v0.6: inject 缺失检测 —— ctx.<服务> 访问但未在 inject 声明（案例 2.3 doc-guard/barricade）
const INJECT_DECL_RE = /(?:export\s+)?const\s+inject\s*=\s*\[([^\]]*)\]/
// 非服务访问：ctx.on/ctx.emit/ctx.effect/ctx.middleware/ctx.scope/ctx.config/ctx.logger/ctx.router 等
// 方法/内建属性不算服务访问；这里提取所有 ctx.<ident>，再过滤已知内建
const CTX_MEMBER_RE = /\bctx\.([A-Za-z_$][A-Za-z0-9_$]*)/g
const BUILTIN_CTX = new Set([
  "on", "once", "emit", "effect", "middleware", "scope", "config", "logger",
  "router", "model", "parallel", "serial", "waterfall", "broadcast",
  "start", "stop", "dispose", "root", "isActive", "uid", "name", "app",
  "setInterval", "setTimeout", "clearInterval", "clearTimeout",
  "state", "server", "session", "inject", "loader", "runtime",
])
// 已知服务（这些是真正需要 inject 的；其余未知 ident 保守不判红，只判黄）
// apply 首层缩进（1 tab 或 2 空格）的 ctx 访问 = 加载期同步访问（启动崩溃风险）
const TOPLEVEL_CTX_RE = /^( {2}ctx\.|\tctx\.)([A-Za-z_$][A-Za-z0-9_$]*)/gm
const KNOWN_SERVICES = new Set([
  "tools", "skills", "fs", "http", "approval", "storage", "llm", "agents",
  "sessions", "sessionPersistence", "commands", "settings", "logger2",
])

function readEntry(dir) {
  for (const f of ENTRY_CANDIDATES) {
    const fp = path.join(dir, f)
    if (existsSync(fp)) {
      try { return { file: f, text: readFileSync(fp, "utf8") } } catch { return null }
    }
  }
  return null
}

// 极简 semver 匹配：支持精确/^/~ 前缀（rc 预发布按段比较）
export function semverSatisfies(version, range) {
  const norm = v => String(v).trim().replace(/^[vV]/, "")
  const parse = s => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(norm(s))
    return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || null } : null
  }
  const v = parse(version)
  if (!v) return false
  const cmp = (a, b) => {
    if (a.major !== b.major) return a.major - b.major
    if (a.minor !== b.minor) return a.minor - b.minor
    if (a.patch !== b.patch) return a.patch - b.patch
    if (!a.pre && !b.pre) return 0
    if (!a.pre) return 1  // 正式版 > 预发布
    if (!b.pre) return -1
    return a.pre < b.pre ? -1 : (a.pre > b.pre ? 1 : 0)
  }
  for (const raw of String(range).split("||").map(s => s.trim())) {
    if (!raw) continue
    const m = /^(\^|~|>=|>|<=|<|=)?\s*([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)$/.exec(raw)
    if (!m) continue // 复杂区间（x、*、空格区间）不判，保守通过
    const [, op, ver] = m
    const t = parse(ver)
    if (!t) continue
    const c = cmp(v, t)
    let ok
    switch (op || "=") {
      case "=": ok = c === 0; break
      case "^": ok = v.major === t.major && (v.major > 0 ? c >= 0 : v.minor === t.minor && c >= 0); break
      case "~": ok = v.major === t.major && v.minor === t.minor && c >= 0; break
      case ">=": ok = c >= 0; break
      case ">": ok = c > 0; break
      case "<=": ok = c <= 0; break
      case "<": ok = c < 0; break
      default: ok = c === 0
    }
    if (ok) return true
  }
  return false
}

export function auditPlugin({ dir, name, preflight = null, pkg = null, hostPkgVersions = null }) {
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
  // ② 启动期顶层重任务（红：启动即同步扫描，codegraph bootstrap 案例）
  if (TOPLEVEL_RE.test(code)) {
    findings.push({ ruleId: "startup-work", severity: "red",
      desc: "入口顶层含同步扫描/索引（启动即阻塞事件循环，codegraph bootstrap 案例）",
      evidence: entry?.file || "?" })
  }
  // ②b 轮询/定时任务（黄：更新检查/心跳常见，注意频率）
  if (POLL_RE.test(code)) {
    findings.push({ ruleId: "startup-polling", severity: "yellow",
      desc: "含 setInterval 轮询/定时任务（注意频率与生命周期）", evidence: entry?.file || "?" })
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
  // ⑦b v0.6: inject 缺失（红：加载期同步访问未声明 → 启动崩溃；黄：延迟访问未声明）
  const injected = INJECT_DECL_RE.exec(code)
  const injectList = injected
    ? injected[1].split(",").map(s => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean)
    : []
  const used = new Set()
  for (const m of code.matchAll(CTX_MEMBER_RE)) used.add(m[1])
  const missing = [...used].filter(s => KNOWN_SERVICES.has(s) && !BUILTIN_CTX.has(s) && !injectList.includes(s))
  if (missing.length) {
    // 首层缩进同步访问（apply 加载期）→ 启动崩溃风险
    const topLevel = new Set()
    for (const m of code.matchAll(TOPLEVEL_CTX_RE)) topLevel.add(m[2])
    const syncMissing = missing.filter(s => topLevel.has(s))
    if (syncMissing.length) {
      findings.push({ ruleId: "missing-inject", severity: "red",
        desc: `加载期同步访问 ${syncMissing.join(",")} 未在 inject 声明${injectList.length ? "（当前: [" + injectList.join(",") + "]）" : "（无 inject 声明）"}（启动崩溃 cannot get property without inject）`,
        evidence: entry?.file || "?" })
    } else {
      findings.push({ ruleId: "missing-inject", severity: "yellow",
        desc: `延迟访问 ${missing.join(",")} 未在 inject 声明${injectList.length ? "（当前: [" + injectList.join(",") + "]）" : "（无 inject 声明）"}（运行时可能 undefined）`,
        evidence: entry?.file || "?" })
    }
  }

  // ⑦c v0.6: main 指向未构建源码（红：加载即崩溃，案例 2.2/2.3）
  if (pkgJson?.main) {
    const mainPath = path.join(dir, pkgJson.main)
    const isTsEntry = /\.(ts|mts|cts)$/.test(pkgJson.main)
    const BUILD_ONLY_RE = /build|tsc|compile|tsdown|tsup|vite|rollup|esbuild/
    const hasBuild = pkgJson.scripts && Object.values(pkgJson.scripts).some(v => BUILD_ONLY_RE.test(v))
    if (!existsSync(mainPath) && !isTsEntry) {
      findings.push({ ruleId: "unbuilt-entry", severity: "red",
        desc: `main 指向 ${pkgJson.main} 但文件不存在`, evidence: "package.json" })
    } else if (isTsEntry && !hasBuild) {
      findings.push({ ruleId: "unbuilt-entry", severity: "red",
        desc: `main 指向 TS 源码 ${pkgJson.main} 且无构建脚本（Node 不能直接跑 .ts）`,
        evidence: "package.json" })
    }
  }

  // ⑦d v0.6: @deepseek-ai/* 依赖区间与宿主同步包版本冲突（黄：工具层全废案例 2.6）
  if (pkgJson?.dependencies && hostPkgVersions) {
    const bad = []
    for (const [dep, range] of Object.entries(pkgJson.dependencies)) {
      if (!dep.startsWith("@deepseek-ai/")) continue
      const hostVer = hostPkgVersions[dep]
      if (!hostVer) continue // 宿主无此同步包（独立版本线，不判）
      if (!semverSatisfies(hostVer, range)) bad.push(`${dep}@${range}（宿主 ${hostVer}）`)
    }
    if (bad.length) {
      findings.push({ ruleId: "dsh-dep-range", severity: "yellow",
        desc: `@deepseek-ai/* 依赖区间不含宿主同步包版本: ${bad.join(", ")}（pnpm 可能提升旧版，工具层崩溃）`,
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

// 扫描整个 profile：plugins = [{name, dir, pkg?}]；preflight 可选；
// dynamic=true 时对每个插件跑隔离安装验证（慢，建议只对黄/红跑）
export async function auditProfile({ plugins, preflight = null, dynamic = false, hostPkgVersions = null }) {
  const hostVer = hostPkgVersions || detectHostPkgVersions()
  const results = plugins.map(p => auditPlugin({
    dir: p.dir, name: p.name, preflight, pkg: p.pkg || null, hostPkgVersions: hostVer,
  }))
  if (dynamic) {
    // 动态验证：注入每个插件的 dynamic 字段（懒加载，避免循环依赖）
    for (const r of results) {
      const p = plugins.find(x => x.name === r.name)
      if (p?.dir) {
        try {
          const { dynamicCheck } = await import("./dyncheck.js")
          r.dynamic = dynamicCheck({ target: p.dir })
        } catch (e) {
          r.dynamic = { status: "skipped", detail: `动态验证不可用: ${e.message.slice(0, 60)}` }
        }
      }
    }
  }
  return { generatedAt: new Date().toISOString(), plugins: results,
    summary: {
      red: results.filter(r => r.grade === "red").length,
      yellow: results.filter(r => r.grade === "yellow").length,
      green: results.filter(r => r.grade === "green").length,
    } }
}

export { SEVERITY_RANK }