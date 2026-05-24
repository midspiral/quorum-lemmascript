// The transport seam. Every change to an event flows through `dispatch(op)`,
// which applies it with the VERIFIED applyOp() from domain.ts. Today the store
// is local (in-memory + localStorage); a future RemoteStore (WebSocket → a
// Cloudflare Durable Object) implements the same {getSnapshot, subscribe,
// dispatch} interface, so none of the UI changes when real sync lands.
//
// This is the ONLY module that imports applyOp. The op log it produces is
// exactly what `replay` (also verified) would fold back into the same state.

import { initEvent, applyOp } from "./domain"
import { buildGrid } from "./gridShell"

const eventKey = (id) => `quorum:event:${id}`
const INDEX_KEY = "quorum:index"

function shortId() {
  return Math.random().toString(36).slice(2, 8)
}

export function makeParticipant(id, name, numSlots) {
  return { id, name, avail: new Array(numSlots).fill(false), updatedAt: 0 }
}

// Op builders (the shapes domain.ts's applyOp consumes).
export const opJoin = (p) => ({ kind: "join", p })
export const opSetAvail = (pid, avail, at) => ({ kind: "setAvail", pid, avail, at })

function readIndex() {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]")
  } catch {
    return []
  }
}

function writeIndex(list) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list))
}

export function listEvents() {
  return readIndex()
}

function makeStore(id, initial) {
  let snap = initial // { grid, event }
  // Monotonic logical clock for LWW timestamps (strictly increasing, so two
  // edits in the same millisecond don't collide under the LWW guard).
  let clock = 0
  for (const p of snap.event.participants) clock = Math.max(clock, p.updatedAt)
  const listeners = new Set()
  const persist = () => localStorage.setItem(eventKey(id), JSON.stringify(snap))

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
      snap = { grid: snap.grid, event: applyOp(snap.event, op) }
      persist()
      for (const fn of listeners) fn()
    },
  }
}

export function createEvent(params) {
  const id = shortId()
  const grid = buildGrid(params)
  const event = initEvent(id, params.title, grid.numSlots) // verified: wellFormed, no participants
  localStorage.setItem(eventKey(id), JSON.stringify({ grid, event }))
  const index = readIndex()
  index.unshift({ id, title: params.title, createdAt: Date.now() })
  writeIndex(index.slice(0, 50))
  return makeStore(id, { grid, event })
}

export function loadStore(id) {
  const raw = localStorage.getItem(eventKey(id))
  if (!raw) return null
  try {
    const snap = JSON.parse(raw)
    if (!snap || !snap.grid || !snap.event) return null
    // Migrate pre-"cols" events (grid had `dates` only).
    if (snap.grid.dates && !snap.grid.cols) {
      snap.grid.cols = snap.grid.dates
      snap.grid.kind = "dates"
    }
    return makeStore(id, snap)
  } catch {
    return null
  }
}
