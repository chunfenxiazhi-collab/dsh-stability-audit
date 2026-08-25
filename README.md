# dsh-stability-audit (plugin stability audit)

Scan installed DeepSeek Harness (dsh) plugins and get a **stability risk grade + fix suggestion** before they break your harness — static analysis, optional isolated install verification, and machine-readable output for any agent to surface problems and remedies fast.

> Community plugins are often young projects. This plugin answers one question: **will installing/keeping this plugin hurt my dsh?** Each installed plugin gets a 🔴/🟡/🟢 grade, evidence, and a 🔧 fix suggestion, so you decide on facts, not vibes.

## Why

- One plugin can kill the **entire tool layer** (hook surface — barricade incident; dsh-tools single-instance — trailmap incident)
- Startup scans can **freeze the event loop** for minutes on big workspaces (codegraph incident)
- Bad plugin config makes dsh **silently half-activate** plugins (preflight failure)
- @deepseek-ai/* version conflicts can **kill the whole tool pipeline**
- **Every failure period pollutes active sessions** (dangling tool-calls) that need cleanup after recovery

These are the real failure modes this plugin statically detects — before you step on them.

## Install

```sh
# Option 1: npm (recommended — prebuilt, skips allowBuilds approval)
dsh plugin --profile web add dsh-stability-audit

# Option 2: GitHub source
dsh plugin --profile web add github:chunfenxiazhi-collab/dsh-stability-audit
```

After restarting dsh web, agents can call the `stability_audit` tool (just say "run the plugin stability audit"); or use the CLI:

```sh
git clone https://github.com/chunfenxiazhi-collab/dsh-stability-audit.git
cd dsh-stability-audit && npm test
node cli.mjs                    # scan the real web profile
node cli.mjs --dynamic          # also run isolated install verification (~2s/plugin)
node cli.mjs --json             # machine-readable output (for other agents)
node cli.mjs --remote owner/repo          # remote plugin static pre-audit (clone to temp dir, no install)
node cli.mjs --remote owner/repo --dynamic  # full remote pre-audit (clone + isolated install smoke)
node cli.mjs --remote owner/repo --json    # remote pre-audit JSON output
```

## Grading dimensions

| Signal | Grade | Case |
|---|---|---|
| Tool hook / middleware registration (pre/post-execute) | red | can intercept the whole tool chain (barricade) |
| Top-level sync scan / indexing at startup | red | blocks the event loop (codegraph) |
| Load-time sync service access missing from inject | red | boot crash (doc-guard/barricade incidents) |
| main points to unbuilt source (TS/missing file) | red | load-time crash (7 unbuilt plugins) |
| Preflight report critical | red | flagged by dsh at boot |
| setInterval polling | yellow | normal for update checks; watch frequency |
| >=10 global event listeners | yellow | every broadcast event gets slower |
| No dsh.bundle manifest | yellow | installed but never activated (research-plugins) |
| >50 dependencies | yellow | dependency-tree pollution risk |
| Non-build install scripts (prepare etc.) | yellow | npm lifecycle runs arbitrary code |
| Deferred service access missing from inject | yellow | may be undefined at runtime (cron-style) |
| @deepseek-ai/* range excludes host synced pkg version | yellow | pnpm hoists old build -> tools dead (trailmap) |
| **Isolated install + boot smoke** | pass/fail | temp DSH_HOME, dsh plugin add, headless boot, no loader errors |

Every hit carries a **🔧 fix suggestion** (executable command or manual action) that can be handed to the user or another agent.

## How it works

1. Collect plugins from ~/.dsh/profiles/<name>/package.json (node_modules + plugin-src)
2. Static scan: entry file + package.json signals (regex-based, zero dependencies, no AST)
3. Optional dynamic check (lib/dyncheck.js): temp DSH_HOME -> isolated dsh plugin add -> headless boot -> loader-error scan -> cleanup
4. Optional remote pre-audit (lib/remote.js): git shallow clone to temp dir -> static rules -> (optional) isolated install smoke -> cleanup
5. Render report: Markdown (human) or JSON (`--json`, schema `dsh-stability-audit/v1`, agent-readable)

**Principles**: read-only, never runs the audited plugin, zero side effects. Grades are suggestions for human confirmation, not verdicts.

## JSON output (for agents)

```sh
node cli.mjs --json
```

Per plugin: name / version / grade / source / dynamic / findings[], each finding carries `ruleId` / `severity` / `desc` / `evidence` / `fix` (remedy). Other agents can act on it directly.

## Known limitations (honest list)

- Static analysis cannot measure runtime behavior (hook throws, real stall duration) — red means "needs a look", not "definitely broken"
- Isolated boot uses a headless profile: plugins depending on web-only services (e.g. storageDomain) show ❌ in isolation but may be fine in web — treat as an environment-dependency hint
- Runtime probes (event-loop latency, hook timing) are on the v2 roadmap
- Fix suggestions are **hints, not auto-applied**: environments differ (junction/overrides fixes depend on the specific mechanism), agents should confirm before executing

## Releases

- Release flow: see [RELEASE.md](./RELEASE.md) (GitHub + npm + Release, three channels in sync)
- npm: https://www.npmjs.com/package/dsh-stability-audit
- GitHub Releases (with tarball assets): https://github.com/chunfenxiazhi-collab/dsh-stability-audit/releases

## License

MIT (c) 2026 chunfenxiazhi

## Contributing

Issues and PRs welcome. Tests: npm test (node:test, zero dependencies).

**Commit convention**: English subject line + optional Chinese body (e.g. `feat: remote plugin pre-audit`).