# Building Quorum with LemmaScript — a retrospective

Quorum is a login-free, when2meet-style group scheduler whose aggregate answers — the
heatmap, the recommended time, the export — are formally verified in
[LemmaScript](https://github.com/midspiral/LemmaScript), with a React front end and a
Cloudflare Durable Object backend. It was built end-to-end in one session, verification-first.

This isn't a how-to (the annotation mechanics live in `SPEC.md` / `AGENTS.md`). It's a field
report: what the experience actually taught about *where verification pays, how it shapes a
design, and where the tool has edges* — grounded in concrete moments from the build.

---

## 1. Verify the answer, not the app

The first real decision wasn't a proof; it was *what to prove*. A scheduler's job is an
**aggregate** — how many people are free at each slot, which slot wins, what the export
says. That's what everyone acts on, so that's what we verified: `heatmap[s]` is *exactly*
the count of available participants, `isBest` flags *exactly* the argmax, the export
round-trips. The React grid, the drag-painting, `localStorage`, the calendar/timezone
labels — explicitly trusted.

The skill being exercised here is judgment, not Dafny. A verified pure core wrapped in a
thin trusted shell is the whole shape of the project, and getting that line in the right
place is most of the value.

## 2. A good abstraction makes features free

`domain.ts` never learns what "Monday" or "9 AM" means — it reasons in flat slot indices
`[0, numSlots)`. That paid off more than once:

- Adding **two creation modes** (specific calendar dates *or* abstract days of the week) was
  pure shell labeling over the same indices. **Zero proofs changed.**
- The *only* shell logic worth proving was the cell→slot map itself (`grid.ts`: in range +
  injective), so the painted grid provably lines up with the verified one.

Pick the abstraction one level below where the features churn, and the features arrive for
free while the proofs stay put.

## 3. The proof can *license* the architecture

This was the session's best beat. We proved **convergence**: `countFree` is a homomorphism
from participant-list concatenation to integer addition (so the heatmap is independent of
the order edits arrive in), plus same-participant last-writer-wins.

When it came time to add real multi-device sync, that proof *was the permission slip*.
Because availability is partitioned per participant and the aggregate converges regardless
of order, the Cloudflare Durable Object and the browser can both apply the **same** verified
`applyOp` — the client optimistically (instant paint), the server authoritatively — with no
rollback and no operational transform. The lock-free, no-login, optimistic backend wasn't
something verification had to be talked into; it was something the proof made *safe to
attempt*. Verification as a design enabler, not a gate.

## 4. One core, everywhere

There is exactly one `domain.ts`. It runs in the browser (optimistic paint), behind the
in-app "who's free here?" tooltip, and inside the Durable Object (authoritative). No port,
no second implementation, no client/server drift — they agree by construction. The transport
seam (`store.ts`'s `dispatch(op)`) was designed up front, so when the backend landed it
slotted under the existing UI with essentially no UI changes — `App.tsx` didn't care whether
`dispatch` wrote to `localStorage` or a WebSocket.

## 5. Total functions compose — and the `ensures`-as-lemma reality

A force that quietly shaped the whole core: LemmaScript emits each `//@ ensures` as a
*separate* lemma, **not** a Dafny postcondition — and a pure function can't call a lemma. So
a function can't lean on a callee's `ensures` from inside its own body. You feel the
consequences fast:

- **Write pure recursive functions, not loops.** Imperative `method`s can't take proof hints;
  the recursive style (à la `replay_core`) is what composes with hand-written induction.
- **Keep core functions total.** Mid-session we refactored `countFree` to be precondition-free
  (a total `freeAt` guard) *specifically* so it would compose inside the heatmap, the queries,
  and the convergence lemmas. `maxCount` shed its precondition for the same reason — which
  then forced it to return an actual element instead of a 0-floor, to keep "the maximum is
  attained" true.

The shape of the proofs pushed the shape of the code — in a good direction.

## 6. Honest about the edges

It wasn't frictionless, and the honest picture is more useful than a glossy one:

- **`regen` + a stale `.dfy.base`.** Early on, `regen` kept duplicating declarations. The
  cause was a stale three-way-merge base left behind by a failed run; deleting `*.dfy.base`
  before re-running fixed it. (Now documented in `AGENTS.md`.)
- **Z3 and nonlinear arithmetic.** The grid bijection's `(numDays-day-1)*slotsPerDay >= 0`
  assertion verified locally and then *failed in CI* — Z3's nonlinear search is
  nondeterministic across versions/seeds. The fix was to stop asking it to search: prove the
  multiplication facts with tiny **inductive helper lemmas** (`mulMonoLeft`, `mulDistribSub`,
  `mulGeRight`) so every step is linear. It now passes even under `--isolate-assertions`.
  Rule of thumb earned: for anything multiplicative, reach for an inductive helper before a
  bare `assert`.
- **What we couldn't say.** The cleanest statement of convergence — full permutation
  invariance via `multiset(xs) == multiset(ys)` — isn't expressible in `//@` specs (no
  `multiset` type, no raw-Dafny escape). We proved the abelian-monoid core (the
  concat-homomorphism), which is the expressible substitute, and recorded the gap in
  `LS_TODO.md`. Knowing the edge of what you can *state* is part of the craft.

## 7. Verified is not the same as shipped

A small, clarifying episode. We built and verified `availableAtLeast` (the "≥ k people free"
threshold query) and put a slider in the UI — then realized the heatmap already shows the
count, so the control was redundant, and cut it. We kept the **proof** (it's cheap to keep
and would back a future query endpoint); we removed only the **UI**. Verification status and
product decisions are independent axes — proving something doesn't obligate you to surface it.

## What it bought, and what it didn't claim

**Bought:** the numbers people act on are correct by proof, not by test coverage; the
convergence guarantee let the lock-free multi-device backend be built with confidence rather
than hope; the slot-index abstraction made presentation changes (dates vs. weekdays, the
calendar UI) cost nothing in proofs.

**Never claimed:** end-to-end correctness. The *aggregate semantics* are proven — 95 VCs
across `domain.ts` (85) and `grid.ts` (10), 0 errors — while the React UI, the
WebSocket/Durable-Object I/O, and the calendar/timezone labeling are a stated, deliberate
trust boundary (`DESIGN.md §2`).

The compelling thing was never that *everything* was verified. It's that the **right** things
were — and that the proofs turned out to be load-bearing for the design, not decoration laid
over it after the fact.
