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
const dynamicKeys = new Set(['weather', 'air', 'elevation', 'smardSeries']);
function dynamicSource(key, url) {
  const q = url.searchParams;
  if (key === 'weather') return 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({ latitude: q.get('latitude') || '', longitude: q.get('longitude') || '', current: q.get('current') || 'temperature_2m,relative_humidity_2m,uv_index,precipitation', hourly: q.get('hourly') || '', daily: q.get('daily') || '', forecast_days: q.get('forecast_days') || '1', timezone: q.get('timezone') || 'auto' });
  if (key === 'air') return 'https://air-quality-api.open-meteo.com/v1/air-quality?' + new URLSearchParams({ latitude: q.get('latitude') || '', longitude: q.get('longitude') || '', current: q.get('current') || 'european_aqi,pm2_5,pm10', hourly: q.get('hourly') || '', forecast_days: q.get('forecast_days') || '1', timezone: q.get('timezone') || 'auto' });
  if (key === 'elevation') return 'https://api.open-meteo.com/v1/elevation?' + new URLSearchParams({ latitude: q.get('latitude') || '', longitude: q.get('longitude') || '' });
  if (key === 'smardSeries') { const stamp = q.get('timestamp') || ''; if (stamp.length < 10 || stamp.length > 16 || !Number.isFinite(Number(stamp))) throw new Error('invalid_timestamp'); return 'https://www.smard.de/app/chart_data/410/DE/410_DE_hour_' + stamp + '.json'; }
  return null;
}
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
    if (!Object.hasOwn(SOURCES, key) && !dynamicKeys.has(key)) return json({ error: 'not_found', available: ['xray','alerts','smardIndex','mowas','dwd','weather','air','elevation','smardSeries'] }, 404);
    let upstreamUrl = SOURCES[key];
    let snapshotKey = key;
    if (dynamicKeys.has(key)) {
      try { upstreamUrl = dynamicSource(key, url); } catch (error) { return json({ error: 'invalid_request', message: error.message }, 400); }
      if (!upstreamUrl || (['weather','air','elevation'].includes(key) && (!url.searchParams.has('latitude') || !url.searchParams.has('longitude')))) return json({ error: 'missing_coordinates' }, 400);
      snapshotKey = key + ':' + (url.searchParams.get('latitude') || '') + ':' + (url.searchParams.get('longitude') || '') + ':' + (url.searchParams.get('timestamp') || '');
    }
    const cacheKey = new Request(new URL('/__cache/' + encodeURIComponent(snapshotKey), url.origin));
    const edgeCache = caches.default;
    const cached = await edgeCache.match(cacheKey);
    if (cached) return cached;
    try {
      let snapshot = await readSnapshot(env, snapshotKey);
      if (!snapshot || Date.now() - snapshot.fetchedAt > TTL * 1000) snapshot = await fetchAndCache(env, snapshotKey, upstreamUrl);
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
