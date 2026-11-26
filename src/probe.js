// One uptime check: fetch each of a component's probes and compare the HTTP status with what "up" looks like.

const TIMEOUT_MS = 10_000
const RETRY_DELAY_MS = 3_000

async function probeOnce(probe, fetchImpl) {
  const started = Date.now()
  try {
    const response = await fetchImpl(probe.url, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': 'surlos-status/1 (+https://status.surlos.com)', ...probe.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // Drain the body so the connection closes cleanly; its content is not checked.
    await response.arrayBuffer().catch(() => {})
    const ok = probe.expect.includes(response.status)
    const ms = Date.now() - started
    return { ok, ms, detail: ok ? `${response.status} in ${ms}ms` : `${probe.url} answered ${response.status}, expected ${probe.expect.join(' or ')}` }
  } catch (error) {
    const reason = error?.name === 'TimeoutError' ? `no answer in ${TIMEOUT_MS / 1000}s` : (error?.cause?.code ?? error?.message ?? 'request failed')
    return { ok: false, ms: null, detail: `${probe.url}: ${reason}` }
  }
}

/**
 * A component is up when every probe is. A failed probe is tried once more after a pause, so one dropped connection
 * between the checker and the site is not recorded as downtime. `ms` is the slowest probe's response time when up.
 */
export async function checkComponent(component, { fetchImpl = fetch, retryDelayMs = RETRY_DELAY_MS } = {}) {
  let slowest = 0
  for (const probe of component.probes) {
    let result = await probeOnce(probe, fetchImpl)
    if (!result.ok) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      result = await probeOnce(probe, fetchImpl)
    }
    if (!result.ok) return { ok: false, ms: null, detail: result.detail }
    slowest = Math.max(slowest, result.ms)
  }
  return { ok: true, ms: slowest, detail: 'ok' }
}
