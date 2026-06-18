# Quorum

[![LemmaScript: verified](https://img.shields.io/badge/LemmaScript-verified-brightgreen)](https://github.com/midspiral/quorum-lemmascript/actions/workflows/lemmascript.yml)


A slick, **login-free** group scheduler — when2meet/Doodle in spirit — whose answer
("here's the time the most people can make it") is **formally verified** in
[LemmaScript](https://github.com/midspiral/LemmaScript). Pick dates (or just days of the
week), share a link, paint your availability on a grid; the heatmap and the best-time
recommendation surface themselves. The numbers people act on are backed by proofs, not just
tests.

This is a **LemmaScript case study**: the scheduling logic is written in ordinary
TypeScript with `//@` annotations and discharged to Dafny. The *same* `domain.ts` runs in
the browser, behind the in-app query, and inside the server — one verified core, no second
implementation.

## What is verified

The trustworthy artifact of a scheduler is the **aggregate**. `src/domain.ts` (90 VCs) and
`src/grid.ts` (10 VCs) prove, with 0 errors:

- **Aggregation** — `heatmap(e)[s]` is *exactly* the number of participants free at slot
  `s`, and is bounded by the participant count. `maxCount` is the attained maximum;
  `isBest` flags *exactly* the argmax slots (and nothing when no one has responded).
- **Monotonicity** — a participant joining never lowers any slot's count; if everyone is
  free at a slot, that slot is a best slot.
- **Convergence (the headline)** — `countFree` is a homomorphism from participant-list
  concatenation to integer addition, so the heatmap is **independent of the order** edits
  arrive in; same-participant edits resolve last-writer-wins and converge. This is the
  formal justification for the lock-free, optimistic, no-login design. Now stated in full
  generality: `heatmapPermInvariant` proves the heatmap depends only on the *multiset* of
  participant rows — **any** reordering, not just a two-batch swap — via the `perm(...)`
  spec predicate added to LemmaScript for exactly this.
- **Invariant preservation** — `initEvent` / `addParticipant` / `setAvailability` /
  `removeParticipant`, and the op-log `replay`, all preserve the structural invariant.
- **Faithful export** — the sparse availability codec round-trips
  (`densify(sparsify(a)) === a`), so the exported NDJSON reconstructs availability exactly.
- **Grid mapping** — `gridIndex` (cell → flat slot) is in range and injective, so distinct
  `(day, time)` cells never alias the same slot.
- **In-app query** — `whoIsFree(e, s)` returns the participants free at `s`, with length
  provably equal to that cell's heatmap count (the hover tooltip can't disagree with the
  number shown).

### What is *not* verified (the trust boundary, stated plainly)

The React UI, WebSocket / Durable Object / `localStorage` I/O, JSON serialization, the
`slotIndex ⟷ (date, time, timezone)` labeling, and abuse / rate-limiting. There is **no
login**: events are unlisted and link-shared (capability URL), and anyone with the link can
participate — the same trust model as the apps it clones. No "verified end-to-end" claim:
the *aggregate semantics* are proven; the shell around them is trusted.

## Why it's a good case study

The core reasons in abstract slot indices `[0, numSlots)` — it has no notion of "Monday" or
"9 AM". That abstraction is load-bearing:

- **Presentation is free.** Specific-dates vs. days-of-the-week is pure shell labeling over
  the same flat indices, so adding both modes touched zero proofs.
- **The proofs licensed the backend.** Because availability is partitioned per participant
  and the heatmap is order-independent + LWW-convergent, the Durable Object and the browser
  can both apply the *same* verified `applyOp` — the client optimistically, the server
  authoritatively — with no rollback and no operational transform.

## Layout

```
src/domain.ts      verified core: aggregation, mutations, convergence, codec, whoIsFree
src/grid.ts        verified cell↔slot mapping (in-range + injective)
src/*.dfy          generated Dafny + hand-written proofs (companions; CI diff-checks them)
src/store.ts       transport seam (local) + create/load; only importer of applyOp
src/remoteStore.ts same seam over WebSocket → the Durable Object (optimistic)
src/useQuorum.ts   the view's window; only caller of heatmap/isBest/maxCount/whoIsFree
src/App.tsx, src/components/Grid.tsx, src/styles.css   the (trusted) TypeScript UI
worker/            Cloudflare Worker + QuorumEvent Durable Object (imports domain.ts)
test/smoke.mjs     runtime checks of the core against the app's op-flow
DESIGN.md, DESIGN_CLOUDFLARE.md, TODO_VERIFY.md
```

## Verify

`LemmaScript-files.txt` lists the verified sources. With [LemmaScript](https://github.com/midspiral/LemmaScript)
cloned alongside and Dafny installed:

```sh
../LemmaScript/tools/check.sh dafny        # regenerate .dfy.gen and run dafny verify
```

The companion `.dfy` files hold the generated Dafny plus hand-written inductive proofs; CI
asserts the generated portion never drifts from the TypeScript.

## Run

```sh
npm install
npm run dev          # pure-local SPA (no backend)
npm test             # runtime smoke test of the verified core
npm run typecheck    # app + worker
npm run worker:dev   # build with the backend on + run the Worker + DO locally (wrangler)
npm run deploy       # build + deploy to Cloudflare (your account)
```

Local mode stores events in `localStorage`; the backend (opt-in via `VITE_REMOTE=1`, which
`worker:dev`/`deploy` set) gives real multi-device sync via one Durable Object per event.

## Status

Verified core + a TypeScript React SPA (dates/weekday grids, paint/group, who's-free hover,
NDJSON export) + a working Cloudflare Durable Object backend for live sync. Deferred:
participant-id uniqueness → exact `participantsAt` and subgroup `overlap`; a D1/R2 query
corpus. (Full element-level permutation-invariance — once deferred for lack of `multiset`
in specs — is now **verified** via the `perm(...)` predicate; see `TODO_VERIFY.md`.)
