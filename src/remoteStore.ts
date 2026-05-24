// RemoteStore: the Store interface backed by a Durable Object over WebSocket.
// dispatch(op) applies the op OPTIMISTICALLY with the verified applyOp (instant
// paint) and forwards it to the DO, which applies the same op authoritatively
// and broadcasts the result. Family D (convergence + LWW) guarantees the two
// agree, so there's no rollback and no operational transform.

import { applyOp, initEvent, type Event } from "./domain"
import { buildGrid, type Grid, type GridParams } from "./gridShell"
import { wsUrl } from "./config"
import {
  type Store,
  type Snapshot,
  type Op,
  eventKey,
  indexEvent,
  shortId,
  emptyEvent,
} from "./persist"

type Seed = { grid: Grid; event: Event }

function localCache(id: string): Seed | null {
  const raw = localStorage.getItem(eventKey(id))
  if (!raw) return null
  try {
    const s = JSON.parse(raw)
    return s && s.grid && s.event ? s : null
  } catch {
    return null
  }
}

function makeRemoteStore(id: string, seed: Seed | null): Store {
  // With a seed (creator, or cached) we can render immediately; a cold join
  // shows "connecting" until the DO sends the grid.
  let snap: Snapshot = seed
    ? { grid: seed.grid, event: seed.event, status: "ready" }
    : { grid: null, event: emptyEvent(), status: "connecting" }
  let clock = 0
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const fn of listeners) fn()
  }
  const cache = () => {
    if (snap.grid) localStorage.setItem(eventKey(id), JSON.stringify({ grid: snap.grid, event: snap.event }))
  }

  let ws: WebSocket | null = null
  const outbox: Op[] = []

  const connect = () => {
    let sock: WebSocket
    try {
      sock = new WebSocket(wsUrl(id))
    } catch {
      return
    }
    ws = sock
    sock.onopen = () => {
      sock.send(JSON.stringify({ t: "hello", create: seed ? { grid: seed.grid } : undefined }))
      for (const op of outbox) sock.send(JSON.stringify({ t: "op", op }))
      outbox.length = 0
    }
    sock.onmessage = (ev) => {
      let m: any
      try {
        m = JSON.parse(ev.data as string)
      } catch {
        return
      }
      if (m.t === "welcome") {
        snap = { grid: m.grid, event: m.event, status: "ready" }
        cache()
        notify()
      } else if (m.t === "state") {
        snap = { grid: snap.grid, event: m.event, status: "ready" }
        cache()
        notify()
      } else if (m.t === "error") {
        snap = { ...snap, status: "missing" }
        notify()
      }
    }
    sock.onclose = () => {
      if (ws === sock) ws = null
    }
  }
  connect()

  return {
    id,
    getSnapshot: () => snap,
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    tick() {
      clock = Math.max(clock + 1, Date.now())
      return clock
    },
    dispatch(op) {
      // optimistic: same verified transition the server will apply
      snap = { grid: snap.grid, event: applyOp(snap.event, op), status: snap.status }
      cache()
      notify()
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "op", op }))
      else outbox.push(op)
    },
  }
}

export function createRemoteEvent(params: GridParams): Store {
  const id = shortId()
  const grid = buildGrid(params)
  const event = initEvent(id, params.title, grid.numSlots)
  localStorage.setItem(eventKey(id), JSON.stringify({ grid, event }))
  indexEvent(id, params.title)
  return makeRemoteStore(id, { grid, event })
}

export function loadRemoteStore(id: string): Store {
  return makeRemoteStore(id, localCache(id))
}
