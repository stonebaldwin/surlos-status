// The status page as one HTML string, from the history, the incidents and the config. No framework: the page must
// build and serve from anywhere, with nothing to break.
import { dayLevel, dayUptime, lastDays, overall, responseTime, uptime, worse } from './history.js'
import { incidentDays, sortIncidents } from './incidents.js'

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const longDay = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`
}
const monthLabel = (key) => `${MONTHS[Number(key.slice(5, 7)) - 1].slice(0, 3)} ${key.slice(0, 4)}`
const stamp = (iso) => `${longDay(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`

const LEVEL_WORD = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage', maintenance: 'Maintenance', nodata: 'No data' }

// Phosphor icons (regular weight), inlined so the page has no icon font or script to load.
const ICON = {
  operational: '<path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/>',
  warning: '<path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z"/>',
  nodata: '<path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z"/>',
  left: '<path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"/>',
  right: '<path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/>',
  rss: '<path d="M106.91,149.09A71.53,71.53,0,0,1,128,200a8,8,0,0,1-16,0,56,56,0,0,0-56-56,8,8,0,0,1,0-16A71.53,71.53,0,0,1,106.91,149.09ZM56,80a8,8,0,0,0,0,16A104,104,0,0,1,160,200a8,8,0,0,0,16,0A120,120,0,0,0,56,80Zm118.79,1.21A166.9,166.9,0,0,0,56,32a8,8,0,0,0,0,16A152,152,0,0,1,208,200a8,8,0,0,0,16,0A166.9,166.9,0,0,0,174.79,81.21ZM60,184a12,12,0,1,0,12,12A12,12,0,0,0,60,184Z"/>',
}
const icon = (name, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${ICON[name]}</svg>`
const levelIcon = (level) => icon(level === 'operational' ? 'operational' : level === 'nodata' ? 'nodata' : 'warning', `icon level-${level}`)

function dayDetail(day, level, incidents) {
  if (incidents.length) return incidents.map((i) => i.title).join('; ')
  if (level === 'nodata') return 'No checks ran'
  if (level === 'operational') return `All ${day.checks} checks passed`
  return `${day.failures} of ${day.checks} checks failed (${dayUptime(day)}% passed)`
}

/** Everything the page shows, worked out once: also what the tests assert on. */
export function buildModel({ site, components, history, incidents, now }) {
  const keys = lastDays(now, site.days)
  const sorted = sortIncidents(incidents)
  const open = sorted.filter((i) => !i.resolved)
  // Day -> component id ('*' when the incident names no component) -> incidents touching it.
  const byDay = new Map()
  for (const incident of sorted) {
    for (const key of incidentDays(incident, now)) {
      const slot = byDay.get(key) ?? byDay.set(key, []).get(key)
      slot.push(incident)
    }
  }
  const touching = (key, id) => (byDay.get(key) ?? []).filter((i) => i.components.length === 0 || i.components.includes(id))

  const rows = components.map((component) => {
    const days = history.components[component.id]?.days ?? {}
    const bars = keys.map((key) => {
      const hits = touching(key, component.id)
      const level = hits.reduce((acc, i) => worse(acc, i.impact), dayLevel(days[key]))
      return { key, level, detail: dayDetail(days[key], level, hits) }
    })
    const latest = history.latest.components[component.id]
    const openHere = open.filter((i) => i.components.length === 0 || i.components.includes(component.id))
    const now_ = openHere.length ? openHere[0].impact : !latest ? 'nodata' : latest.ok ? 'operational' : 'outage'
    return {
      ...component,
      bars,
      uptime: uptime(days, keys),
      responseMs: responseTime(days, keys),
      level: now_,
      since: keys.find((key) => (days[key]?.checks ?? 0) > 0) ?? null,
    }
  })
  // The first day any component has data for: the page says so when it is later than the window's start.
  const since = rows.map((r) => r.since).filter(Boolean).sort()[0] ?? null

  const calendar = keys.map((key) => ({
    key,
    level: rows.reduce((acc, row) => worse(acc, row.bars[keys.indexOf(key)].level), 'nodata'),
    incidents: (byDay.get(key) ?? []).map((i) => ({ id: i.id, title: i.title })),
  }))
  const recent = sorted.filter((i) => (i.resolved ?? now.toISOString()).slice(0, 10) >= keys[0])
  return { site, now, keys, rows, calendar, open, recent, since, headline: overall(history.latest, components, open), checkedAt: history.latest.checkedAt }
}

// A day's hover card reads these: the date, the level in words, and what happened. `title` is the same text for a
// browser without scripts; the page script removes it once the card works.
const tipAttrs = (key, level, detail) =>
  `data-day="${esc(longDay(key))}" data-level="${level}" data-detail="${esc(detail)}" title="${esc(`${longDay(key)}: ${detail}`)}"`

function barsHtml(row) {
  const summary = row.uptime === null ? 'No checks recorded yet' : `${row.uptime}% uptime over the last ${row.bars.length} days`
  return `<div class="bars" data-bars tabindex="0" role="group" aria-label="${esc(`${row.name}: ${summary}. Use the left and right arrow keys to read each day.`)}">${row.bars
    .map((b) => `<span class="bar level-${b.level}" ${tipAttrs(b.key, b.level, b.detail)}></span>`)
    .join('')}</div>`
}

function monthsHtml(model) {
  const months = [...new Set(model.keys.map((k) => k.slice(0, 7)))]
  const byKey = new Map(model.calendar.map((d) => [d.key, d]))
  const today = model.keys.at(-1)
  return months
    .map((month, index) => {
      const [y, m] = month.split('-').map(Number)
      const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7 // Monday first
      const cells = Array.from({ length: lead }, () => '<span class="cell empty"></span>')
      for (let d = 1; d <= count; d++) {
        const key = `${month}-${String(d).padStart(2, '0')}`
        const day = byKey.get(key)
        const marked = day && day.level !== 'operational' && day.level !== 'nodata'
        const detail = !day ? '' : day.incidents.length ? day.incidents.map((i) => i.title).join('; ') : day.level === 'nodata' ? 'No checks ran' : marked ? 'Some checks failed' : 'No issues'
        const tip = day ? ` data-tip ${tipAttrs(key, day.level, detail)}` : ''
        const date = `${d}${marked ? `<span class="sr"> ${esc(LEVEL_WORD[day.level])}</span>` : ''}`
        // A day with an incident links to it; any other marked day is focusable so its card can be read by keyboard.
        const inner = !marked
          ? `<span class="date">${date}</span>`
          : day.incidents.length
            ? `<a class="date ring level-${day.level}" href="#incident-${esc(day.incidents[0].id)}">${date}</a>`
            : `<span class="date ring level-${day.level}" tabindex="0">${date}</span>`
        cells.push(`<span class="cell${key > today ? ' future' : ''}${key === today ? ' today' : ''}"${tip}>${inner}</span>`)
      }
      // Fill out the last week, so the grid's lines close.
      while (cells.length % 7 !== 0) cells.push('<span class="cell empty"></span>')
      return `<div class="month" data-month="${month}" data-label="${esc(monthLabel(`${month}-01`))}"${index === months.length - 1 ? '' : ' hidden'}>${cells.join('')}</div>`
    })
    .join('')
}

function incidentHtml(incident) {
  const state = incident.resolved ? 'Resolved' : 'Ongoing'
  return `<article class="incident" id="incident-${esc(incident.id)}">
  <header><h3><a href="#incident-${esc(incident.id)}">${esc(incident.title)}</a></h3><p class="meta"><span class="pill level-${incident.resolved ? 'operational' : incident.impact}">${state}</span> ${esc(LEVEL_WORD[incident.impact])} · ${esc(stamp(incident.started))}</p></header>
  <ol class="updates">${[...incident.updates]
    .reverse()
    .map((u) => `<li><p class="when"><strong>${esc(u.label)}</strong> · <time datetime="${u.at}">${esc(stamp(u.at))}</time></p><p>${esc(u.text).replace(/\n{2,}/g, '</p><p>')}</p></li>`)
    .join('')}</ol>
</article>`
}

/** A window's label: its months, or the day history starts when that is later than the window does. */
function rangeLabel(model) {
  if (model.since && model.since > model.keys[0]) return `Since ${longDay(model.since)}`
  return `${monthLabel(model.keys[0])} to ${monthLabel(model.keys.at(-1))}`
}

export function renderPage(model) {
  const { site, rows, headline } = model
  const description = `Current status and uptime history for ${site.name}: ${headline.title}.`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(site.title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(site.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(site.url)}/">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="${esc(site.url)}/">
<link rel="icon" href="brand/surlos-favicon.svg" type="image/svg+xml">
<link rel="icon" href="brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="brand/apple-touch-icon-180.png">
<link rel="alternate" type="application/atom+xml" title="${esc(site.title)}" href="feed.xml">
<link rel="preload" href="fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="status.css">
<script src="status.js" defer></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="page">
<header class="top">
  <a class="lockup" href="${esc(site.home)}" aria-label="${esc(site.name)} home">
    <img class="logo light" src="brand/surlos-logo.svg" alt="${esc(site.name)}" width="96" height="18">
    <img class="logo dark" src="brand/surlos-logo-reversed.svg" alt="${esc(site.name)}" width="96" height="18">
    <span class="rule" aria-hidden="true"></span><span class="section">Status</span>
  </a>
  <nav class="actions" aria-label="Status page">
    ${site.reportUrl ? `<a class="button" href="${esc(site.reportUrl)}">Report a problem</a>` : ''}
    <a class="button" href="feed.xml">${icon('rss')}Subscribe<span class="sr"> to the incident feed</span></a>
  </nav>
</header>

<main id="main">
<section class="banner level-${headline.level}" aria-live="polite" data-checked="${esc(model.checkedAt ?? '')}" data-interval="${site.intervalMinutes}">
  <h1>${levelIcon(headline.level)}${esc(headline.title)}</h1>
  <p>${esc(headline.text)}</p>
</section>
<p class="notice level-degraded" data-stale hidden role="status">${icon('warning', 'icon level-degraded')}<span data-stale-text></span></p>

<section class="card" aria-labelledby="systems">
  <header class="card-head"><h2 id="systems">System status</h2><span class="muted range">${esc(rangeLabel(model))}</span></header>
  <ul class="systems">
    ${rows
      .map(
        (row) => `<li>
      <div class="system-head">
        <span class="system-name">${levelIcon(row.level)}<span>${esc(row.name)}</span>${row.level === 'operational' || row.level === 'nodata' ? '' : `<span class="state level-${row.level}">${esc(LEVEL_WORD[row.level])}</span>`}<span class="muted host">${esc(row.description)}</span></span>
        <span class="muted figures">${row.responseMs === null ? '' : `<span class="ms" title="Average response time of our checks over this period">${row.responseMs} ms</span>`}<span>${row.uptime === null ? 'No data yet' : `${row.uptime}% uptime`}</span></span>
      </div>
      ${barsHtml(row)}
    </li>`,
      )
      .join('\n    ')}
  </ul>
  <p class="legend muted"><span><i class="swatch level-operational"></i>Operational</span><span><i class="swatch level-degraded"></i>Degraded</span><span><i class="swatch level-outage"></i>Outage</span><span><i class="swatch level-maintenance"></i>Maintenance</span><span><i class="swatch level-nodata"></i>No data</span></p>
</section>

<section class="card" aria-labelledby="calendar" data-calendar>
  <header class="card-head">
    <h2 id="calendar">Calendar</h2>
    <span class="month-nav">
      <button type="button" data-prev aria-label="Previous month">${icon('left')}</button>
      <span class="muted" data-month-label aria-live="polite">${esc(monthLabel(model.keys.at(-1)))}</span>
      <button type="button" data-next aria-label="Next month">${icon('right')}</button>
    </span>
  </header>
  <div class="weekdays muted" aria-hidden="true"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
  ${monthsHtml(model)}
</section>

<section class="card" aria-labelledby="incidents">
  <header class="card-head"><h2 id="incidents">Incidents</h2><span class="muted">Last ${site.days} days</span></header>
  ${model.recent.length ? model.recent.map(incidentHtml).join('\n') : '<p class="empty-state muted">No incidents reported.</p>'}
</section>
</main>

<footer class="foot muted">
  <p>Checked every ${site.intervalMinutes} minutes from outside our own infrastructure.${model.checkedAt ? ` Last checked <time datetime="${model.checkedAt}" data-local>${esc(stamp(model.checkedAt))}</time><span data-ago></span>.` : ''}</p>
  <p class="foot-links"><a href="feed.xml">RSS</a><a href="status.json">JSON</a><a href="${esc(site.home)}">${esc(new URL(site.home).host)}</a></p>
</footer>
</div>
<div class="tip" data-tip-card role="status" aria-live="polite" hidden>
  <p class="tip-day" data-tip-day></p>
  <p class="tip-line"><span class="tip-level" data-tip-level></span></p>
  <p class="tip-detail" data-tip-detail></p>
</div>
</body>
</html>
`
}

/** The same state for programs: `status.json`, beside the page. The page script polls it to notice a newer check. */
export function renderJson(model) {
  return `${JSON.stringify(
    {
      status: model.headline.level,
      title: model.headline.title,
      checkedAt: model.checkedAt,
      components: model.rows.map((r) => ({ id: r.id, name: r.name, status: r.level, uptime: r.uptime === null ? null : Number(r.uptime), responseMs: r.responseMs })),
      incidents: model.open.map((i) => ({ id: i.id, title: i.title, impact: i.impact, started: i.started, components: i.components })),
    },
    null,
    2,
  )}\n`
}

/** An Atom feed of the incidents: what "Subscribe" gives a feed reader. */
export function renderFeed(model) {
  const { site } = model
  const updated = model.recent[0]?.updates.at(-1)?.at ?? model.recent[0]?.started ?? model.now.toISOString()
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(site.title)}</title>
  <id>${esc(site.url)}/</id>
  <link href="${esc(site.url)}/"/>
  <link rel="self" href="${esc(site.url)}/feed.xml"/>
  <updated>${updated}</updated>
  <author><name>${esc(site.name)}</name></author>
${model.recent
  .map(
    (i) => `  <entry>
    <title>${esc(i.title)}</title>
    <id>${esc(site.url)}/#incident-${esc(i.id)}</id>
    <link href="${esc(site.url)}/#incident-${esc(i.id)}"/>
    <updated>${i.updates.at(-1)?.at ?? i.started}</updated>
    <summary>${esc(`${LEVEL_WORD[i.impact]}, ${i.resolved ? 'resolved' : 'ongoing'}. ${i.updates.at(-1)?.text ?? ''}`)}</summary>
  </entry>`,
  )
  .join('\n')}
</feed>
`
}
