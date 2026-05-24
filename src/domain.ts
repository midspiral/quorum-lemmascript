//@ backend dafny

// ═══════════════════════════════════════════════════════════════
// Quorum — verified domain core (Stage 0: aggregation)
//
// A when2meet-style event is a grid of `numSlots` candidate slots and a
// list of participants, each owning a dense availability bitset over those
// slots. The verified promise of this stage: the heatmap is exactly the
// per-slot count of available participants and is bounded by the number of
// participants, and `maxCount` is the attained maximum of the heatmap.
// Everything reasons in abstract slot indices [0, numSlots); the wall-clock
// labeling of slots is a concern of the (unverified) shell.
//
// Style note: functions are pure and recursive (no imperative loops) so each
// `//@ ensures` is discharged by an inductive proof in the companion .dfy.
// ═══════════════════════════════════════════════════════════════

// ── Types ─────────────────────────────────────────────────────

interface Participant {
  id: string         // anonymous, allocated on join; identity = "this row"
  name: string
  avail: boolean[]   // length === numSlots; avail[s] === free at slot s
  updatedAt: number  // logical timestamp, for LWW convergence (Family D)
}

interface Event {
  id: string
  title: string
  numSlots: number          // = numDays * slotsPerDay; labels live in the shell
  participants: Participant[]
}

export type { Participant, Event }

// ── Well-formedness ───────────────────────────────────────────

// A1: every participant's bitset matches the grid width. The reflection
// lemma (generated from `ensures`) lets a caller holding `allAvailLen` learn
// the quantified fact that every slot in range is a valid bit access.
export function allAvailLen(ps: Participant[], n: number): boolean {
  //@ verify
  //@ decreases ps.length
  //@ ensures \result === true ==> forall(i, 0 <= i && i < ps.length ==> ps[i].avail.length === n)
  if (ps.length === 0) return true
  if (ps[0].avail.length !== n) return false
  return allAvailLen(ps.slice(1), n)
}

// The structural invariant for an event (Stage 0 scope: grid width).
export function wellFormed(e: Event): boolean {
  //@ verify
  return e.numSlots >= 0 && allAvailLen(e.participants, e.numSlots)
}

// ── Aggregation ───────────────────────────────────────────────

// The number of participants free at slot `s`. Spec-level count and the
// engine that produces it are one and the same recursive function.
export function countFree(ps: Participant[], s: number): number {
  //@ verify
  //@ requires s >= 0
  //@ requires forall(i, 0 <= i && i < ps.length ==> s < ps[i].avail.length)
  //@ decreases ps.length
  //@ ensures 0 <= \result && \result <= ps.length
  if (ps.length === 0) return 0
  const rest = countFree(ps.slice(1), s)
  return (ps[0].avail[s] ? 1 : 0) + rest
}

// Build the heatmap for the first `k` slots: a sequence of length k whose
// entry s is countFree(ps, s). Recursion on k; the count-correctness and
// boundedness are proved by induction (see .dfy).
export function heatmapUpto(ps: Participant[], n: number, k: number): number[] {
  //@ verify
  //@ requires 0 <= k && k <= n
  //@ requires forall(i, 0 <= i && i < ps.length ==> ps[i].avail.length === n)
  //@ decreases k
  //@ ensures \result.length === k
  //@ ensures forall(s, 0 <= s && s < k ==> \result[s] === countFree(ps, s))
  //@ ensures forall(s, 0 <= s && s < k ==> 0 <= \result[s] && \result[s] <= ps.length)
  if (k === 0) return []
  const prev = heatmapUpto(ps, n, k - 1)
  return [...prev, countFree(ps, k - 1)]
}

// The heatmap: per-slot count of available participants.
//   B1 length, B2 count-correctness, B3 boundedness.
export function heatmap(e: Event): number[] {
  //@ verify
  //@ requires e.numSlots >= 0
  //@ requires forall(i, 0 <= i && i < e.participants.length ==> e.participants[i].avail.length === e.numSlots)
  //@ ensures \result.length === e.numSlots
  //@ ensures forall(s, 0 <= s && s < e.numSlots ==> \result[s] === countFree(e.participants, s))
  //@ ensures forall(s, 0 <= s && s < e.numSlots ==> 0 <= \result[s] && \result[s] <= e.participants.length)
  return heatmapUpto(e.participants, e.numSlots, e.numSlots)
}

// The maximum count over a heatmap: dominates every entry, and (for a
// non-empty grid) is attained. Precondition-free so it composes inside other
// pure function bodies; heatmap counts are non-negative, so on a real heatmap
// the result is non-negative too (used via the `best > 0` guard below).
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

// Pointwise "is this count the best?" mask over a heatmap `h`, given the
// precomputed maximum `best`. The `best > 0` guard means: when nobody has
// entered any availability (best === 0), no slot is flagged — there is no
// recommendation to make (property B5).
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
// the maximum is positive (B4 characterization, exactly, over the live model).
// Returning a mask of length numSlots (rather than an index list) sidesteps
// set-membership reasoning and is what the grid UI highlights directly.
export function isBest(e: Event): boolean[] {
  //@ verify
  //@ requires e.numSlots >= 0
  //@ requires forall(i, 0 <= i && i < e.participants.length ==> e.participants[i].avail.length === e.numSlots)
  //@ ensures heatmap(e).length === e.numSlots
  //@ ensures \result.length === e.numSlots
  //@ ensures forall(s, 0 <= s && s < e.numSlots ==> \result[s] === (heatmap(e)[s] === maxCount(heatmap(e)) && maxCount(heatmap(e)) > 0))
  const h = heatmap(e)
  const best = maxCount(h)
  return isBestList(h, best)
}

// Pointwise threshold mask over a heatmap: entry s is true iff at least `k`
// participants are free at slot s.
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
  //@ requires forall(i, 0 <= i && i < e.participants.length ==> e.participants[i].avail.length === e.numSlots)
  //@ ensures heatmap(e).length === e.numSlots
  //@ ensures \result.length === e.numSlots
  //@ ensures forall(s, 0 <= s && s < e.numSlots ==> \result[s] === (heatmap(e)[s] >= k))
  return atLeastList(heatmap(e), k)
}
