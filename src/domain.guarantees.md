# Guarantees: src/domain.ts

Generated: 2026-06-16

> Verification is **assumed** (run `lsc check` to discharge the proofs). This report vets only that each `//@ contract` faithfully describes its formal `requires`/`ensures`, via claimcheck's blind round-trip.

## Coverage

- **32** backed contracts: 32 confirmed, 0 disputed
- **0** gaps (contract with no formal spec behind it)

## Claimcheck Results

| Function | Contract | Status |
|----------|----------|--------|
| `countFree` | A count between 0 and the number of participants. | ✅ confirmed |
| `heatmap` | The per-slot count of how many participants are free at each slot. | ✅ confirmed |
| `maxCount` | The largest count in the heatmap, and for a non-empty heatmap a value that some slot actually attains. | ✅ confirmed |
| `isBest` | Marks exactly the slots whose free-count ties the maximum, with nothing marked until at least one participant has entered availability. | ✅ confirmed |
| `availableAtLeast` | Marks exactly the slots where at least k participants are free. | ✅ confirmed |
| `countFreeConcat` | Counting two participant batches separately and summing equals counting the two concatenated — the free-count is additive over concatenation. | ✅ confirmed |
| `countFreeComm` | A slot's free-count is the same whether two participant batches are concatenated in one order or the other. | ✅ confirmed |
| `heatmapBatchOrderInvariant` | Two events that differ only in the order of two participant batches have identical heatmaps. | ✅ confirmed |
| `initEvent` | A well-formed event of the given grid width; that it starts empty is not part of the proven contract. | ✅ confirmed |
| `allAvailLenSnoc` | Appending a participant whose row matches the grid width preserves the invariant that every row has the grid width. | ✅ confirmed |
| `addParticipant` | Preserves well-formedness and the grid width; the roster addition itself is not part of the proven contract. | ✅ confirmed |
| `setAvailPreservesLen` | Replacing one participant's availability keeps every row at the grid width. | ✅ confirmed |
| `setAvailability` | Preserves well-formedness and the grid width; the row replacement itself is not part of the proven contract. | ✅ confirmed |
| `removePPreservesLen` | Removing a participant keeps every remaining row at the grid width. | ✅ confirmed |
| `removeParticipant` | Preserves well-formedness and the grid width; the removal itself is not part of the proven contract. | ✅ confirmed |
| `containsSnoc` | Appending index y to a sparse list adds exactly y to its membership and changes nothing else. | ✅ confirmed |
| `sparsify` | The indices at which the availability bitset is true. | ✅ confirmed |
| `densify` | Decodes a sparse index list into a width-n bitset whose bit i is set exactly when i is in the list. | ✅ confirmed |
| `sparseRoundTrip` | Encoding an availability bitset to its sparse true-index list and decoding back reconstructs the original exactly. | ✅ confirmed |
| `countFreeAllFree` | If every participant is free at a slot, the free-count there equals the full roster size. | ✅ confirmed |
| `heatmapMonotoneUnderJoin` | A participant joining never lowers any slot's free-count. | ✅ confirmed |
| `unanimousIsBest` | If everyone is free at a given slot, that slot is among the recommended best slots. | ✅ confirmed |
| `setAvailLWWCommutes` | Two last-writer-wins writes to the same participant with distinct timestamps commute — applying them in either order gives the same result. | ✅ confirmed |
| `setAvailLWWPreservesLen` | A last-writer-wins write keeps every row at the grid width. | ✅ confirmed |
| `setAvailabilityLWW` | Preserves well-formedness and the grid width; the last-writer-wins update itself is not part of the proven contract. | ✅ confirmed |
| `applyOp` | Preserves the grid width; the op's effect on the roster is not part of the proven contract. | ✅ confirmed |
| `applyOpPreservesInv` | Applying a well-formed op to a well-formed event yields a well-formed event. | ✅ confirmed |
| `replayPreservesInv` | Replaying a well-formed op log over a well-formed event yields a well-formed event of the same grid width. | ✅ confirmed |
| `freeParticipants` | A list whose length equals the slot's free-count. | ✅ confirmed |
| `whoIsFree` | A list whose size equals the heatmap count for that slot. | ✅ confirmed |
| `countFreePerm` | Any permutation of the participant list leaves every slot's free-count unchanged. | ✅ confirmed |
| `heatmapPermInvariant` | Two events whose participant lists are permutations of each other have identical heatmaps. | ✅ confirmed |

## Confirmed Guarantees

**A count between 0 and the number of participants.** — `countFree`
```
countFree(ps: Participant[], s: number): number
  ensures 0 <= \result && \result <= ps.length
```
- Back-translation: The count of free participants at a given slot is between 0 and the total number of participants.

