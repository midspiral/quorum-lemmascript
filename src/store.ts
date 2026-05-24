// The local store (in-memory + localStorage) and the create/load entry points,
// which branch to the remote (Durable Object) store when the backend is on.
// dispatch() applies every change with the VERIFIED applyOp from domain.ts.

import { initEvent, applyOp, type Event } from "./domain"
import { buildGrid, type Grid, type GridParams } from "./gridShell"
import { REMOTE } from "./config"
import { createRemoteEvent, loadRemoteStore } from "./remoteStore"
import { type Store, type Snapshot, eventKey, indexEvent, shortId } from "./persist"

// Re-export the seam pieces the UI/hook import from "./store".
export { makeParticipant, opJoin, opSetAvail, listEvents } from "./persist"
export type { Store, Op } from "./persist"

function makeLocalStore(id: string, initial: { grid: Grid; event: Event }): Store {
  let snap: Snapshot = { grid: initial.grid, event: initial.event, status: "ready" }
  // Monotonic logical clock for LWW timestamps (strictly increasing).
  let clock = 0
  for (const p of snap.event.participants) clock = Math.max(clock, p.updatedAt)
  const listeners = new Set<() => void>()
  const persist = () => localStorage.setItem(eventKey(id), JSON.stringify({ grid: snap.grid, event: snap.event }))

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
      snap = { grid: snap.grid, event: applyOp(snap.event, op), status: "ready" }
      persist()
      for (const fn of listeners) fn()
    },
  }
}

export function createEvent(params: GridParams): Store {
  if (REMOTE) return createRemoteEvent(params)
  const id = shortId()
  const grid = buildGrid(params)
  const event = initEvent(id, params.title, grid.numSlots) // verified: wellFormed, no participants
  localStorage.setItem(eventKey(id), JSON.stringify({ grid, event }))
  indexEvent(id, params.title)
  return makeLocalStore(id, { grid, event })
}

export function loadStore(id: string): Store | null {
  if (REMOTE) return loadRemoteStore(id)
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
    return makeLocalStore(id, snap)
  } catch {
    return null
  }
}
