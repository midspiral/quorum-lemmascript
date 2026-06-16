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
  //@ contract A count between 0 and the number of participants.
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
  //@ contract The per-slot count of how many participants are free at each slot.
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
  //@ contract The largest count in the heatmap, and for a non-empty heatmap a value that some slot actually attains.
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
  //@ contract Marks exactly the slots whose free-count ties the maximum, with nothing marked until at least one participant has entered availability.
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
  //@ contract Marks exactly the slots where at least k participants are free.
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
  //@ contract Counting two participant batches separately and summing equals counting the two concatenated — the free-count is additive over concatenation.
  //@ ensures countFree(xs.concat(ys), s) === countFree(xs, s) + countFree(ys, s)
  return true
}

// Batch commutativity: two groups of participants arriving in either order
// produce the same count at every slot — a direct corollary of the
// homomorphism plus commutativity of (+).
export function countFreeComm(xs: Participant[], ys: Participant[], s: number): boolean {
  //@ verify
  //@ contract A slot's free-count is the same whether two participant batches are concatenated in one order or the other.
  //@ ensures countFree(xs.concat(ys), s) === countFree(ys.concat(xs), s)
  return true
}

// Lifted to the observable: two events that differ only by the order of two
// participant batches have identical heatmaps. This is the convergence
// guarantee the product makes — concurrent batches of responses, applied in
// any order, agree on the heatmap (and hence on isBest / availableAtLeast).
export function heatmapBatchOrderInvariant(a: Event, b: Event, xs: Participant[], ys: Participant[]): boolean {
  //@ verify
  //@ contract Two events that differ only in the order of two participant batches have identical heatmaps.
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
  //@ contract A well-formed event of the given grid width; that it starts empty is not part of the proven contract.
  //@ requires numSlots >= 0
  //@ ensures wellFormed(\result)
  //@ ensures \result.numSlots === numSlots
  return { id: id, title: title, numSlots: numSlots, participants: [] }
}

// Appending a grid-width-matching participant preserves allAvailLen (induction).
export function allAvailLenSnoc(ps: Participant[], p: Participant, n: number): boolean {
  //@ verify
  //@ contract Appending a participant whose row matches the grid width preserves the invariant that every row has the grid width.
  //@ requires allAvailLen(ps, n)
  //@ requires p.avail.length === n
  //@ decreases ps.length
  //@ ensures allAvailLen(ps.concat([p]), n)
  return true
}

// A participant joins by appending their row.
export function addParticipant(e: Event, p: Participant): Event {
  //@ verify
  //@ contract Preserves well-formedness and the grid width; the roster addition itself is not part of the proven contract.
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
  //@ contract Replacing one participant's availability keeps every row at the grid width.
  //@ requires allAvailLen(ps, n)
  //@ requires newAvail.length === n
  //@ decreases ps.length
  //@ ensures allAvailLen(setAvail(ps, pid, newAvail), n)
  return true
}

// A participant repaints their row; grid width is unchanged, so Inv is preserved.
export function setAvailability(e: Event, pid: string, newAvail: boolean[]): Event {
  //@ verify
  //@ contract Preserves well-formedness and the grid width; the row replacement itself is not part of the proven contract.
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
  //@ contract Removing a participant keeps every remaining row at the grid width.
  //@ requires allAvailLen(ps, n)
  //@ decreases ps.length
  //@ ensures allAvailLen(removeP(ps, pid), n)
  return true
}

export function removeParticipant(e: Event, pid: string): Event {
  //@ verify
  //@ contract Preserves well-formedness and the grid width; the removal itself is not part of the proven contract.
  //@ requires wellFormed(e)
  //@ ensures wellFormed(\result)
  //@ ensures \result.numSlots === e.numSlots
  return { ...e, participants: removeP(e.participants, pid) }
}

// ── Sparse availability codec (Stage 0b / E1): round-trips ─────
//
// Export uses a sparse representation — the sorted indices where a participant
// is free — instead of the dense bitset. `densify(sparsify(a)) === a` proves
// the export is faithful: decoding reconstructs the exact availability.

// Membership of index `i` in a sparse index list.
export function contains(idxs: number[], i: number): boolean {
  //@ verify
  //@ decreases idxs.length
  if (idxs.length === 0) return false
  if (idxs[0] === i) return true
  return contains(idxs.slice(1), i)
}

