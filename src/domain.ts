//@ backend dafny

// ═══════════════════════════════════════════════════════════════
// Quorum — verified domain core
//
// A when2meet-style event is a grid of `numSlots` candidate slots and a
// list of participants, each owning a dense availability bitset over those
// slots. Verified so far:
//   Stage 0 — aggregation: the heatmap is exactly the per-slot count of
//     available participants and is bounded by #participants; `maxCount` is
//     the attained max; `isBest`/`availableAtLeast` characterize the
//     recommendation and the quorum-threshold query.
//   Stage 2 — convergence (Family D): `countFree` is a homomorphism from
//     participant-list concatenation to integer addition, so every heatmap
//     cell is independent of the order participant batches arrive in. This is
//     the formal justification for "no login, no locking, just merge".
//
// Everything reasons in abstract slot indices [0, numSlots); the wall-clock
// labeling of slots is a concern of the (unverified) shell.
//
// Style: functions are pure and recursive (no imperative loops), and the
// counting core is TOTAL (precondition-free) so it composes freely; each
// `//@ ensures` is discharged by an inductive proof in the companion .dfy.
// ═══════════════════════════════════════════════════════════════

// ── Types ─────────────────────────────────────────────────────

interface Participant {
  id: string         // anonymous, allocated on join; identity = "this row"
  name: string
  avail: boolean[]   // length === numSlots on a well-formed event; avail[s] === free at s
  updatedAt: number  // logical timestamp, for LWW convergence (Family D, later)
}

interface Event {
  id: string
  title: string
  numSlots: number          // = numDays * slotsPerDay; labels live in the shell
  participants: Participant[]
}

export type { Participant, Event }

// ── Well-formedness (model invariant) ─────────────────────────

// A1: every participant's bitset matches the grid width. The reflection lemma
// (generated from `ensures`) lets a caller holding `allAvailLen` recover the
// quantified fact. Aggregation no longer needs it (countFree is total), but
// the mutations (Stage 0b) preserve it as the intended event shape.
export function allAvailLen(ps: Participant[], n: number): boolean {
  //@ verify
  //@ decreases ps.length
  //@ ensures \result === true ==> forall(i, 0 <= i && i < ps.length ==> ps[i].avail.length === n)
  if (ps.length === 0) return true
  if (ps[0].avail.length !== n) return false
  return allAvailLen(ps.slice(1), n)
}

export function wellFormed(e: Event): boolean {
  //@ verify
  return e.numSlots >= 0 && allAvailLen(e.participants, e.numSlots)
}

// ── Aggregation ───────────────────────────────────────────────

// "Is participant p free at slot s?" — TOTAL: out-of-range slots are not free.
// On a well-formed event (A1) and s in [0, numSlots) this is just p.avail[s].
export function freeAt(p: Participant, s: number): boolean {
  //@ verify
  if (s < 0) return false
  if (s >= p.avail.length) return false
  return p.avail[s]
}

// The number of participants free at slot `s`. Precondition-free recursive
// count; spec-level count and the engine that produces it are the same fn.
export function countFree(ps: Participant[], s: number): number {
  //@ verify
  //@ decreases ps.length
  //@ ensures 0 <= \result && \result <= ps.length
  if (ps.length === 0) return 0
  const rest = countFree(ps.slice(1), s)
  return (freeAt(ps[0], s) ? 1 : 0) + rest
}

// Build the heatmap for the first `k` slots: entry s is countFree(ps, s).
export function heatmapUpto(ps: Participant[], k: number): number[] {
  //@ verify
  //@ requires 0 <= k
  //@ decreases k
  //@ ensures \result.length === k
  //@ ensures forall(s, 0 <= s && s < k ==> \result[s] === countFree(ps, s))
  //@ ensures forall(s, 0 <= s && s < k ==> 0 <= \result[s] && \result[s] <= ps.length)
  if (k === 0) return []
  const prev = heatmapUpto(ps, k - 1)
  return [...prev, countFree(ps, k - 1)]
}

// The heatmap: per-slot count of available participants.
//   B1 length, B2 count-correctness, B3 boundedness.
export function heatmap(e: Event): number[] {
  //@ verify
  //@ requires e.numSlots >= 0
  //@ ensures \result.length === e.numSlots
  //@ ensures forall(s, 0 <= s && s < e.numSlots ==> \result[s] === countFree(e.participants, s))
  //@ ensures forall(s, 0 <= s && s < e.numSlots ==> 0 <= \result[s] && \result[s] <= e.participants.length)
  return heatmapUpto(e.participants, e.numSlots)
}