**The per-slot count of how many participants are free at each slot.** — `heatmap`
```
heatmap(e: Event): number[]
  requires e.numSlots >= 0
  ensures \result.length === e.numSlots
  ensures forall(s, 0 <= s && s < e.numSlots ==> \result[s] === countFree(e.participants, s))
  ensures forall(s, 0 <= s && s < e.numSlots ==> 0 <= \result[s] && \result[s] <= e.participants.length)
```
- Back-translation: The heatmap function produces an array where each element at slot s equals the count of free participants at that slot, and all values are bounded by the number of participants.

**The largest count in the heatmap, and for a non-empty heatmap a value that some slot actually attains.** — `maxCount`
```
maxCount(h: number[]): number
  ensures forall(s, 0 <= s && s < h.length ==> h[s] <= \result)
  ensures h.length > 0 ==> exists(s, 0 <= s && s < h.length && h[s] === \result)
```
- Back-translation: The maxCount function returns the maximum value in the heatmap array, and if the array is non-empty, that maximum is actually achieved at some index.

**Marks exactly the slots whose free-count ties the maximum, with nothing marked until at least one participant has entered availability.** — `isBest`
```
isBest(e: Event): boolean[]
  requires e.numSlots >= 0
  ensures heatmap(e).length === e.numSlots
  ensures \result.length === e.numSlots
  ensures forall(s, 0 <= s && s < e.numSlots ==> \result[s] === (heatmap(e)[s] === maxCount(heatmap(e)) && maxCount(heatmap(e)) > 0))
```
- Back-translation: The isBest function returns a boolean array where each slot is marked true if and only if it has the maximum count of free participants and that maximum is positive.

**Marks exactly the slots where at least k participants are free.** — `availableAtLeast`
```
availableAtLeast(e: Event, k: number): boolean[]
  requires e.numSlots >= 0
  ensures heatmap(e).length === e.numSlots
  ensures \result.length === e.numSlots
  ensures forall(s, 0 <= s && s < e.numSlots ==> \result[s] === (heatmap(e)[s] >= k))
```
- Back-translation: The availableAtLeast function returns a boolean array where each slot is marked true if and only if the count of free participants at that slot is at least k.

**Counting two participant batches separately and summing equals counting the two concatenated — the free-count is additive over concatenation.** — `countFreeConcat`
```
countFreeConcat(xs: Participant[], ys: Participant[], s: number): boolean
  ensures countFree(xs.concat(ys), s) === countFree(xs, s) + countFree(ys, s)
```
- Back-translation: The count of free participants at a slot in a concatenated array equals the sum of counts in each array separately.

**A slot's free-count is the same whether two participant batches are concatenated in one order or the other.** — `countFreeComm`
```
countFreeComm(xs: Participant[], ys: Participant[], s: number): boolean
  ensures countFree(xs.concat(ys), s) === countFree(ys.concat(xs), s)
```
- Back-translation: The count of free participants is invariant under reordering of concatenated arrays.

**Two events that differ only in the order of two participant batches have identical heatmaps.** — `heatmapBatchOrderInvariant`
```
heatmapBatchOrderInvariant(a: Event, b: Event, xs: Participant[], ys: Participant[]): boolean
  requires a.numSlots >= 0 && a.numSlots === b.numSlots
  requires a.participants === xs.concat(ys)
  requires b.participants === ys.concat(xs)
  ensures heatmap(a).length === a.numSlots
  ensures heatmap(b).length === b.numSlots
  ensures forall(s, 0 <= s && s < a.numSlots ==> heatmap(a)[s] === heatmap(b)[s])
```
- Back-translation: The heatmap is invariant when participants are reordered by concatenating them in a different order.

**A well-formed event of the given grid width; that it starts empty is not part of the proven contract.** — `initEvent`
```
initEvent(id: string, title: string, numSlots: number): Event
  requires numSlots >= 0
  ensures wellFormed(\result)
  ensures \result.numSlots === numSlots
```
- Back-translation: Creating an event with a given number of slots produces a well-formed event with that exact number of slots.

**Appending a participant whose row matches the grid width preserves the invariant that every row has the grid width.** — `allAvailLenSnoc`
```
allAvailLenSnoc(ps: Participant[], p: Participant, n: number): boolean
  requires allAvailLen(ps, n)
  requires p.avail.length === n
  ensures allAvailLen(ps.concat([p]), n)
```
- Back-translation: If all participants in an array have availability arrays of length n, and a new participant has an availability array of length n, then all participants in the concatenated array have availability arrays of length n.

