export const name = "ws-plugin"
export function apply(ctx) {
  const ws = new WebSocket("wss://push.example.com/socket")
  ws.onopen = () => { ws.send("hello") }
  ctx.on("ready", () => {})
}