// The maximum count over a heatmap: dominates every entry, and (for a
// non-empty grid) is attained. Precondition-free, and NOT floored at 0 (the
// max of a non-empty list is an actual element; maxCount([-5]) === 0 would
// break attainment). On a real heatmap every entry is >= 0, so the result is.
export function maxCount(h: number[]): number {
  //@ verify
  //@ decreases h.length
  //@ ensures forall(s, 0 <= s && s < h.length ==> h[s] <= \result)
  //@ ensures h.length > 0 ==> exists(s, 0 <= s && s < h.length && h[s] === \result)
  if (h.length === 0) return 0
  if (h.length === 1) return h[0]
  const rest = maxCount(h.slice(1))
  return h[0] > rest ? h[0] : rest
}

// ── Best slots & threshold queries ────────────────────────────

// Pointwise "is this count the best?" mask given the precomputed max `best`.
// The `best > 0` guard means: when nobody has entered any availability, no
// slot is flagged (property B5).
export function isBestList(h: number[], best: number): boolean[] {
  //@ verify
  //@ decreases h.length
  //@ ensures \result.length === h.length
  //@ ensures forall(s, 0 <= s && s < h.length ==> \result[s] === (h[s] === best && best > 0))
  if (h.length === 0) return []
  const rest = isBestList(h.slice(1), best)
  return [h[0] === best && best > 0, ...rest]
}

// The recommendation mask: slot s is "best" iff its count ties the maximum and
// the maximum is positive (B4, exactly, over the live model). A mask (rather
// than an index list) sidesteps set-membership reasoning and is what the grid
// highlights directly.
export function isBest(e: Event): boolean[] {
  //@ verify
  //@ requires e.numSlots >= 0
  //@ ensures heatmap(e).length === e.numSlots
  //@ ensures \result.length === e.numSlots
  //@ ensures forall(s, 0 <= s && s < e.numSlots ==> \result[s] === (heatmap(e)[s] === maxCount(heatmap(e)) && maxCount(heatmap(e)) > 0))
  const h = heatmap(e)
  const best = maxCount(h)
  return isBestList(h, best)
}

// Pointwise threshold mask: entry s is true iff at least `k` participants free.
export function atLeastList(h: number[], k: number): boolean[] {
  //@ verify
  //@ decreases h.length
  //@ ensures \result.length === h.length
  //@ ensures forall(s, 0 <= s && s < h.length ==> \result[s] === (h[s] >= k))
  if (h.length === 0) return []
  const rest = atLeastList(h.slice(1), k)
  return [h[0] >= k, ...rest]
}

// "Slots where at least k people are free" — the quorum-threshold query,
// characterized exactly against the heatmap (C4).
export function availableAtLeast(e: Event, k: number): boolean[] {
  //@ verify
  //@ requires e.numSlots >= 0
  //@ ensures heatmap(e).length === e.numSlots
  //@ ensures \result.length === e.numSlots
  //@ ensures forall(s, 0 <= s && s < e.numSlots ==> \result[s] === (heatmap(e)[s] >= k))
  return atLeastList(heatmap(e), k)
}

// ── Convergence (Family D): order-independence of the heatmap ──

// countFree is a HOMOMORPHISM from participant-list concatenation to integer
// addition: counting two batches and adding equals counting the joined list.
// This is the algebraic heart of convergence — the heatmap factors through a
// commutative monoid (ℤ, +), so batch order and grouping do not matter.
// (Pure-carrier lemma: the `return true` body is irrelevant; the `ensures` is
// the theorem, proved by induction in the companion .dfy.)
export function countFreeConcat(xs: Participant[], ys: Participant[], s: number): boolean {
  //@ verify
  //@ ensures countFree(xs.concat(ys), s) === countFree(xs, s) + countFree(ys, s)
  return true
}

// Batch commutativity: two groups of participants arriving in either order
// produce the same count at every slot — a direct corollary of the
// homomorphism plus commutativity of (+).
export function countFreeComm(xs: Participant[], ys: Participant[], s: number): boolean {
  //@ verify
  //@ ensures countFree(xs.concat(ys), s) === countFree(ys.concat(xs), s)
  return true
}

