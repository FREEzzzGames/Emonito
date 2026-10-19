/* EMONITO edge API. Public data only; no secrets. Deploy separately from GitHub Pages.
 * KV-backed snapshots make scheduled refresh independent of visitor traffic.
 */
const SOURCES = {
  xray: 'https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json',
  alerts: 'https://services.swpc.noaa.gov/products/alerts.json',
  smardIndex: 'https://www.smard.de/app/chart_data/410/DE/index_hour.json',
  mowas: 'https://warnung.bund.de/api31/mowas/mapData.json',
  dwd: 'https://warnung.bund.de/api31/dwd/mapData.json'
};
const TTL = 600;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'public, max-age=30' };
const json = (body, status=200, extra={}) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
async function upstream(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'EMONITO-open-data-monitor/1.0' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('upstream HTTP ' + response.status);
  return response.json();
}
async function readSnapshot(env, key) {
  if (!env.EMO_CACHE) return null;
  const raw = await env.EMO_CACHE.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function saveSnapshot(env, key, data) {
  if (env.EMO_CACHE) await env.EMO_CACHE.put(key, JSON.stringify({ fetchedAt: Date.now(), data }), { expirationTtl: TTL * 6 });
}
async function fetchAndCache(env, key, url) {
  try {
    const data = await upstream(url);
    await saveSnapshot(env, key, data);
    return { fetchedAt: Date.now(), data, stale: false };
  } catch (error) {
    const old = await readSnapshot(env, key);
    if (old) return { ...old, stale: true, error: error.message };
    throw error;
  }
}
async function refreshAll(env) {
  const jobs = Object.entries(SOURCES).map(async ([key, url]) => {
    try { await fetchAndCache(env, key, url); return { key, ok: true }; }
    catch (error) { return { key, ok: false, error: error.message }; }
  });
  return Promise.all(jobs);
}
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ service: 'EMONITO Edge API', status: 'ok', cache: Boolean(env.EMO_CACHE), timestamp: new Date().toISOString() });
    if (url.pathname === '/api/refresh') {
      const auth = request.headers.get('Authorization');
      if (!env.REFRESH_TOKEN || auth !== 'Bearer ' + env.REFRESH_TOKEN) return json({ error: 'unauthorized' }, 401);
      return json({ results: await refreshAll(env) });
    }
    const key = url.pathname.replace(/^\/+/, '');
    if (!Object.hasOwn(SOURCES, key)) return json({ error: 'not_found', available: ['xray','alerts','smardIndex','mowas','dwd'] }, 404);
    const cacheKey = new Request(new URL('/__cache/' + key, url.origin));
    const edgeCache = caches.default;
    const cached = await edgeCache.match(cacheKey);
    if (cached) return cached;
    try {
      let snapshot = await readSnapshot(env, key);
      if (!snapshot || Date.now() - snapshot.fetchedAt > TTL * 1000) snapshot = await fetchAndCache(env, key, SOURCES[key]);
      const response = json({ ...snapshot, stale: Boolean(snapshot.stale) }, 200, { 'Cache-Control': 'public, max-age=30, s-maxage=60' });
      if (!snapshot.stale) ctx.waitUntil(edgeCache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      return json({ error: 'upstream_unavailable', message: error.message }, 502);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshAll(env));
  }
};
