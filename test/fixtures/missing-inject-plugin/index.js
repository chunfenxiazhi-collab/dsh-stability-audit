export const name = "missing-inject-plugin"
export function apply(ctx) {
  ctx.tools.register({
    name: "demo",
    apply: () => "ok",
  })
}
