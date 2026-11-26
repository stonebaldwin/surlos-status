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

const slug = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
const minute = (date) => `${date.toISOString().slice(0, 16)}:00Z`

/** A new incident file: its name (`2026-11-26-api-errors.md`) and text, started now with one update. */
export function newIncident({ title, impact, components = [], message, label = impact === 'maintenance' ? 'Started' : 'Investigating' }, now) {
  if (!title?.trim()) throw new Error('An incident needs a title')
  if (!IMPACTS.includes(impact)) throw new Error(`impact must be one of ${IMPACTS.join(', ')}`)
  if (!message?.trim()) throw new Error('An incident needs a first update: what is happening, in a sentence')
  const at = minute(now)
  const lines = ['---', `title: ${title.trim()}`, `impact: ${impact}`]
  if (components.length) lines.push(`components: ${components.join(', ')}`)
  lines.push(`started: ${at}`, '---', `## ${at} ${label}`, message.trim(), '')
  return { name: `${at.slice(0, 10)}-${slug(title)}.md`, text: lines.join('\n') }
}

/** The file's text with one more update. `resolve` also closes the incident, which takes it off the top of the page. */
export function addUpdate(text, { label, message, resolve = false }, now, file = 'incident') {
  const incident = parseIncident(text, file) // a file that does not parse is not edited
  if (!message?.trim()) throw new Error('An update needs a message')
  if (resolve && incident.resolved) throw new Error(`${file} is already resolved`)
  const at = minute(now)
  let out = text.replace(/\r\n/g, '\n').trimEnd()
  if (resolve) out = out.replace(/\n---\n/, `\nresolved: ${at}\n---\n`)
  return `${out}\n\n## ${at} ${label ?? (resolve ? 'Resolved' : 'Update')}\n${message.trim()}\n`
}
