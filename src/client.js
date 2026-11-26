// The page's script: day hover cards (mouse, keyboard and touch), the calendar's month buttons, and freshness (the
// "last checked" age, a warning when checks have stopped, and a reload when a newer check is published). The page is
// complete without it: every day carries its text as a `title`, and the current month is shown.
;(() => {
  const WORD = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage', maintenance: 'Maintenance', nodata: 'No data' }

  // ---- Day cards -------------------------------------------------------------------------------------------------
  const card = document.querySelector('[data-tip-card]')
  const days = [...document.querySelectorAll('[data-day]')]
  let shown = null
  if (card && days.length) {
    for (const day of days) day.removeAttribute('title') // the card replaces the browser's own tooltip
    const [dayEl, levelEl, detailEl] = ['[data-tip-day]', '[data-tip-level]', '[data-tip-detail]'].map((s) => card.querySelector(s))
    const hide = () => {
      shown?.classList.remove('active')
      shown = null
      card.hidden = true
    }
    const show = (el) => {
      if (shown === el) return
      shown?.classList.remove('active')
      shown = el
      dayEl.textContent = el.dataset.day
      levelEl.textContent = WORD[el.dataset.level] ?? ''
      levelEl.className = `tip-level level-${el.dataset.level}`
      detailEl.textContent = el.dataset.detail
      card.hidden = false
      const rect = el.getBoundingClientRect()
      const edge = 8
      const left = Math.max(edge, Math.min(document.documentElement.clientWidth - card.offsetWidth - edge, rect.left + rect.width / 2 - card.offsetWidth / 2))
      card.style.left = `${left + window.scrollX}px`
      card.style.top = `${rect.bottom + window.scrollY + 8}px`
      el.classList.add('active')
    }
    document.addEventListener('pointerover', (event) => {
      const el = event.target.closest?.('[data-day]')
      if (el) show(el)
      else if (event.pointerType === 'mouse') hide()
    })
    // A tap elsewhere, Escape, or scrolling away closes the card.
    document.addEventListener('pointerdown', (event) => !event.target.closest?.('[data-day]') && hide())
    document.addEventListener('keydown', (event) => event.key === 'Escape' && hide())
    window.addEventListener('scroll', hide, { passive: true })

    // A row of bars is one tab stop; the arrow keys walk its days, starting from today.
    for (const row of document.querySelectorAll('[data-bars]')) {
      const bars = [...row.children].filter((b) => b.offsetParent !== null)
      let at = bars.length - 1
      row.addEventListener('focus', () => row.matches(':focus-visible') && show(bars[at]))
      row.addEventListener('blur', hide)
      row.addEventListener('keydown', (event) => {
        const next = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: bars.length - 1 }[event.key]
        if (next === undefined) return
        event.preventDefault()
        at = Math.max(0, Math.min(bars.length - 1, next))
        show(bars[at])
      })
    }
    // A marked calendar day is focusable; focusing it shows its card.
    for (const cell of document.querySelectorAll('[data-tip]')) {
      const focusable = cell.querySelector('a, [tabindex]')
      focusable?.addEventListener('focus', () => focusable.matches(':focus-visible') && show(cell))
      focusable?.addEventListener('blur', hide)
    }
  }

  // ---- Calendar months -------------------------------------------------------------------------------------------
  const calendar = document.querySelector('[data-calendar]')
  if (calendar) {
    const months = [...calendar.querySelectorAll('.month')]
    const label = calendar.querySelector('[data-month-label]')
    const [prev, next] = [calendar.querySelector('[data-prev]'), calendar.querySelector('[data-next]')]
    let at = months.length - 1
    const show = (i) => {
      at = Math.max(0, Math.min(months.length - 1, i))
      months.forEach((month, j) => (month.hidden = j !== at))
      label.textContent = months[at].dataset.label
      prev.disabled = at === 0
      next.disabled = at === months.length - 1
    }
    prev.addEventListener('click', () => show(at - 1))
    next.addEventListener('click', () => show(at + 1))
    calendar.classList.add('js')
    show(at)
  }

  // ---- Freshness -------------------------------------------------------------------------------------------------
  for (const time of document.querySelectorAll('time[data-local]')) {
    const date = new Date(time.dateTime)
    if (!Number.isNaN(date.getTime())) time.textContent = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }
  const banner = document.querySelector('[data-checked]')
  const checkedAt = banner?.dataset.checked
  if (checkedAt) {
    const interval = Number(banner.dataset.interval) || 5
    // GitHub runs scheduled workflows late at busy times; only well past that is it worth saying so.
    const staleAfter = interval * 3 + 10
    const ago = document.querySelector('[data-ago]')
    const stale = document.querySelector('[data-stale]')
    const words = (minutes) => (minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} minute${minutes === 1 ? '' : 's'} ago` : `${Math.floor(minutes / 60)} hour${minutes < 120 ? '' : 's'} ago`)
    const tick = () => {
      const minutes = Math.floor((Date.now() - Date.parse(checkedAt)) / 60_000)
      if (ago) ago.textContent = ` (${words(minutes)})`
      if (stale) {
        stale.hidden = minutes <= staleAfter
        stale.querySelector('[data-stale-text]').textContent = `Our checks are delayed: the last one ran ${words(minutes)}, so this page may be out of date.`
      }
    }
    tick()
    setInterval(tick, 30_000)
    // When a newer check has been published, show it. Not while a card is open or the tab is in the background.
    setInterval(async () => {
      if (document.hidden || shown) return
      try {
        const latest = await (await fetch('status.json', { cache: 'no-store' })).json()
        if (latest.checkedAt && latest.checkedAt !== checkedAt) window.location.reload()
      } catch {
        // Offline, or the file is mid-publish: try again next time.
      }
    }, 60_000)
  }
})()
