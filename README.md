# dsh-stability-audit

Scan installed DeepSeek Harness (dsh) plugins and grade their **stability risk** before they break your harness — static analysis of the code you already installed, plus optional **isolated install verification** (temporary DSH_HOME, zero contact with your real profile).

> Community plugins are often young projects. This plugin answers one question: **will installing/keeping this plugin hurt my dsh?** It grades each installed plugin red/yellow/green with evidence, so you decide with facts, not vibes.

## Why

- A single plugin can take down the **entire tool layer** (hook surface — the barricade incident)
- A startup scan can **freeze the event loop** for minutes on large workspaces (the codegraph incident)
- Broken plugin configs make dsh **half-activate** plugins silently (preflight failures)
- Version conflicts in @deepseek-ai/* dependencies can **kill the whole tool pipeline**

These are the real failure modes this plugin detects — statically, before they bite.

## Install

```sh
dsh plugin --profile web add github:chunfenxiazhi-collab/dsh-stability-audit
```

Then restart dsh web. The `stability_audit` tool becomes available to the agent (ask it to run it), or use the CLI:

```sh
git clone https://github.com/chunfenxiazhi-collab/dsh-stability-audit.git
cd dsh-stability-audit && npm test
node cli.mjs            # scan the real web profile
node cli.mjs --dynamic  # also run isolated install verification (~2s per plugin)
```

## Grading dimensions

| Signal | Grade | Evidence |
|---|---|---|
| Tool hook / middleware registration (pre/post-execute) | red | can intercept the entire tool chain (barricade) |
| Top-level sync scan / indexing at startup | red | blocks the event loop (codegraph) |
| setInterval polling | yellow | normal for update checks; watch frequency |
| >=10 global event listeners | yellow | every broadcast event gets slower |
| No dsh.bundle manifest | yellow | installed but never activated (research-plugins) |
| >50 dependencies | yellow | dependency-tree pollution risk |
| Non-build install scripts (prepare etc.) | yellow | npm lifecycle runs arbitrary code |
| Preflight critical findings | red | dsh already flagged it at boot |
| load-time sync service access missing from inject | red | boot crash (doc-guard/barricade incidents) |
| deferred service access missing from inject | yellow | may be undefined at runtime (cron-style) |
| main points to unbuilt source (TS/missing file) | red | load-time crash (7 unbuilt plugins) |
| @deepseek-ai/* range excludes host synced pkg version | yellow | pnpm hoists old build -> tools dead (trailmap) |
| **Isolated install + boot smoke** | pass/fail | temp DSH_HOME, dsh plugin add, headless boot, no loader errors |

## How it works

1. Collect plugins from ~/.dsh/profiles/<name>/package.json (node_modules + plugin-src)
2. Static scan: entry file + package.json signals (regex-based, zero dependencies, no AST)
3. Optional dynamic check (lib/dyncheck.js): temp DSH_HOME -> isolated dsh plugin add -> headless boot -> loader-error scan -> cleanup
4. Render a Markdown report with per-plugin findings, evidence files, and recommended action

**Principles**: read-only, never runs the audited plugin, zero side effects. Grades are *suggestions for human confirmation*, not verdicts.

## Limitations (honest)

- Static analysis cannot measure runtime behavior (hook errors, real freeze duration) — red means "check this", not "this is broken"
- Isolated boot uses the headless profile: plugins depending on web-only services (e.g. storageDomain) show fail in isolation but may work fine in web — treat as an environment-dependency hint
- Runtime probes (event-loop latency, hook timing) are the v2 roadmap

## License

MIT (c) 2026 chunfenxiazhi

## Contributing

Issues and PRs welcome. Tests: npm test (node:test, zero dependencies).