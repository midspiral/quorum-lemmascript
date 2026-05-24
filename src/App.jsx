import { useEffect, useMemo, useState } from "react"
import { createEvent, loadStore, listEvents } from "./store"
import { useQuorum } from "./useQuorum"
import { slotLabel } from "./gridShell"
import { sparsify } from "./domain"
import Grid from "./components/Grid"

// ── hash routing: "#e=<id>" → event, else landing ──
function useRoute() {
  const read = () => new URLSearchParams(location.hash.slice(1)).get("e")
  const [id, setId] = useState(read)
  useEffect(() => {
    const on = () => setId(read())
    window.addEventListener("hashchange", on)
    return () => window.removeEventListener("hashchange", on)
  }, [])
  return id
}

const go = (id) => {
  location.hash = id ? `e=${id}` : ""
}

export default function App() {
  const id = useRoute()
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#" onClick={() => go(null)}>
          quorum
        </a>
        <span className="tag">the time that works · verified core</span>
      </header>
      {id ? <EventView id={id} /> : <Landing />}
    </div>
  )
}

// ─────────────────────────── Landing ───────────────────────────
function Landing() {
  const [title, setTitle] = useState("")
  const [days, setDays] = useState(5)
  const [startHour, setStartHour] = useState(9)
  const [endHour, setEndHour] = useState(17)
  const [slotMinutes, setSlotMinutes] = useState(60)
  const recent = listEvents()

  const valid = title.trim() && days >= 1 && endHour > startHour

  const create = () => {
    if (!valid) return
    const store = createEvent({ title: title.trim(), days, startHour, endHour, slotMinutes })
    go(store.id)
  }

  return (
    <main className="landing">
      <div className="hero">
        <h1>Find the time that works.</h1>
        <p className="sub">
          Pick a window, share the link, paint your availability. The best slot surfaces itself —
          and the heatmap, the recommendation, and the export are all backed by a formally verified
          core.
        </p>
      </div>

      <div className="card create">
        <label className="field">
          <span>Event name</span>
          <input
            autoFocus
            value={title}
            placeholder="Team sync"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
        </label>
        <div className="row3">
          <label className="field">
            <span>Days</span>
            <input type="number" min="1" max="14" value={days} onChange={(e) => setDays(+e.target.value)} />
          </label>
          <label className="field">
            <span>From</span>
            <select value={startHour} onChange={(e) => setStartHour(+e.target.value)}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>To</span>
            <select value={endHour} onChange={(e) => setEndHour(+e.target.value)}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Slot</span>
            <select value={slotMinutes} onChange={(e) => setSlotMinutes(+e.target.value)}>
              <option value={60}>1 hr</option>
              <option value={30}>30 min</option>
            </select>
          </label>
        </div>
        <button className="primary" disabled={!valid} onClick={create}>
          Create event
        </button>
      </div>

      {recent.length > 0 && (
        <div className="recent">
          <h3>Your events</h3>
          <ul>
            {recent.map((e) => (
              <li key={e.id}>
                <a href={`#e=${e.id}`}>{e.title || "Untitled"}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}

const hours = Array.from({ length: 25 }, (_, i) => i)
function hourLabel(h) {
  if (h === 0 || h === 24) return "12 AM"
  if (h === 12) return "12 PM"
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

// ────────────────────────── Event view ──────────────────────────
function EventView({ id }) {
  const store = useMemo(() => loadStore(id), [id])
  if (!store) return <NotFound />
  return <EventBody store={store} id={id} />
}

function EventBody({ store, id }) {
  const { grid, event, heatmap, best, peak, atLeast, actions } = useQuorum(store)
  const meKey = `quorum:me:${id}`
  const [me, setMe] = useState(() => localStorage.getItem(meKey))
  const [active, setActive] = useState(me)
  const [mode, setMode] = useState(me ? "paint" : "group")
  const [threshold, setThreshold] = useState(null)
  const [copied, setCopied] = useState(false)

  const n = event.participants.length
  const activeP = event.participants.find((p) => p.id === active)
  const bestSlots = best.map((b, s) => (b ? s : -1)).filter((s) => s >= 0)

  const join = (name) => {
    const pid = actions.join(name || "Me")
    localStorage.setItem(meKey, pid)
    setMe(pid)
    setActive(pid)
    setMode("paint")
  }

  const addPerson = () => {
    const name = prompt("Name of the person to add")
    if (name == null) return
    const pid = actions.join(name.trim() || "Guest")
    setActive(pid)
    setMode("paint")
  }

  const copyLink = () => {
    navigator.clipboard?.writeText(location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const exportData = () => downloadNDJSON(grid, event)

  return (
    <main className="event">
      <div className="ehead">
        <div>
          <h1>{event.title}</h1>
          <p className="people">
            {n === 0 ? "No one yet" : `${n} ${n === 1 ? "person" : "people"}`}
            {peak > 0 && <> · best slot has {peak}</>}
          </p>
        </div>
        <div className="ehead-actions">
          <button className="ghost" onClick={copyLink}>
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <button className="ghost" onClick={exportData} disabled={n === 0}>
            Export
          </button>
        </div>
      </div>

      {!me ? (
        <JoinPrompt onJoin={join} />
      ) : (
        <div className="toolbar">
          <div className="toggle">
            <button className={mode === "paint" ? "on" : ""} onClick={() => setMode("paint")}>
              Paint
            </button>
            <button className={mode === "group" ? "on" : ""} onClick={() => setMode("group")}>
              Group
            </button>
          </div>
          {mode === "paint" && (
            <div className="people-chips">
              {event.participants.map((p) => (
                <button
                  key={p.id}
                  className={`chip ${p.id === active ? "active" : ""}`}
                  onClick={() => setActive(p.id)}
                >
                  {p.name || "Unnamed"}
                  {p.id === me ? " (you)" : ""}
                </button>
              ))}
              <button className="chip add" onClick={addPerson}>
                + person
              </button>
            </div>
          )}
          {mode === "group" && n > 0 && (
            <label className="thresh">
              <span>show ≥</span>
              <input
                type="range"
                min="1"
                max={n}
                value={threshold ?? 1}
                onChange={(e) => setThreshold(+e.target.value)}
              />
              <span className="k">{threshold ?? "—"}</span>
            </label>
          )}
        </div>
      )}

      <Grid
        grid={grid}
        mode={me ? mode : "group"}
        row={activeP ? activeP.avail : null}
        heatmap={heatmap}
        best={best}
        peak={peak}
        threshold={mode === "group" ? threshold : null}
        onSetCell={(slot, value) => active && actions.setCell(active, slot, value)}
      />

      {mode === "group" && (
        <div className="summary">
          {bestSlots.length === 0 ? (
            <p className="muted">Paint some availability to see the best times.</p>
          ) : (
            <>
              <h3>★ Best {bestSlots.length === 1 ? "time" : "times"} ({peak} of {n})</h3>
              <ul className="bestlist">
                {bestSlots.map((s) => (
                  <li key={s}>{slotLabel(grid, s)}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </main>
  )
}

function JoinPrompt({ onJoin }) {
  const [name, setName] = useState("")
  return (
    <div className="card join">
      <label className="field">
        <span>Your name</span>
        <input
          autoFocus
          value={name}
          placeholder="e.g. Alex"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onJoin(name.trim())}
        />
      </label>
      <button className="primary" onClick={() => onJoin(name.trim())}>
        Join & paint
      </button>
    </div>
  )
}

function NotFound() {
  return (
    <main className="landing">
      <div className="card">
        <h3>Event not found on this device.</h3>
        <p className="muted">
          Quorum stores events locally for now. <a href="#">Create a new one →</a>
        </p>
      </div>
    </main>
  )
}

// NDJSON export uses the verified sparse codec (sparsify) for each row.
function downloadNDJSON(grid, event) {
  const lines = [
    JSON.stringify({
      type: "event",
      id: event.id,
      title: event.title,
      numSlots: event.numSlots,
      dates: grid.dates,
      times: grid.times,
      slotMinutes: grid.slotMinutes,
    }),
    ...event.participants.map((p) =>
      JSON.stringify({ type: "participant", id: p.id, name: p.name, slots: sparsify(p.avail) }),
    ),
  ]
  const blob = new Blob([lines.join("\n") + "\n"], { type: "application/x-ndjson" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `quorum-${event.id}.ndjson`
  a.click()
  URL.revokeObjectURL(url)
}