// Appending an index `y` adds exactly `y` to the membership set.
export function containsSnoc(xs: number[], y: number, i: number): boolean {
  //@ verify
  //@ contract Appending index y to a sparse list adds exactly y to its membership and changes nothing else.
  //@ decreases xs.length
  //@ ensures contains(xs.concat([y]), i) === (contains(xs, i) || y === i)
  return true
}

// Indices in [0, k) where `a` is true. Characterized by membership: i is in the
// result iff i is an in-range true bit of a.
export function sparsifyUpto(a: boolean[], k: number): number[] {
  //@ verify
  //@ requires 0 <= k && k <= a.length
  //@ decreases k
  //@ ensures forall(i, contains(\result, i) === (0 <= i && i < k && a[i]))
  if (k === 0) return []
  const prev = sparsifyUpto(a, k - 1)
  return a[k - 1] ? [...prev, k - 1] : prev
}

// The sparse encoding of an availability bitset: its true-indices.
export function sparsify(a: boolean[]): number[] {
  //@ verify
  //@ contract The indices at which the availability bitset is true.
  //@ ensures forall(i, contains(\result, i) === (0 <= i && i < a.length && a[i]))
  return sparsifyUpto(a, a.length)
}

// Dense bitset of length k whose bit i is set iff i is in `idxs`.
export function densifyUpto(idxs: number[], k: number): boolean[] {
  //@ verify
  //@ requires 0 <= k
  //@ decreases k
  //@ ensures \result.length === k
  //@ ensures forall(i, 0 <= i && i < k ==> \result[i] === contains(idxs, i))
  if (k === 0) return []
  const prev = densifyUpto(idxs, k - 1)
  return [...prev, contains(idxs, k - 1)]
}

// Decode a sparse index list back into a dense bitset of width `n`.
export function densify(idxs: number[], n: number): boolean[] {
  //@ verify
  //@ contract Decodes a sparse index list into a width-n bitset whose bit i is set exactly when i is in the list.
  //@ requires 0 <= n
  //@ ensures \result.length === n
  //@ ensures forall(i, 0 <= i && i < n ==> \result[i] === contains(idxs, i))
  return densifyUpto(idxs, n)
}

// E1 round-trip: densify ∘ sparsify is the identity on a bitset — the sparse
// export loses nothing.
export function sparseRoundTrip(a: boolean[]): boolean {
  //@ verify
  //@ contract Encoding an availability bitset to its sparse true-index list and decoding back reconstructs the original exactly.
  //@ ensures densify(sparsify(a), a.length).length === a.length
  //@ ensures forall(i, 0 <= i && i < a.length ==> densify(sparsify(a), a.length)[i] === a[i])
  return true
}

// ── Monotonicity (Stage 1 / Family C): more availability only helps ──

// If every participant is free at slot s, the count there is the full roster.
export function countFreeAllFree(ps: Participant[], s: number): boolean {
  //@ verify
  //@ contract If every participant is free at a slot, the free-count there equals the full roster size.
  //@ requires forall(i, 0 <= i && i < ps.length ==> freeAt(ps[i], s) === true)
  //@ decreases ps.length
  //@ ensures countFree(ps, s) === ps.length
  return true
}

// C1: a participant joining never lowers any slot's count (the count at each
// slot grows by 0 or 1). Proof: countFree(ps ++ [p]) = countFree(ps) + countFree([p]),
// and countFree([p]) >= 0.
export function heatmapMonotoneUnderJoin(e: Event, p: Participant): boolean {
  //@ verify
  //@ contract A participant joining never lowers any slot's free-count.
  //@ requires wellFormed(e)
  //@ requires p.avail.length === e.numSlots
  //@ ensures heatmap(addParticipant(e, p)).length === e.numSlots
  //@ ensures heatmap(e).length === e.numSlots
  //@ ensures forall(s, 0 <= s && s < e.numSlots ==> heatmap(addParticipant(e, p))[s] >= heatmap(e)[s])
  return true
}

