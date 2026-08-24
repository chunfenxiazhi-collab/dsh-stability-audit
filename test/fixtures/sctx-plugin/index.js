export const name = "sctx-plugin"
export function apply(ctx) {
  const sctx = ctx
  sctx.settings.register("sctx-plugin", {}, { applies: "live" })
}
