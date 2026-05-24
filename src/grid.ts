//@ backend dafny

// ═══════════════════════════════════════════════════════════════
// Quorum — verified grid coordinate mapping
//
// The UI paints cells at (day, time); the verified core (domain.ts) reasons in
// flat slot indices [0, numSlots). This file is the bridge, and it proves the
// bridge is sound:
//   • in range  — every cell of a numDays × slotsPerDay grid maps into [0, numSlots);
//   • injective — distinct cells never alias the same slot index.
//
// The UI only ever needs the FORWARD map (iterate (day, time), read
// heatmap[gridIndex(...)]), so no integer division is required. Proving these
// two facts shrinks the "slotIndex ⟷ labeling" trusted edge (DESIGN.md §2) down
// to just the calendar/timezone arithmetic, which stays (unverified) in the shell.
// ═══════════════════════════════════════════════════════════════

// Flat slot index of the cell at (day, time) on a grid with `slotsPerDay` columns.
export function gridIndex(slotsPerDay: number, day: number, time: number): number {
  //@ verify
  //@ requires slotsPerDay >= 1
  //@ requires day >= 0 && time >= 0 && time < slotsPerDay
  //@ ensures \result === day * slotsPerDay + time
  //@ ensures \result >= 0
  //@ ensures \result < (day + 1) * slotsPerDay
  return day * slotsPerDay + time
}

// In range: a cell on a numDays × slotsPerDay grid lands in [0, numDays*slotsPerDay).
export function gridIndexInRange(numDays: number, slotsPerDay: number, day: number, time: number): boolean {
  //@ verify
  //@ requires slotsPerDay >= 1 && numDays >= 0
  //@ requires 0 <= day && day < numDays && 0 <= time && time < slotsPerDay
  //@ ensures 0 <= gridIndex(slotsPerDay, day, time)
  //@ ensures gridIndex(slotsPerDay, day, time) < numDays * slotsPerDay
  return true
}

// Injective: distinct cells never collide on the same slot.
export function gridIndexInjective(slotsPerDay: number, d1: number, t1: number, d2: number, t2: number): boolean {
  //@ verify
  //@ requires slotsPerDay >= 1
  //@ requires d1 >= 0 && d2 >= 0
  //@ requires 0 <= t1 && t1 < slotsPerDay && 0 <= t2 && t2 < slotsPerDay
  //@ requires gridIndex(slotsPerDay, d1, t1) === gridIndex(slotsPerDay, d2, t2)
  //@ ensures d1 === d2 && t1 === t2
  return true
}