**Preserves well-formedness and the grid width; the roster addition itself is not part of the proven contract.** — `addParticipant`
```
addParticipant(e: Event, p: Participant): Event
  requires wellFormed(e)
  requires p.avail.length === e.numSlots
  ensures wellFormed(\result)
  ensures \result.numSlots === e.numSlots
```
- Back-translation: Adding a participant with a compatible availability array to a well-formed event produces a well-formed event with the same number of slots.

**Replacing one participant's availability keeps every row at the grid width.** — `setAvailPreservesLen`
```
setAvailPreservesLen(ps: Participant[], pid: string, newAvail: boolean[], n: number): boolean
  requires allAvailLen(ps, n)
  requires newAvail.length === n
  ensures allAvailLen(setAvail(ps, pid, newAvail), n)
```
- Back-translation: Setting a participant's availability in an array preserves the invariant that all participants have availability arrays of a fixed length.

**Preserves well-formedness and the grid width; the row replacement itself is not part of the proven contract.** — `setAvailability`
```
setAvailability(e: Event, pid: string, newAvail: boolean[]): Event
  requires wellFormed(e)
  requires newAvail.length === e.numSlots
  ensures wellFormed(\result)
  ensures \result.numSlots === e.numSlots
```
- Back-translation: Setting a participant's availability in a well-formed event produces a well-formed event with the same number of slots.

**Removing a participant keeps every remaining row at the grid width.** — `removePPreservesLen`
```
removePPreservesLen(ps: Participant[], pid: string, n: number): boolean
  requires allAvailLen(ps, n)
  ensures allAvailLen(removeP(ps, pid), n)
```
- Back-translation: Removing a participant from an array preserves the invariant that all remaining participants have availability arrays of a fixed length.

**Preserves well-formedness and the grid width; the removal itself is not part of the proven contract.** — `removeParticipant`
```
removeParticipant(e: Event, pid: string): Event
  requires wellFormed(e)
  ensures wellFormed(\result)
  ensures \result.numSlots === e.numSlots
```
- Back-translation: Removing a participant from a well-formed event produces a well-formed event with the same number of slots.

**Appending index y to a sparse list adds exactly y to its membership and changes nothing else.** — `containsSnoc`
```
containsSnoc(xs: number[], y: number, i: number): boolean
  ensures contains(xs.concat([y]), i) === (contains(xs, i) || y === i)
```
- Back-translation: A number is contained in a concatenated array if and only if it is contained in the original array or equals the appended element.

**The indices at which the availability bitset is true.** — `sparsify`
```
sparsify(a: boolean[]): number[]
  ensures forall(i, contains(\result, i) === (0 <= i && i < a.length && a[i]))
```
- Back-translation: The sparsify function converts a boolean array to an array of indices where the boolean array is true.

**Decodes a sparse index list into a width-n bitset whose bit i is set exactly when i is in the list.** — `densify`
```
densify(idxs: number[], n: number): boolean[]
  requires 0 <= n
  ensures \result.length === n
  ensures forall(i, 0 <= i && i < n ==> \result[i] === contains(idxs, i))
```
- Back-translation: The densify function converts an array of indices to a boolean array of a given length, where each position is true if its index is in the input array.

**Encoding an availability bitset to its sparse true-index list and decoding back reconstructs the original exactly.** — `sparseRoundTrip`
```
sparseRoundTrip(a: boolean[]): boolean
  ensures densify(sparsify(a), a.length).length === a.length
  ensures forall(i, 0 <= i && i < a.length ==> densify(sparsify(a), a.length)[i] === a[i])
```
- Back-translation: Converting a boolean array to sparse form and back to dense form recovers the original array.

**If every participant is free at a slot, the free-count there equals the full roster size.** — `countFreeAllFree`
```
countFreeAllFree(ps: Participant[], s: number): boolean
  requires forall(i, 0 <= i && i < ps.length ==> freeAt(ps[i], s) === true)
  ensures countFree(ps, s) === ps.length
```
- Back-translation: If all participants are free at a given slot, then the count of free participants at that slot equals the total number of participants.

**A participant joining never lowers any slot's free-count.** — `heatmapMonotoneUnderJoin`
```
heatmapMonotoneUnderJoin(e: Event, p: Participant): boolean
  requires wellFormed(e)
  requires p.avail.length === e.numSlots
  ensures heatmap(addParticipant(e, p)).length === e.numSlots
  ensures heatmap(e).length === e.numSlots
  ensures forall(s, 0 <= s && s < e.numSlots ==> heatmap(addParticipant(e, p))[s] >= heatmap(e)[s])
```
- Back-translation: Adding a participant to an event increases or maintains the count of free participants at each slot.

