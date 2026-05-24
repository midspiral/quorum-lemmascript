# TODO — remaining verification tasks

Tracks the verification work still open in `src/domain.ts`. Each item lists the
goal, an illustrative spec, what it depends on, and notes/blockers.

**Verified so far** (81 VCs, 0 errors — see `DESIGN.md §9`):
Stage 0 aggregation (heatmap = count, bounded; `maxCount`; `isBest`; `availableAtLeast`),
Stage 0b mutations (`init`/`add`/`setAvailability`/`removeParticipant` preserve `Inv`)
+ sparse codec round-trip (E1), Stage 1 monotonicity (Family C), Stage 2b convergence
core + D2 LWW + op-model/`replay` (Family D).

Workflow reminders: append new functions to the **end** of `domain.ts`; `rm -f src/domain.dfy.base`
before any `lsc regen` (see `DESIGN.md §10`, `LS_TODO.md`); pure functions can't invoke
lemmas, so keep composing functions total and prove properties in separate `_ensures` lemmas.

---

## 1. A2 — participant-id uniqueness in the invariant
**Goal.** Strengthen `wellFormed` with id-uniqueness; prove every mutation/op preserves it.
This is a prerequisite for the query layer (Family F).

```ts
//@ ensures \result === true ==> forall(i, forall(j, 0<=i && i<j && j<ps.length ==> ps[i].id !== ps[j].id))
function idsUnique(ps: Participant[]): boolean   // recursive predicate (head not in tail)
// wellFormed(e) := numSlots >= 0 && allAvailLen(...) && idsUnique(e.participants)
```
- `addParticipant` / op `join` gains a freshness precondition (`!idTaken(e, p.id)`).
- `setAvailability`/`setAvailLWW`/`removeParticipant` preserve uniqueness (they never introduce an id).
- **Notes.** Mirror the `allAvailLen` reflection-lemma shape (recursive predicate + `_ensures`).
  `removeP` keeps a sublist, so uniqueness is preserved; `setAvailLWW` keeps ids fixed.

## 2. Family F — query-algebra soundness
**Goal.** The "run queries over it" layer, each operator characterized exactly. Depends on **A2**.

```ts
// count agrees with the heatmap; membership iff in-range-and-free; result has no dup ids
//@ requires wellFormed(e) && 0 <= s && s < e.numSlots
//@ ensures \result.length === heatmap(e)[s]
//@ ensures forall(p, contains(\result, p) <==> (participantIn(e, p) && freeAt(rowOf(e,p), s)))
function participantsAt(e: Event, s: number): string[]

// overlap(P) = slots where ALL of P are free; overlap(all) = slots with count === N
//@ requires wellFormed(e)
//@ ensures forall(s, \result[s] === (0<=s && s<e.numSlots && allFreeAt(e, pids, s)))
function overlap(e: Event, pids: string[]): boolean[]
```
- `participantsAt` is the harder one — the `length === heatmap[s]` clause ties a membership
  count back to `countFree`; needs A2 so the collected ids are distinct (no double count).
- Consider realizing `overlap` as a boolean mask (like `isBest`) to avoid set-membership reasoning.

## 3. D1 — full element-level permutation invariance  ⛔ blocked
**Goal.** `multiset(xs) === multiset(ys) ==> countFree(xs, s) === countFree(ys, s)`,
i.e. the heatmap depends only on the *set* of participant rows, not their order.
- **Blocker.** `//@` specs can't name `multiset` (no raw-Dafny escape). See `LS_TODO.md`.
  The verified abelian-monoid core (`countFreeConcat` + `countFreeComm`) is the expressible
  substitute; D1 is one lemma away once LemmaScript exposes `multiset` in spec position.
- Alternative without `multiset`: a recursive `isPermutation` predicate + a remove-at-index
  lemma built on `countFreeConcat` — heavier, but unblocks it today if needed.

## 4. Event-level export codec (E1 completion) + E2 query-over-export soundness
**Goal.** Whole-`Event` encode/decode round-trip, then queries over the export match live.

```ts
//@ requires wellFormed(e)
//@ ensures eventEq(decodeEvent(encodeEvent(e)), e)
function eventRoundTrip(e: Event): boolean

// E2 corollary of E1 + purity, stated directly for the trustworthy queries:
//@ ensures isBest(decodeEvent(encodeEvent(e))) === isBest(e)   // and availableAtLeast, participantsAt
```
- Mostly plumbing: `id`/`title`/`numSlots` are scalars; each participant's `avail`
  round-trips by the verified `densify(sparsify(a)) === a`. Lift per-participant → event via
  a list-map round-trip lemma.
- E2 should fall out of E1 + functional purity once `eventRoundTrip` lands.

## 5. C3 — removal is monotone-decreasing (small, optional)
**Goal.** Symmetric to C1: removing a participant never *increases* any slot's count.
```ts
//@ requires wellFormed(e)
//@ ensures forall(s, 0<=s && s<e.numSlots ==> heatmap(removeParticipant(e, pid))[s] <= heatmap(e)[s])
```
- Needs a `countFree(removeP(ps,pid), s) <= countFree(ps, s)` lemma (induction over `removeP`).

## 6. Stage 4 — ternary availability (optional richness)
**Goal.** `Available | IfNeedBe | Unavailable` instead of a bare bitset, unlocking
rallly-style **score-formula pinning** and **tiebreaker injectivity** on top of the grid
(`score = (yes + ifNeedBe)*W + yes`, monotone, injective under a `yes < W` bound).
- Larger change: touches the data model, `countFree`→weighted score, and the codec.
  Adopt only if the richer scoring properties are worth the added surface.

---

## Out of scope (trust boundary, not to be "verified")
React UI, WebSocket/DO/D1/R2 I/O, the `slotIndex ⟷ (date, time, timezone)` labeling,
append-only integrity (DB `PRIMARY KEY`, E3), and abuse/rate-limiting. Stated in `DESIGN.md §2, §6`.
