# Quorum — Cloudflare backend (real multi-device sync)

How Quorum goes from local-only to a genuinely shared scheduler, **without changing the
UI** and while putting the verification to work. Companion to `DESIGN.md` (the verified
core) — this file is just the transport/infra layer.

## The one idea
The app already routes every change through a transport seam: `src/store.ts` exposes
`{ getSnapshot, subscribe, dispatch(op) }` and is the only module that imports the verified
`applyOp`. The backend is a **second implementation of that same interface** — a
`RemoteStore` that speaks WebSocket to a Durable Object — so `App.tsx` / `useQuorum.ts` /
`Grid.tsx` are untouched. Picking local vs. remote is one line in `loadStore`.

## Why this is the architecture the proofs licensed
The server runs the **same `domain.ts`**. The DO mutates its canonical event only via the
verified `applyOp` (so `applyOpPreservesInv` ⇒ stored state is always well-formed), and the
client applies the same op **optimistically** the instant you paint. Those two can diverge
in ordering — and Family D is exactly the proof that they *don't matter*:

- availability is **partitioned by participant** (you only ever emit ops for your own row),
- `applyOp`/`replay` preserve `Inv` (Stage 0b / 2b),
- the heatmap is order-independent and same-participant edits are **LWW-convergent** (D2).

So optimistic local apply needs **no rollback and no operational transform** — the server
applies the identical op and the states provably converge. That's the elegant part: the
backend is lock-free and transform-free *because* of what we proved, not in spite of it.

## Components
```
Browser (SPA, unchanged UI)
  └─ RemoteStore (src/remoteStore.ts)  ── WebSocket ──▶  Worker (worker/index.ts)
       • dispatch(op): apply locally (applyOp) + send op                 │ routes /api/*, serves dist/
       • subscribe/getSnapshot over last server state                    ▼
                                                          Durable Object: QuorumEvent (one per event)
                                                            • canonical Event in DO storage
                                                            • mutates ONLY via verified applyOp
                                                            • hibernatable WebSocket fan-out
```

- **One Worker** serves the built SPA (`[assets]` → `dist/`) and `/api/*`; no separate host.
- **One Durable Object per event**, addressed by `idFromName(shortCode)` → pretty `#e=ab3k9z`
  links. Single-threaded, so it serializes writes into a total order for free (sufficient,
  not necessary — see above).
- **Hibernation API** (`state.acceptWebSocket` + `webSocketMessage`/`webSocketClose`) so idle
  events cost nothing.

## WebSocket protocol (client ↔ DO)
- client → `{ t: "hello", pid?, name? }` — on connect. No `pid` (+ `name`) → DO creates a
  participant via `applyOp(join)`; existing `pid` → reattach (create it if unknown, so a
  localStorage identity survives).
- DO → `{ t: "welcome", pid, grid, event }` — to the joiner.
- client → `{ t: "setAvail", pid, avail, at }` — a repaint (whole row, LWW timestamp).
- DO → `{ t: "state", event }` — broadcast to all sockets after any change.

The DO applies `hello`/`setAvail` through `applyOp` and persists, then broadcasts. (The op
shapes are exactly `store.ts`'s `Op`.)

## Persistence
DO storage holds the canonical `{ grid, event }` (event = the verified shape). Broadcasts
send the full `event` — small for realistic grids, and it keeps the client dumb. An
append-only **op log** (which `replay` is verified to fold back) is a natural add for
audit / late-joiner deltas / a D1 corpus, but is **deferred**; the materialized event
suffices for the live app and per-event export.

## Identity & trust (stated honestly)
No login. Identity = an anonymous `pid` in `localStorage`, sent on `hello`. The server
trusts the client's `pid` — a malicious client could paint as someone else. That's the
same trust model as when2meet and acceptable for v1; **abuse / rate-limiting / spoofing are
trusted, not verified** (consistent with `DESIGN.md §2`). The grid's wall-clock labeling
stays client-side; the DO only ever sees slot indices + the opaque `grid` blob.

## Create / load flow
- `createEvent` → `POST /api/events { grid }` → DO `init` stores `{ grid, event=initEvent(...) }`
  → returns short code → `#e=<code>`.
- `loadStore(id)` → opens `RemoteStore` (WS `/api/events/:id/ws`); offline or unknown id
  degrades to a read-only "can't reach this event" state. The `localStorage` "your events"
  list and per-event `me` pid stay as they are.

## Testing & deploy
- **Local:** `wrangler dev` runs the Worker + DO + WebSocket offline (workerd/miniflare);
  drive two browser contexts to see live cross-tab sync. Smoke covers the DO reducer by
  importing `domain.ts` directly (same as `test/smoke.mjs`).
- **Deploy:** `npm run build && wrangler deploy` to the owner's Cloudflare account (the
  `source`/publish step is theirs). D1/R2 bindings only if/when the corpus lands.

## Decisions (recommended — confirm before building)
1. **Optimistic `RemoteStore`** (apply locally + send; reconcile on broadcast). Recommended —
   it's snappy and provably safe here. Alternative: server-authoritative-only (simpler, less
   snappy).
2. **Materialized event in DO storage**, op-log deferred. Recommended for the first cut.
3. **Remote when online, graceful read-only when not** — keep the local cache of last state
   so reload is instant; full offline-edit queue deferred.
4. Backend is **opt-in via build/config** so the pure-local SPA still works with no Worker.