// C2: if everyone is free at slot s, then s is a best slot (it attains the max,
// which is positive). freeAt is total, so the hypothesis needs no well-formedness.
export function unanimousIsBest(e: Event, s: number): boolean {
  //@ verify
  //@ contract If everyone is free at a given slot, that slot is among the recommended best slots.
  //@ requires e.numSlots >= 0
  //@ requires e.participants.length > 0
  //@ requires 0 <= s && s < e.numSlots
  //@ requires forall(i, 0 <= i && i < e.participants.length ==> freeAt(e.participants[i], s) === true)
  //@ ensures isBest(e).length === e.numSlots
  //@ ensures isBest(e)[s] === true
  return true
}

// ── LWW convergence (Stage 2b / Family D2): same-participant edits ──
//
// When two edits target the SAME participant (e.g. they reconnect and repaint
// from two devices), they're resolved last-writer-wins by timestamp. With
// distinct timestamps the row converges to the newer write regardless of the
// order the two edits are applied — the CRDT LWW-register law.

// Write one participant's row iff the incoming timestamp is strictly newer.
export function setAvailLWW(ps: Participant[], pid: string, avail: boolean[], at: number): Participant[] {
  //@ verify
  //@ decreases ps.length
  //@ ensures \result.length === ps.length
  if (ps.length === 0) return []
  if (ps[0].id === pid) {
    if (at > ps[0].updatedAt) return [{ ...ps[0], avail: avail, updatedAt: at }, ...ps.slice(1)]
    return ps
  }
  return [ps[0], ...setAvailLWW(ps.slice(1), pid, avail, at)]
}

// D2: two LWW writes to the same participant with distinct timestamps commute.
export function setAvailLWWCommutes(ps: Participant[], pid: string, a1: boolean[], t1: number, a2: boolean[], t2: number): boolean {
  //@ verify
  //@ contract Two last-writer-wins writes to the same participant with distinct timestamps commute — applying them in either order gives the same result.
  //@ requires t1 !== t2
  //@ decreases ps.length
  //@ ensures setAvailLWW(setAvailLWW(ps, pid, a1, t1), pid, a2, t2) === setAvailLWW(setAvailLWW(ps, pid, a2, t2), pid, a1, t1)
  return true
}

// ── Op model & replay (Stage 2b): the op log preserves the invariant ──
//
// The Durable Object applies a totally-ordered log of ops. Each op touches one
// participant (join a row, or LWW-repaint a row). applyOp and replay preserve
// the well-formedness invariant, so any reachable event state is well-formed.

type Op =
  | { kind: "join"; p: Participant }
  | { kind: "setAvail"; pid: string; avail: boolean[]; at: number }

// An op is well-formed against grid width n iff the row it carries has width n.
export function opOk(op: Op, n: number): boolean {
  //@ verify
  if (op.kind === "join") return op.p.avail.length === n
  return op.avail.length === n
}

export function allOpsOk(ops: Op[], n: number): boolean {
  //@ verify
  //@ decreases ops.length
  if (ops.length === 0) return true
  if (!opOk(ops[0], n)) return false
  return allOpsOk(ops.slice(1), n)
}

export function setAvailLWWPreservesLen(ps: Participant[], pid: string, avail: boolean[], at: number, n: number): boolean {
  //@ verify
  //@ contract A last-writer-wins write keeps every row at the grid width.
  //@ requires allAvailLen(ps, n)
  //@ requires avail.length === n
  //@ decreases ps.length
  //@ ensures allAvailLen(setAvailLWW(ps, pid, avail, at), n)
  return true
}

// A participant repaints their row, last-writer-wins by timestamp.
export function setAvailabilityLWW(e: Event, pid: string, avail: boolean[], at: number): Event {
  //@ verify
  //@ contract Preserves well-formedness and the grid width; the last-writer-wins update itself is not part of the proven contract.
  //@ requires wellFormed(e)
  //@ requires avail.length === e.numSlots
  //@ ensures wellFormed(\result)
  //@ ensures \result.numSlots === e.numSlots
  return { ...e, participants: setAvailLWW(e.participants, pid, avail, at) }
}

