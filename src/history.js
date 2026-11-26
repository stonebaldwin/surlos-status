// The uptime history: per component, per UTC day, how many checks ran and how many failed. Pure functions; the
// checker writes the file and the page reads it.

/** @typedef {{ checks: number, failures: number }} Day */
/** @typedef {{ version: 1, components: Record<string, { days: Record<string, Day> }>, latest: { checkedAt: string | null, components: Record<string, { ok: boolean, detail: string }> } }} History */

/** @returns {History} */
export const emptyHistory = () => ({ version: 1, components: {}, latest: { checkedAt: null, components: {} } })

/** `2026-11-26` for a Date, in UTC. */
export const dayKey = (date) => date.toISOString().slice(0, 10)

/** The last `count` UTC day keys ending at `now`, oldest first. */
export function lastDays(now, count) {
  const out = []
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  for (let i = count - 1; i >= 0; i--) out.push(dayKey(new Date(start - i * 86_400_000)))
  return out
}

/**
 * Record one round of checks. `results` maps component id to `{ ok, detail }`. Days older than `keepDays` are dropped,
 * so the file stays small however long it runs.
 * @param {History} history
 */
export function record(history, results, now, keepDays = 400) {
  const today = dayKey(now)
  const oldest = lastDays(now, keepDays)[0]
  const components = { ...history.components }
  for (const [id, result] of Object.entries(results)) {
    const days = { ...(components[id]?.days ?? {}) }
    const day = days[today] ?? { checks: 0, failures: 0 }
    days[today] = { checks: day.checks + 1, failures: day.failures + (result.ok ? 0 : 1) }
    for (const key of Object.keys(days)) if (key < oldest) delete days[key]
    components[id] = { days }
  }
  return { version: 1, components, latest: { checkedAt: now.toISOString(), components: results } }
}

/** A day with at least this share of failed checks is an outage; any fewer failures make it degraded. */
export const OUTAGE_SHARE = 0.5

/** @returns {'operational' | 'degraded' | 'outage' | 'nodata'} */
export function dayLevel(day) {
  if (!day || day.checks === 0) return 'nodata'
  if (day.failures === 0) return 'operational'
  return day.failures / day.checks >= OUTAGE_SHARE ? 'outage' : 'degraded'
}

/** Uptime over `keys` as a percentage with two decimals (`'99.95'`), or null when no check ran in the window. */
export function uptime(days, keys) {
  let checks = 0
  let failures = 0
  for (const key of keys) {
    checks += days?.[key]?.checks ?? 0
    failures += days?.[key]?.failures ?? 0
  }
  if (checks === 0) return null
  // Floor, not round: 99.999% of a window with a failure in it must not read as 100.00.
  return (Math.floor(((checks - failures) / checks) * 10_000) / 100).toFixed(2)
}

const RANK = { nodata: 0, operational: 1, maintenance: 2, degraded: 3, outage: 4 }
/** The more serious of two levels. */
export const worse = (a, b) => (RANK[a] >= RANK[b] ? a : b)

/**
 * The page's headline, from the latest round and any incident still open.
 * @returns {{ level: 'operational' | 'degraded' | 'outage' | 'maintenance' | 'nodata', title: string, text: string }}
 */
export function overall(latest, componentList, openIncidents = []) {
  const incident = openIncidents[0]
  if (incident) return { level: incident.impact, title: incident.title, text: incident.updates.at(-1)?.text ?? '' }
  const states = componentList.map((c) => latest.components[c.id])
  if (!latest.checkedAt || states.some((s) => !s)) return { level: 'nodata', title: 'Waiting for the first check', text: 'No checks have run yet.' }
  const down = componentList.filter((c) => !latest.components[c.id].ok)
  if (down.length === 0) return { level: 'operational', title: 'All systems operational', text: 'We are not aware of any issues affecting our systems.' }
  const names = down.map((c) => c.name).join(', ')
  return down.length === componentList.length
    ? { level: 'outage', title: 'Major outage', text: `Our checks are failing for every system: ${names}.` }
    : { level: 'degraded', title: 'Partial outage', text: `Our checks are failing for ${names}.` }
}
