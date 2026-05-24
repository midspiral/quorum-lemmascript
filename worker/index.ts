// The Worker entry. Static assets (the built SPA) are served by the [assets]
// binding; this fetch handler only sees /api/* — it routes a WebSocket upgrade
// to the per-event Durable Object (one DO per short code).

import { QuorumEvent } from "./event-do"

export { QuorumEvent }

interface Env {
  EVENT: DurableObjectNamespace
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const m = url.pathname.match(/^\/api\/events\/([^/]+)\/ws$/)
    if (m) {
      if (req.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 })
      }
      const stub = env.EVENT.get(env.EVENT.idFromName(decodeURIComponent(m[1])))
      return stub.fetch(req)
    }
    return new Response("not found", { status: 404 })
  },
}
