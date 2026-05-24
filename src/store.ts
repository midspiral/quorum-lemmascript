// The transport seam. Every change to an event flows through `dispatch(op)`,
// which applies it with the VERIFIED applyOp() from domain.ts. Today the store
// is local (in-memory + localStorage); a future RemoteStore (WebSocket → a
// Cloudflare Durable Object) implements the same Store interface below, so none
// of the UI changes when real sync lands.
//
// This is the ONLY module that imports applyOp. The op log it produces is
// exactly what `replay` (also verified) would fold back into the same state.

import { initEvent, applyOp, type Event, type Participant } from "./domain"
import { buildGrid, type Grid, type GridParams } from "./gridShell"

// The op shape domain.ts's applyOp consumes (structurally matches its internal
// Op union — we don't import the unexported type, we restate the shape).
export type Op =
  | { kind: "join"; p: Participant }
  | { kind: "setAvail"; pid: string; avail: boolean[]; at: number }

export interface Snapshot {
  grid: Grid
  event: Event
}

export interface Store {
  id: string
  getSnapshot(): Snapshot
  subscribe(fn: () => void): () => void
  tick(): number
  dispatch(op: Op): void
}

interface IndexEntry {
  id: string
  title: string
  createdAt: number
}

const eventKey = (id: string) => `quorum:event:${id}`
const INDEX_KEY = "quorum:index"

function shortId(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function makeParticipant(id: string, name: string, numSlots: number): Participant {
  return { id, name, avail: new Array(numSlots).fill(false), updatedAt: 0 }
}

export const opJoin = (p: Participant): Op => ({ kind: "join", p })
export const opSetAvail = (pid: string, avail: boolean[], at: number): Op => ({ kind: "setAvail", pid, avail, at })

function readIndex(): IndexEntry[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]")
  } catch {
    return []
  }
}

function writeIndex(list: IndexEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list))
}

export function listEvents(): IndexEntry[] {
  return readIndex()
}

function makeStore(id: string, initial: Snapshot): Store {
  let snap = initial
  // Monotonic logical clock for LWW timestamps (strictly increasing, so two
  // edits in the same millisecond don't collide under the LWW guard).
  let clock = 0
  for (const p of snap.event.participants) clock = Math.max(clock, p.updatedAt)
  const listeners = new Set<() => void>()
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

export function createEvent(params: GridParams): Store {
  const id = shortId()
  const grid = buildGrid(params)
  const event = initEvent(id, params.title, grid.numSlots) // verified: wellFormed, no participants
  localStorage.setItem(eventKey(id), JSON.stringify({ grid, event }))
  const index = readIndex()
  index.unshift({ id, title: params.title, createdAt: Date.now() })
  writeIndex(index.slice(0, 50))
  return makeStore(id, { grid, event })
}

export function loadStore(id: string): Store | null {
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
    return makeStore(id, snap as Snapshot)
  } catch {
    return null
  }
}