**If everyone is free at a given slot, that slot is among the recommended best slots.** — `unanimousIsBest`
```
unanimousIsBest(e: Event, s: number): boolean
  requires e.numSlots >= 0
  requires e.participants.length > 0
  requires 0 <= s && s < e.numSlots
  requires forall(i, 0 <= i && i < e.participants.length ==> freeAt(e.participants[i], s) === true)
  ensures isBest(e).length === e.numSlots
  ensures isBest(e)[s] === true
```
- Back-translation: If all participants are free at a given slot, then that slot is marked as best.

**Two last-writer-wins writes to the same participant with distinct timestamps commute — applying them in either order gives the same result.** — `setAvailLWWCommutes`
```
setAvailLWWCommutes(ps: Participant[], pid: string, a1: boolean[], t1: number, a2: boolean[], t2: number): boolean
  requires t1 !== t2
  ensures setAvailLWW(setAvailLWW(ps, pid, a1, t1), pid, a2, t2) === setAvailLWW(setAvailLWW(ps, pid, a2, t2), pid, a1, t1)
```
- Back-translation: Setting availability with different timestamps commutes: the order of operations does not matter when timestamps differ.

**A last-writer-wins write keeps every row at the grid width.** — `setAvailLWWPreservesLen`
```
setAvailLWWPreservesLen(ps: Participant[], pid: string, avail: boolean[], at: number, n: number): boolean
  requires allAvailLen(ps, n)
  requires avail.length === n
  ensures allAvailLen(setAvailLWW(ps, pid, avail, at), n)
```
- Back-translation: Setting availability with a timestamp preserves the invariant that all participants have availability arrays of a fixed length.

**Preserves well-formedness and the grid width; the last-writer-wins update itself is not part of the proven contract.** — `setAvailabilityLWW`
```
setAvailabilityLWW(e: Event, pid: string, avail: boolean[], at: number): Event
  requires wellFormed(e)
  requires avail.length === e.numSlots
  ensures wellFormed(\result)
  ensures \result.numSlots === e.numSlots
```
- Back-translation: Setting a participant's availability with a timestamp in a well-formed event produces a well-formed event with the same number of slots.

**Preserves the grid width; the op's effect on the roster is not part of the proven contract.** — `applyOp`
```
applyOp(e: Event, op: Op): Event
  ensures \result.numSlots === e.numSlots
```
- Back-translation: Applying an operation to an event preserves the number of slots.

**Applying a well-formed op to a well-formed event yields a well-formed event.** — `applyOpPreservesInv`
```
applyOpPreservesInv(e: Event, op: Op): boolean
  requires wellFormed(e)
  requires opOk(op, e.numSlots)
  ensures wellFormed(applyOp(e, op))
```
- Back-translation: Applying a valid operation to a well-formed event produces a well-formed event.

**Replaying a well-formed op log over a well-formed event yields a well-formed event of the same grid width.** — `replayPreservesInv`
```
replayPreservesInv(e: Event, ops: Op[]): boolean
  requires wellFormed(e)
  requires allOpsOk(ops, e.numSlots)
  ensures wellFormed(replay(e, ops))
  ensures replay(e, ops).numSlots === e.numSlots
```
- Back-translation: Replaying a sequence of valid operations on a well-formed event produces a well-formed event with the same number of slots.

**A list whose length equals the slot's free-count.** — `freeParticipants`
```
freeParticipants(ps: Participant[], s: number): Participant[]
  ensures \result.length === countFree(ps, s)
```
- Back-translation: The freeParticipants function returns an array of participants who are free at a given slot, with length equal to the count of free participants.

**A list whose size equals the heatmap count for that slot.** — `whoIsFree`
```
whoIsFree(e: Event, s: number): Participant[]
  requires e.numSlots >= 0
  requires 0 <= s && s < e.numSlots
  ensures heatmap(e).length === e.numSlots
  ensures \result.length === heatmap(e)[s]
```
- Back-translation: The whoIsFree function returns an array of participants who are free at a given slot, with length equal to the heatmap value at that slot.

**Any permutation of the participant list leaves every slot's free-count unchanged.** — `countFreePerm`
```
countFreePerm(xs: Participant[], ys: Participant[], s: number): boolean
  requires perm(xs, ys)
  ensures countFree(xs, s) === countFree(ys, s)
```
- Back-translation: The count of free participants at a slot is invariant under permutation of the participant array.

**Two events whose participant lists are permutations of each other have identical heatmaps.** — `heatmapPermInvariant`
```
heatmapPermInvariant(a: Event, b: Event): boolean
  requires a.numSlots >= 0 && a.numSlots === b.numSlots
  requires perm(a.participants, b.participants)
  ensures heatmap(a).length === a.numSlots
  ensures heatmap(b).length === b.numSlots
  ensures forall(s, 0 <= s && s < a.numSlots ==> heatmap(a)[s] === heatmap(b)[s])
```
- Back-translation: The heatmap is invariant when the participant array is permuted.

