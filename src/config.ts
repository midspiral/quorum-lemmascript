// Backend is opt-in: the pure-local SPA runs with `vite dev` (REMOTE off); the
// Worker build sets VITE_REMOTE=1 so the same UI talks to the Durable Object.
export const REMOTE = (import.meta as any).env?.VITE_REMOTE === "1"

export function wsUrl(id: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${location.host}/api/events/${encodeURIComponent(id)}/ws`
}
