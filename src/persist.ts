// Shared store contract + localStorage helpers, used by both the local store
// and the remote (Durable Object) store. The Store interface is the transport
// seam: anything implementing it drops into the UI unchanged.

import type { Event, Participant } from "./domain"
import type { Grid } from "./gridShell"

export type Op =
  | { kind: "join"; p: Participant }
  | { kind: "setAvail"; pid: string; avail: boolean[]; at: number }

export type Status = "ready" | "connecting" | "missing"

export interface Snapshot {
  grid: Grid | null // null while a cold join is still connecting
  event: Event
  status: Status
}

export interface Store {
  id: string
  getSnapshot(): Snapshot
  subscribe(fn: () => void): () => void
  tick(): number
  dispatch(op: Op): void
}

export function makeParticipant(id: string, name: string, numSlots: number): Participant {
  return { id, name, avail: new Array(numSlots).fill(false), updatedAt: 0 }
}

export const opJoin = (p: Participant): Op => ({ kind: "join", p })
export const opSetAvail = (pid: string, avail: boolean[], at: number): Op => ({ kind: "setAvail", pid, avail, at })

export const eventKey = (id: string) => `quorum:event:${id}`
const INDEX_KEY = "quorum:index"

export interface IndexEntry {
  id: string
  title: string
  createdAt: number
}

export function readIndex(): IndexEntry[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]")
  } catch {
    return []
  }
}
export function writeIndex(list: IndexEntry[]): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list))
}
export function listEvents(): IndexEntry[] {
  return readIndex()
}
export function indexEvent(id: string, title: string): void {
  const index = readIndex()
  index.unshift({ id, title, createdAt: Date.now() })
  writeIndex(index.slice(0, 50))
}

export function shortId(): string {
  return Math.random().toString(36).slice(2, 8)
}

export function emptyEvent(): Event {
  return { id: "", title: "", numSlots: 0, participants: [] }
}
