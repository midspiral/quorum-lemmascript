// Runtime smoke test: exercise the exact op-flow the app uses against the
// verified core, and assert the aggregation outputs.
import { initEvent, applyOp, heatmap, isBest, availableAtLeast, maxCount, sparsify, densify } from "../src/domain.ts"
import { gridIndex } from "../src/grid.ts"

const eq = (a, b, msg) => {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  console.log(ok ? "ok  " : "FAIL", msg, ok ? "" : `=> got ${JSON.stringify(a)} want ${JSON.stringify(b)}`)
  if (!ok) process.exitCode = 1
}

// 2 days × 3 slots/day = 6 slots
const N = 6
const mk = (id, name) => ({ id, name, avail: Array(N).fill(false), updatedAt: 0 })
let e = initEvent("t", "Test", N)
e = applyOp(e, { kind: "join", p: mk("a", "A") })
e = applyOp(e, { kind: "join", p: mk("b", "B") })
e = applyOp(e, { kind: "join", p: mk("c", "C") })
e = applyOp(e, { kind: "setAvail", pid: "a", avail: [false, true, false, false, true, false], at: 1 })
e = applyOp(e, { kind: "setAvail", pid: "b", avail: [false, true, true, false, false, false], at: 2 })
e = applyOp(e, { kind: "setAvail", pid: "c", avail: [false, true, false, false, false, false], at: 3 })

eq(heatmap(e), [0, 3, 1, 0, 1, 0], "heatmap counts")
eq(isBest(e), [false, true, false, false, false, false], "isBest = argmax & >0")
eq(maxCount(heatmap(e)), 3, "peak = 3")
eq(availableAtLeast(e, 2), [false, true, false, false, false, false], "availableAtLeast(2)")
eq(availableAtLeast(e, 1), [false, true, true, false, true, false], "availableAtLeast(1)")
eq(sparsify(e.participants[0].avail), [1, 4], "sparsify A row (export codec)")
eq(densify(sparsify(e.participants[0].avail), N), e.participants[0].avail, "densify∘sparsify = id")
eq(gridIndex(3, 1, 1), 4, "gridIndex(slotsPerDay=3, day=1, time=1)")

// LWW: a newer setAvail to the same participant wins; order-independence
const e1 = applyOp(e, { kind: "setAvail", pid: "a", avail: Array(N).fill(false), at: 9 })
eq(heatmap(e1), [0, 2, 1, 0, 0, 0], "A cleared (newer ts) → slot1=2, slot4=0")
// stale write (older ts) is ignored by LWW
const e2 = applyOp(e1, { kind: "setAvail", pid: "a", avail: [true, true, true, true, true, true], at: 4 })
eq(heatmap(e2), [0, 2, 1, 0, 0, 0], "stale write (at=4 < 9) ignored")

console.log("done")
