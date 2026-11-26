// Incidents are Markdown files in incidents/, one per incident, written by hand (see README.md):
//
//   ---
//   title: API errors on sign-in
//   impact: degraded            (outage | degraded | maintenance)
//   components: api, dashboard
//   started: 2026-11-26T20:05:00Z
//   resolved: 2026-11-26T21:10:00Z   (left out while the incident is open)
//   ---
//   ## 2026-11-26T20:05:00Z Investigating
//   Sign-in requests are failing for some agencies.
//
//   ## 2026-11-26T21:10:00Z Resolved
//   A bad deploy was rolled back.

const IMPACTS = ['outage', 'degraded', 'maintenance']

/** Parse one incident file. Throws with the file name on anything it cannot read, so a typo fails the build. */
export function parseIncident(text, file) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'))
  if (!match) throw new Error(`${file}: no front matter (--- … ---)`)
  const fields = Object.fromEntries(
    match[1]
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const at = line.indexOf(':')
        if (at === -1) throw new Error(`${file}: "${line}" is not "key: value"`)
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
      }),
  )
  const time = (key, required) => {
    if (!fields[key]) {
      if (required) throw new Error(`${file}: "${key}" is required`)
      return null
    }
    const date = new Date(fields[key])
    if (Number.isNaN(date.getTime())) throw new Error(`${file}: "${key}" is not a date (${fields[key]})`)
    return date.toISOString()
  }
  if (!fields.title) throw new Error(`${file}: "title" is required`)
  if (!IMPACTS.includes(fields.impact)) throw new Error(`${file}: "impact" must be one of ${IMPACTS.join(', ')}`)
  const updates = match[2]
    .split(/^## /m)
    .slice(1)
    .map((block) => {
      const [heading, ...body] = block.split('\n')
      const [stamp, ...label] = heading.trim().split(' ')
      const at = new Date(stamp)
      if (Number.isNaN(at.getTime())) throw new Error(`${file}: update heading "## ${heading}" must start with a date`)
      return { at: at.toISOString(), label: label.join(' ') || 'Update', text: body.join('\n').trim() }
    })
    .sort((a, b) => a.at.localeCompare(b.at))
  return {
    id: file.replace(/\.md$/, ''),
    title: fields.title,
    impact: fields.impact,
    components: (fields.components ?? '').split(',').map((c) => c.trim()).filter(Boolean),
    started: time('started', true),
    resolved: time('resolved', false),
    updates,
  }
}

/** Newest first. */
export const sortIncidents = (incidents) => [...incidents].sort((a, b) => b.started.localeCompare(a.started))

/** The UTC day keys an incident touches, from its start to its end (or to `now` while open). */
export function incidentDays(incident, now) {
  const end = new Date(incident.resolved ?? now)
  const out = []
  for (let t = Date.parse(incident.started.slice(0, 10)); t <= end.getTime(); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}
