import { useEffect, useRef } from "react"
import type { CSSProperties, PointerEvent } from "react"
import { cellSlot, colLabel, timeLabel, type Grid as GridModel } from "../gridShell"

type Mode = "paint" | "group"

interface GridProps {
  grid: GridModel
  mode: Mode
  row: boolean[] | null
  heatmap: number[]
  best: boolean[]
  peak: number
  onSetCell: (slot: number, value: boolean) => void
}

interface PaintState {
  active: boolean
  value: boolean
}

// The single grid. Paint mode: cells reflect `row` (the active participant's
// availability); drag to paint. Group mode: heatmap intensity + best-slot ring.
// Every value shown is supplied by verified functions via props — this
// component only renders and captures gestures.
export default function Grid({ grid, mode, row, heatmap, best, peak, onSetCell }: GridProps) {
  const paint = useRef<PaintState>({ active: false, value: false })

  useEffect(() => {
    const stop = () => (paint.current.active = false)
    window.addEventListener("pointerup", stop)
    return () => window.removeEventListener("pointerup", stop)
  }, [])

  const cols = `var(--time-col) repeat(${grid.numDays}, minmax(0, 1fr))`

  return (
    <div className="grid" style={{ gridTemplateColumns: cols }}>
      <div className="corner" />
      {grid.cols.map((_, d) => {
        const { dow, num } = colLabel(grid, d)
        return (
          <div key={d} className="dayhead">
            <span className="dow">{dow}</span>
            <span className="num">{num}</span>
          </div>
        )
      })}

      {grid.times.map((_, t) => (
        <Row
          key={t}
          grid={grid}
          t={t}
          mode={mode}
          row={row}
          heatmap={heatmap}
          best={best}
          peak={peak}
          paint={paint}
          onSetCell={onSetCell}
        />
      ))}
    </div>
  )
}

interface RowProps extends Omit<GridProps, "row"> {
  t: number
  row: boolean[] | null
  paint: { current: PaintState }
}

function Row({ grid, t, mode, row, heatmap, best, peak, paint, onSetCell }: RowProps) {
  return (
    <>
      <div className="timelabel">{timeLabel(grid, t)}</div>
      {grid.cols.map((_, d) => {
        const slot = cellSlot(grid, d, t)
        const count = heatmap[slot]

        const cls = ["cell"]
        let style: CSSProperties | undefined
        if (mode === "paint") {
          if (row && row[slot]) cls.push("on")
        } else {
          const intensity = peak > 0 ? count / peak : 0
          if (count > 0)
            style = {
              background: `rgba(99, 102, 241, ${0.12 + 0.78 * intensity})`,
              color: intensity > 0.55 ? "#fff" : "#3730a3",
            }
          if (best[slot]) cls.push("best")
        }

        const onDown =
          mode === "paint"
            ? (e: PointerEvent) => {
                e.preventDefault()
                const value = !(row && row[slot])
                paint.current = { active: true, value }
                onSetCell(slot, value)
              }
            : undefined
        const onEnter =
          mode === "paint"
            ? () => {
                if (paint.current.active) onSetCell(slot, paint.current.value)
              }
            : undefined

        return (
          <div key={d} className={cls.join(" ")} style={style} onPointerDown={onDown} onPointerEnter={onEnter}>
            {mode === "group" && count > 0 ? <span className="count">{count}</span> : null}
          </div>
        )
      })}
    </>
  )
}
