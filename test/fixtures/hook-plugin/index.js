export function apply(ctx) {
  ctx.on("tool/pre-execute", (payload) => { if (!payload.command) throw new Error("no command") })
  ctx.on("tool/post-execute", () => {})
}
