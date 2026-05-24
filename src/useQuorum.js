// The view's window onto a store. All scheduling math comes from the verified
// domain.ts here — heatmap, isBest, availableAtLeast, maxCount — so components
// only render; they never count, rank, or threshold themselves.

import { useSyncExternalStore, useMemo } from "react"
import { heatmap, isBest, availableAtLeast, maxCount } from "./domain"
import { opJoin, opSetAvail, makeParticipant } from "./store"

export function useQuorum(store) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { grid, event } = snap

  const hm = useMemo(() => heatmap(event), [event])
  const best = useMemo(() => isBest(event), [event])
  const peak = useMemo(() => maxCount(hm), [hm])

  const actions = useMemo(
    () => ({
      join(name) {
        const pid = `p-${store.tick()}-${Math.random().toString(36).slice(2, 6)}`
        store.dispatch(opJoin(makeParticipant(pid, name, grid.numSlots)))
        return pid
      },
      // Paint the live row of `pid` (read fresh from the store so fast drags
      // never act on a stale closure), flipping `slot` to `value`.
      setCell(pid, slot, value) {
        const ev = store.getSnapshot().event
        const p = ev.participants.find((x) => x.id === pid)
        if (!p || p.avail[slot] === value) return
        const row = p.avail.slice()
        row[slot] = value
        store.dispatch(opSetAvail(pid, row, store.tick()))
      },
    }),
    [store, grid.numSlots],
  )

  return { grid, event, heatmap: hm, best, peak, atLeast: (k) => availableAtLeast(event, k), actions }
}