// applyOp is TOTAL — it inlines the pure row transforms (so it composes inside
// replay without a wellFormed precondition). Invariant preservation is proved
// separately by applyOpPreservesInv.
export function applyOp(e: Event, op: Op): Event {
  //@ verify
  //@ contract Preserves the grid width; the op's effect on the roster is not part of the proven contract.
  //@ ensures \result.numSlots === e.numSlots
  if (op.kind === "join") return { ...e, participants: [...e.participants, op.p] }
  return { ...e, participants: setAvailLWW(e.participants, op.pid, op.avail, op.at) }
}

export function applyOpPreservesInv(e: Event, op: Op): boolean {
  //@ verify
  //@ contract Applying a well-formed op to a well-formed event yields a well-formed event.
  //@ requires wellFormed(e)
  //@ requires opOk(op, e.numSlots)
  //@ ensures wellFormed(applyOp(e, op))
  return true
}

// replay folds a totally-ordered op log. Total (no precondition); the DO feeds
// it a well-formed event and matching ops, and replayPreservesInv shows the
// result stays well-formed — so every reachable event state is well-formed.
export function replay(e: Event, ops: Op[]): Event {
  //@ verify
  //@ decreases ops.length
  if (ops.length === 0) return e
  return replay(applyOp(e, ops[0]), ops.slice(1))
}

export function replayPreservesInv(e: Event, ops: Op[]): boolean {
  //@ verify
  //@ contract Replaying a well-formed op log over a well-formed event yields a well-formed event of the same grid width.
  //@ requires wellFormed(e)
  //@ requires allOpsOk(ops, e.numSlots)
  //@ decreases ops.length
  //@ ensures wellFormed(replay(e, ops))
  //@ ensures replay(e, ops).numSlots === e.numSlots
  return true
}

// ── Who is free? (in-app verified query) ──────────────────────
//
// The participants free at slot `s` — by construction the freeAt-filter of the
// roster. Its length provably equals the heatmap count, so the "who's free here"
// tooltip can never disagree with the number shown on the cell.

export function freeParticipants(ps: Participant[], s: number): Participant[] {
  //@ verify
  //@ contract A list whose length equals the slot's free-count.
  //@ decreases ps.length
  //@ ensures \result.length === countFree(ps, s)
  if (ps.length === 0) return []
  const rest = freeParticipants(ps.slice(1), s)
  return freeAt(ps[0], s) ? [ps[0], ...rest] : rest
}

export function whoIsFree(e: Event, s: number): Participant[] {
  //@ verify
  //@ contract A list whose size equals the heatmap count for that slot.
  //@ requires e.numSlots >= 0
  //@ requires 0 <= s && s < e.numSlots
  //@ ensures heatmap(e).length === e.numSlots
  //@ ensures \result.length === heatmap(e)[s]
  return freeParticipants(e.participants, s)
}

// ── Convergence (Family D1): full element-level permutation invariance ──
//
// countFreeConcat above gives order-independence for two *batches*; `perm(...)`
// lifts it to ANY reordering of the participant rows. This is the complete
// element-level convergence statement that was previously inexpressible — `//@`
// specs could not name a multiset, so the abelian-monoid core (the
// concat-homomorphism) was the strongest substitute. With `perm`, the natural
// theorem states directly. (Proof in the companion .dfy: a remove-one-element
// induction that reuses `countFreeConcat` as its remove-at-index step.)
export function countFreePerm(xs: Participant[], ys: Participant[], s: number): boolean {
  //@ verify
  //@ contract Any permutation of the participant list leaves every slot's free-count unchanged.
  //@ requires perm(xs, ys)
  //@ ensures countFree(xs, s) === countFree(ys, s)
  return true
}

// Lifted to the observable: two events whose participant lists are permutations
// of each other have identical heatmaps (and hence identical isBest /
// availableAtLeast). This subsumes heatmapBatchOrderInvariant — a batch swap is
// just one permutation among all of them.
export function heatmapPermInvariant(a: Event, b: Event): boolean {
  //@ verify
  //@ contract Two events whose participant lists are permutations of each other have identical heatmaps.
  //@ requires a.numSlots >= 0 && a.numSlots === b.numSlots
  //@ requires perm(a.participants, b.participants)
  //@ ensures heatmap(a).length === a.numSlots
  //@ ensures heatmap(b).length === b.numSlots
  //@ ensures forall(s, 0 <= s && s < a.numSlots ==> heatmap(a)[s] === heatmap(b)[s])
  return true
}