// Lifted to the observable: two events that differ only by the order of two
// participant batches have identical heatmaps. This is the convergence
// guarantee the product makes — concurrent batches of responses, applied in
// any order, agree on the heatmap (and hence on isBest / availableAtLeast).
export function heatmapBatchOrderInvariant(a: Event, b: Event, xs: Participant[], ys: Participant[]): boolean {
  //@ verify
  //@ requires a.numSlots >= 0 && a.numSlots === b.numSlots
  //@ requires a.participants === xs.concat(ys)
  //@ requires b.participants === ys.concat(xs)
  //@ ensures heatmap(a).length === a.numSlots
  //@ ensures heatmap(b).length === b.numSlots
  //@ ensures forall(s, 0 <= s && s < a.numSlots ==> heatmap(a)[s] === heatmap(b)[s])
  return true
}

// ── Mutations (Stage 0b): every transition preserves the A1 invariant ──

// A fresh event has no participants, so the invariant holds vacuously.
export function initEvent(id: string, title: string, numSlots: number): Event {
  //@ verify
  //@ requires numSlots >= 0
  //@ ensures wellFormed(\result)
  //@ ensures \result.numSlots === numSlots
  return { id: id, title: title, numSlots: numSlots, participants: [] }
}

// Appending a grid-width-matching participant preserves allAvailLen (induction).
export function allAvailLenSnoc(ps: Participant[], p: Participant, n: number): boolean {
  //@ verify
  //@ requires allAvailLen(ps, n)
  //@ requires p.avail.length === n
  //@ decreases ps.length
  //@ ensures allAvailLen(ps.concat([p]), n)
  return true
}

// A participant joins by appending their row.
export function addParticipant(e: Event, p: Participant): Event {
  //@ verify
  //@ requires wellFormed(e)
  //@ requires p.avail.length === e.numSlots
  //@ ensures wellFormed(\result)
  //@ ensures \result.numSlots === e.numSlots
  return { ...e, participants: [...e.participants, p] }
}

// Replace the availability of the participant whose id === pid (others untouched).
export function setAvail(ps: Participant[], pid: string, newAvail: boolean[]): Participant[] {
  //@ verify
  //@ decreases ps.length
  //@ ensures \result.length === ps.length
  if (ps.length === 0) return []
  if (ps[0].id === pid) return [{ ...ps[0], avail: newAvail }, ...ps.slice(1)]
  return [ps[0], ...setAvail(ps.slice(1), pid, newAvail)]
}

export function setAvailPreservesLen(ps: Participant[], pid: string, newAvail: boolean[], n: number): boolean {
  //@ verify
  //@ requires allAvailLen(ps, n)
  //@ requires newAvail.length === n
  //@ decreases ps.length
  //@ ensures allAvailLen(setAvail(ps, pid, newAvail), n)
  return true
}

// A participant repaints their row; grid width is unchanged, so Inv is preserved.
export function setAvailability(e: Event, pid: string, newAvail: boolean[]): Event {
  //@ verify
  //@ requires wellFormed(e)
  //@ requires newAvail.length === e.numSlots
  //@ ensures wellFormed(\result)
  //@ ensures \result.numSlots === e.numSlots
  return { ...e, participants: setAvail(e.participants, pid, newAvail) }
}

// Remove every participant whose id === pid.
export function removeP(ps: Participant[], pid: string): Participant[] {
  //@ verify
  //@ decreases ps.length
  //@ ensures \result.length <= ps.length
  if (ps.length === 0) return []
  if (ps[0].id === pid) return removeP(ps.slice(1), pid)
  return [ps[0], ...removeP(ps.slice(1), pid)]
}

export function removePPreservesLen(ps: Participant[], pid: string, n: number): boolean {
  //@ verify
  //@ requires allAvailLen(ps, n)
  //@ decreases ps.length
  //@ ensures allAvailLen(removeP(ps, pid), n)
  return true
}

export function removeParticipant(e: Event, pid: string): Event {
  //@ verify
  //@ requires wellFormed(e)
  //@ ensures wellFormed(\result)
  //@ ensures \result.numSlots === e.numSlots
  return { ...e, participants: removeP(e.participants, pid) }
}
