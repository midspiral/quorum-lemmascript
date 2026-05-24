// Shell-side grid labeling. The only piece of real logic here — the cell↔slot
// mapping — delegates to the *verified* gridIndex (src/grid.ts), which proves it
// is in-range and injective. Columns may be specific calendar dates OR abstract
// days of the week; the verified core is agnostic (it only ever sees numSlots),
// so this distinction lives entirely in the (trusted) labeling below.

import { gridIndex } from "./grid"

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// Build grid metadata. `kind` is "dates" (cols = sorted ISO date strings) or
// "weekdays" (cols = sorted weekday numbers 0–6). Each column is split into
// [startHour, endHour) at `slotMinutes`. numSlots === cols.length * slotsPerDay.
export function buildGrid({ title, kind, cols, startHour, endHour, slotMinutes }) {
  const times = []
  for (let m = startHour * 60; m < endHour * 60; m += slotMinutes) times.push(m)
  const slotsPerDay = times.length
  return {
    title,
    kind,
    cols,
    times,
    slotMinutes,
    slotsPerDay,
    numDays: cols.length,
    numSlots: cols.length * slotsPerDay,
  }
}

// Cell (colIdx, timeIdx) → flat slot index, via the verified forward map.
export function cellSlot(grid, colIdx, timeIdx) {
  return gridIndex(grid.slotsPerDay, colIdx, timeIdx)
}

// Column header: { dow, num } where `num` is the big line. Dates show the
// weekday over the date number; weekdays show the weekday name as the big line.
export function colLabel(grid, colIdx) {
  if (grid.kind === "weekdays") return { dow: "", num: DOW[grid.cols[colIdx]] }
  const d = new Date(grid.cols[colIdx] + "T00:00:00")
  return { dow: DOW[d.getDay()], num: String(d.getDate()) }
}

export function timeLabel(grid, timeIdx) {
  const m = grid.times[timeIdx]
  let h = Math.floor(m / 60)
  const min = m % 60
  const ampm = h < 12 ? "AM" : "PM"
  h = h % 12
  if (h === 0) h = 12
  return min === 0 ? `${h} ${ampm}` : `${h}:${String(min).padStart(2, "0")} ${ampm}`
}

// Human label for a flat slot index (used in the best-slots summary).
export function slotLabel(grid, slot) {
  const colIdx = Math.floor(slot / grid.slotsPerDay)
  const timeIdx = slot % grid.slotsPerDay
  const { dow, num } = colLabel(grid, colIdx)
  const col = dow ? `${dow} ${num}` : num
  return `${col} · ${timeLabel(grid, timeIdx)}`
}
