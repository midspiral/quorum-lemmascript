// Shell-side grid labeling. The only piece of real logic here — the cell↔slot
// mapping — delegates to the *verified* gridIndex (src/grid.ts), which proves it
// is in-range and injective. Date/time formatting below is trusted display.

import { gridIndex } from "./grid"

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// Build grid metadata: `days` consecutive dates, each split [startHour,endHour)
// at `slotMinutes` granularity. numSlots === numDays * slotsPerDay.
export function buildGrid({ title, days, startHour, endHour, slotMinutes }) {
  const start = startOfToday()
  const dates = []
  for (let d = 0; d < days; d++) {
    const dt = new Date(start)
    dt.setDate(start.getDate() + d)
    dates.push(dt.toISOString().slice(0, 10))
  }
  const times = []
  for (let m = startHour * 60; m < endHour * 60; m += slotMinutes) times.push(m)
  const slotsPerDay = times.length
  return {
    title,
    dates,
    times,
    slotMinutes,
    slotsPerDay,
    numDays: dates.length,
    numSlots: dates.length * slotsPerDay,
  }
}

// Cell (dayIdx, timeIdx) → flat slot index, via the verified forward map.
export function cellSlot(grid, dayIdx, timeIdx) {
  return gridIndex(grid.slotsPerDay, dayIdx, timeIdx)
}

export function dayLabel(grid, dayIdx) {
  const d = new Date(grid.dates[dayIdx] + "T00:00:00")
  return { dow: DAY[d.getDay()], num: d.getDate() }
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
  const dayIdx = Math.floor(slot / grid.slotsPerDay)
  const timeIdx = slot % grid.slotsPerDay
  const { dow, num } = dayLabel(grid, dayIdx)
  return `${dow} ${num} · ${timeLabel(grid, timeIdx)}`
}
