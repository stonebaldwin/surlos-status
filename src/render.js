// The status page as one HTML string, from the history, the incidents and the config. No framework: the page must
// build and serve from anywhere, with nothing to break.
import { dayLevel, lastDays, overall, uptime, worse } from './history.js'
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
  if (level === 'nodata') return 'No data'
  if (level === 'operational') return 'No downtime recorded'
  return `${day.failures} of ${day.checks} checks failed`
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
    return { ...component, bars, uptime: uptime(days, keys), level: now_ }
  })

  const calendar = keys.map((key) => ({
    key,
    level: rows.reduce((acc, row) => worse(acc, row.bars[keys.indexOf(key)].level), 'nodata'),
    incidents: (byDay.get(key) ?? []).map((i) => i.title),
  }))
  const recent = sorted.filter((i) => (i.resolved ?? now.toISOString()).slice(0, 10) >= keys[0])
  return { site, now, keys, rows, calendar, open, recent, headline: overall(history.latest, components, open), checkedAt: history.latest.checkedAt }
}

function barsHtml(row) {
  const label = row.uptime === null ? 'No checks recorded yet' : `${row.uptime}% uptime over the last ${row.bars.length} days`
  return `<div class="bars" role="img" aria-label="${esc(label)}">${row.bars
    .map((b) => `<span class="bar level-${b.level}" title="${esc(`${longDay(b.key)}: ${b.detail}`)}"></span>`)
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
        const detail = !day ? (key > today ? '' : 'Before this page kept history') : day.incidents.length ? day.incidents.join('; ') : LEVEL_WORD[day.level]
        cells.push(
          `<span class="cell${key > today ? ' future' : ''}${key === today ? ' today' : ''}"${detail ? ` title="${esc(`${longDay(key)}: ${detail}`)}"` : ''}>` +
            `<span class="date${marked ? ` ring level-${day.level}` : ''}">${d}</span>${marked ? `<span class="sr">${esc(LEVEL_WORD[day.level])}</span>` : ''}</span>`,
        )
      }
      // Fill out the last week, so the grid's lines close.
      while (cells.length % 7 !== 0) cells.push('<span class="cell empty"></span>')
      return `<div class="month" data-month="${month}" data-label="${esc(monthLabel(`${month}-01`))}"${index === months.length - 1 ? '' : ' hidden'}>${cells.join('')}</div>`
    })
    .join('')
}

function incidentHtml(incident) {
  const state = incident.resolved ? 'Resolved' : 'Ongoing'
  return `<article class="incident">
  <header><h3>${esc(incident.title)}</h3><p class="meta"><span class="pill level-${incident.resolved ? 'operational' : incident.impact}">${state}</span> ${esc(LEVEL_WORD[incident.impact])} · ${esc(stamp(incident.started))}</p></header>
  <ol class="updates">${[...incident.updates]
    .reverse()
    .map((u) => `<li><p class="when"><strong>${esc(u.label)}</strong> · <time datetime="${u.at}">${esc(stamp(u.at))}</time></p><p>${esc(u.text).replace(/\n{2,}/g, '</p><p>')}</p></li>`)
    .join('')}</ol>
</article>`
}

const SCRIPT = `(() => {
  const cal = document.querySelector('[data-calendar]')
  if (cal) {
    const months = [...cal.querySelectorAll('.month')]
    const label = cal.querySelector('[data-month-label]')
    const [prev, next] = [cal.querySelector('[data-prev]'), cal.querySelector('[data-next]')]
    let at = months.length - 1
    const show = (i) => {
      at = Math.max(0, Math.min(months.length - 1, i))
      months.forEach((m, j) => (m.hidden = j !== at))
      label.textContent = months[at].dataset.label
      prev.disabled = at === 0
      next.disabled = at === months.length - 1
    }
    prev.addEventListener('click', () => show(at - 1))
    next.addEventListener('click', () => show(at + 1))
    cal.classList.add('js')
    show(at)
  }
  for (const t of document.querySelectorAll('time[data-local]')) {
    const d = new Date(t.dateTime)
    if (!Number.isNaN(d.getTime())) t.textContent = d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }
})()`

export function renderPage(model) {
  const { site, rows, headline } = model
  const range = `${monthLabel(model.keys[0])} to ${monthLabel(model.keys.at(-1))}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(site.title)}</title>
<meta name="description" content="${esc(`Current status and uptime history for ${site.name}: ${headline.title}.`)}">
<link rel="icon" href="brand/surlos-favicon.svg" type="image/svg+xml">
<link rel="icon" href="brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="alternate" type="application/atom+xml" title="${esc(site.title)}" href="feed.xml">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="status.css">
</head>
<body>
<div class="page">
<header class="top">
  <a class="lockup" href="${esc(site.home)}" aria-label="${esc(site.name)} home">
    <img class="logo light" src="brand/surlos-logo.svg" alt="${esc(site.name)}" width="96" height="18">
    <img class="logo dark" src="brand/surlos-logo-reversed.svg" alt="${esc(site.name)}" width="96" height="18">
    <span class="rule" aria-hidden="true"></span><span class="section">Status</span>
  </a>
  <nav class="actions" aria-label="Status page">
    ${site.reportUrl ? `<a class="button" href="${esc(site.reportUrl)}">Report a problem</a>` : ''}
    <a class="button" href="feed.xml">${icon('rss')}Subscribe</a>
  </nav>
</header>

<main>
<section class="banner level-${headline.level}" aria-live="polite">
  <h1>${levelIcon(headline.level)}${esc(headline.title)}</h1>
  <p>${esc(headline.text)}</p>
</section>

<section class="card" aria-labelledby="systems">
  <header class="card-head"><h2 id="systems">System status</h2><span class="muted range-90">${esc(range)}</span></header>
  <ul class="systems">
    ${rows
      .map(
        (row) => `<li>
      <div class="system-head">
        <span class="system-name">${levelIcon(row.level)}<span>${esc(row.name)}</span><span class="muted host">${esc(row.description)}</span></span>
        <span class="muted">${row.uptime === null ? 'No data yet' : `${row.uptime}% uptime`}</span>
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
  <p>Checked every ${site.intervalMinutes} minutes from outside our own infrastructure.${model.checkedAt ? ` Last checked <time datetime="${model.checkedAt}" data-local>${esc(stamp(model.checkedAt))}</time>.` : ''}</p>
  <p><a href="${esc(site.home)}">${esc(new URL(site.home).host)}</a></p>
</footer>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`
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
    <id>${esc(site.url)}/#${esc(i.id)}</id>
    <link href="${esc(site.url)}/"/>
    <updated>${i.updates.at(-1)?.at ?? i.started}</updated>
    <summary>${esc(`${LEVEL_WORD[i.impact]}, ${i.resolved ? 'resolved' : 'ongoing'}. ${i.updates.at(-1)?.text ?? ''}`)}</summary>
  </entry>`,
  )
  .join('\n')}
</feed>
`
}
