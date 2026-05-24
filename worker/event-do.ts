// The Durable Object for one event: the single-threaded, authoritative holder
// of the event state and the WebSocket fan-out. It mutates state ONLY through
// the verified applyOp() from the shared core — the same function the browser
// runs optimistically. Family D (convergence + LWW) is what makes that safe
// without locking or operational transform.

import { initEvent, applyOp, type Event, type Participant } from "../src/domain"

// The op shapes applyOp consumes (structurally the core's internal Op union).
type Op =
  | { kind: "join"; p: Participant }
  | { kind: "setAvail"; pid: string; avail: boolean[]; at: number }

// The grid is an opaque shell blob to the server; it only reads numSlots/title.
interface Grid {
  title: string
  numSlots: number
  [k: string]: unknown
}

export class QuorumEvent {
  constructor(private ctx: DurableObjectState) {}

  private async loadGrid(): Promise<Grid | undefined> {
    return this.ctx.storage.get<Grid>("grid")
  }
  private async loadEvent(): Promise<Event | undefined> {
    return this.ctx.storage.get<Event>("event")
  }

  // Server-assigned monotonic timestamp → a consistent total order for LWW,
  // independent of client clock skew.
  private async nextClock(): Promise<number> {
    const c = (await this.ctx.storage.get<number>("clock")) ?? 0
    const next = Math.max(c + 1, Date.now())
    await this.ctx.storage.put("clock", next)
    return next
  }

  private broadcast(event: Event): void {
    const msg = JSON.stringify({ t: "state", event })
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(msg)
      } catch {
        /* socket closing */
      }
    }
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 })
    }
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1]) // hibernatable
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return
    let m: any
    try {
      m = JSON.parse(raw)
    } catch {
      return
    }

    let grid = await this.loadGrid()
    let event = await this.loadEvent()

    if (m.t === "hello") {
      if (!grid || !event) {
        // First connection may carry the grid to lazily initialize the event.
        if (m.create && m.create.grid) {
          grid = m.create.grid as Grid
          event = initEvent(crypto.randomUUID(), grid.title, grid.numSlots) // verified init
          await this.ctx.storage.put("grid", grid)
          await this.ctx.storage.put("event", event)
        } else {
          ws.send(JSON.stringify({ t: "error", error: "not_found" }))
          return
        }
      }
      ws.send(JSON.stringify({ t: "welcome", grid, event }))
      return
    }

    if (m.t === "op" && m.op && grid && event) {
      let op: Op = m.op
      // Re-stamp repaints with the server clock so LWW is a consistent total order.
      if (op.kind === "setAvail") op = { ...op, at: await this.nextClock() }
      event = applyOp(event, op) // VERIFIED transition; preserves Inv
      await this.ctx.storage.put("event", event)
      this.broadcast(event)
      return
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close()
    } catch {
      /* already closed */
    }
  }
}
