/* EMONITO interaction layer: map inspection, favorites, presets and ambient mode. */
const STORE = {
  favorites: 'emonito:favorites:v1',
  presets: 'emonito:layer-presets:v1',
  history: 'emonito:inspection-history:v1',
  thresholds: 'emonito:thresholds:v1'
};
const read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('[EMONITO] Local storage unavailable:', e.message); } };
const safe = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nfmt = (v, digits=1) => Number.isFinite(Number(v)) ? Number(v).toFixed(digits) : '—';

export function initEnhancements({ state }) {
  const $ = id => document.getElementById(id);
  const map = state.map;
  if (!map || !$('.map-wrap') || !$('.map-tools-row')) return;
  const tools = $('.map-tools-row');
  const controls = document.createElement('div');
  controls.className = 'emo-tools';
  controls.innerHTML = `
    <button type="button" id="emoFavorite" title="Сохранить выбранную точку">☆ Избранное</button>
    <select id="emoPreset" aria-label="Набор слоёв"><option value="default">Набор слоёв…</option><option value="weather">Погода</option><option value="space">Космос</option><option value="hazards">События</option></select>
    <button type="button" id="emoSavePreset">Сохранить набор</button>
    <button type="button" id="emoAmbient" aria-pressed="false">◉ Ambient</button>
    <button type="button" id="emoWake" aria-pressed="false">Экран: авто</button>
    <button type="button" id="emoApi" title="Настроить URL развёрнутого Edge Worker">Edge API</button>
    <span class="emo-freshness" id="emoFreshness" role="status">Проверка свежести…</span>`;
  tools.append(controls);

  const hud = document.createElement('section');
  hud.className = 'emo-inspector';
  hud.id = 'emoInspector';
  hud.hidden = true;
  hud.setAttribute('aria-live', 'polite');
  hud.innerHTML = `
    <div class="emo-inspector-head"><div><span class="emo-kicker">TAP TO INSPECT</span><strong id="emoCoords">—</strong></div><button type="button" id="emoClose" aria-label="Закрыть геосканер">×</button></div>
    <div class="emo-inspector-grid">
      <div><span>ТЕМПЕРАТУРА</span><strong id="emoTemp">—</strong></div>
      <div><span>ВЛАЖНОСТЬ</span><strong id="emoHumidity">—</strong></div>
      <div><span>AQI</span><strong id="emoAqi">—</strong></div>
      <div><span>ВЫСОТА</span><strong id="emoElevation">—</strong></div>
    </div>
    <p id="emoPointStatus">Получение данных…</p>
    <div class="emo-inspector-actions"><button type="button" id="emoAddFavorite">☆ Сохранить точку</button><button type="button" id="emoCopyCoords">Копировать координаты</button></div>
    <div class="emo-favorites"><strong>Избранные точки</strong><div id="emoFavoriteList"></div></div>
    <div class="emo-history"><strong>История сканирования</strong><div id="emoHistoryList"></div></div>`;
  $('.map-wrap').append(hud);

  let selected = state.location ? { latitude: Number(state.location.latitude), longitude: Number(state.location.longitude) } : null;
  let wakeLock = null;
  let ambient = false;
  let inspectSequence = 0;
  const presets = read(STORE.presets, {});
  const favorites = read(STORE.favorites, []);
  const history = read(STORE.history, []);
  const thresholds = Object.assign({ aqi: 100, uv: 8 }, read(STORE.thresholds, {}));

  function currentLayerState() {
    const result = {};
    document.querySelectorAll('[data-layer-toggle]').forEach(input => result[input.dataset.layerToggle] = input.checked);
    result.imageryMode = $('imageryMode')?.value || 'street';
    return result;
  }
  function applyLayerState(values) {
    if (!values) return;
    const imagery = $('imageryMode');
    if (imagery && values.imageryMode) { imagery.value = values.imageryMode; imagery.dispatchEvent(new Event('change', { bubbles: true })); }
    Object.entries(values).forEach(([key, enabled]) => {
      if (key === 'imageryMode') return;
      const input = document.querySelector('[data-layer-toggle="' + key + '"]');
      if (input && input.checked !== Boolean(enabled)) { input.checked = Boolean(enabled); input.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }
  function savePreset() {
    const name = window.prompt('Название набора слоёв');
    if (!name || !name.trim()) return;
    presets[name.trim().slice(0, 40)] = currentLayerState();
    write(STORE.presets, presets);
    renderPresetOptions(name.trim().slice(0, 40));
  }
  function renderPresetOptions(selectName) {
    const select = $('emoPreset');
    if (!select) return;
    [...select.querySelectorAll('option[data-custom]')].forEach(o => o.remove());
    Object.keys(presets).sort().forEach(name => {
      const option = document.createElement('option'); option.value = 'custom:' + name; option.textContent = name; option.dataset.custom = '1'; select.append(option);
    });
    if (selectName) select.value = 'custom:' + selectName;
  }
  function applyPreset(value) {
    if (value === 'weather') applyLayerState({ clouds: true, satellite: false, solarTerminator: true, quakes: false, events: false, iss: false, issTrail: false, transport: false, aircraft: false });
    else if (value === 'space') applyLayerState({ clouds: false, satellite: false, solarTerminator: true, quakes: false, events: false, iss: true, issTrail: true, transport: false, aircraft: false });
    else if (value === 'hazards') applyLayerState({ clouds: false, satellite: false, solarTerminator: false, quakes: true, events: true, iss: false, issTrail: false, transport: true, aircraft: false });
    else if (value.startsWith('custom:')) applyLayerState(presets[value.slice(7)]);
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }
  function renderFavorites() {
    const root = $('emoFavoriteList'); if (!root) return; root.replaceChildren();
    if (!favorites.length) { root.textContent = 'Нет сохранённых точек'; return; }
    favorites.slice(0, 8).forEach((item, index) => {
      const row = document.createElement('div'); row.className = 'emo-favorite-row';
      const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'emo-favorite-jump'; jump.textContent = item.name || (item.latitude.toFixed(2) + ', ' + item.longitude.toFixed(2));
      jump.addEventListener('click', () => { selected = { latitude: item.latitude, longitude: item.longitude }; map.setView([item.latitude, item.longitude], Math.max(map.getZoom(), 7)); inspect(selected); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Удалить точку');
      remove.addEventListener('click', () => { favorites.splice(index, 1); write(STORE.favorites, favorites); renderFavorites(); });
      row.append(jump, remove); root.append(row);
    });
  }
  function addFavorite(point = selected) {
    if (!point) { $('emoPointStatus').textContent = 'Сначала выберите точку на карте.'; return; }
    if (favorites.some(f => Math.abs(f.latitude - point.latitude) < .001 && Math.abs(f.longitude - point.longitude) < .001)) { $('emoPointStatus').textContent = 'Эта точка уже сохранена.'; return; }
    const name = window.prompt('Название точки (необязательно)', point.latitude.toFixed(3) + ', ' + point.longitude.toFixed(3));
    if (name === null) return;
    favorites.unshift({ name: name.trim().slice(0, 50), latitude: point.latitude, longitude: point.longitude, savedAt: Date.now() });
    favorites.splice(12);
    write(STORE.favorites, favorites); renderFavorites();
  }
  function renderHistory() {
    const root = $('emoHistoryList'); if (!root) return; root.replaceChildren();
    if (!history.length) { root.textContent = 'Сканирования появятся здесь'; return; }
    history.slice(0, 5).forEach(item => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'emo-history-item';
      button.textContent = item.latitude.toFixed(2) + ', ' + item.longitude.toFixed(2) + ' · ' + new Date(item.at).toLocaleTimeString();
      button.addEventListener('click', () => { selected = { latitude: item.latitude, longitude: item.longitude }; map.setView([item.latitude, item.longitude], Math.max(map.getZoom(), 7)); inspect(selected); });
      root.append(button);
    });
  }
  function workerUrlFor(raw) {
    let base = ''; try { base = (localStorage.getItem('emonito:edge-api-base') || '').trim(); if (base.endsWith('/')) base = base.slice(0, -1); } catch {}
    if (!base) return null;
    const source = new URL(raw); let route = null;
    if (source.hostname === 'api.open-meteo.com' && source.pathname.includes('/v1/forecast')) route = 'weather';
    else if (source.hostname === 'air-quality-api.open-meteo.com') route = 'air';
    else if (source.hostname === 'api.open-meteo.com' && source.pathname.includes('/v1/elevation')) route = 'elevation';
    else if (source.hostname === 'services.swpc.noaa.gov' && source.pathname.includes('xrays-6-hour')) route = 'xray';
    else if (source.hostname === 'services.swpc.noaa.gov' && source.pathname.includes('/products/alerts.json')) route = 'alerts';
    else if (source.hostname === 'warnung.bund.de' && source.pathname.includes('/mowas/')) route = 'mowas';
    else if (source.hostname === 'warnung.bund.de' && source.pathname.includes('/dwd/')) route = 'dwd';
    else if (source.hostname === 'www.smard.de' && source.pathname.endsWith('/index_hour.json')) route = 'smardIndex';
    else if (source.hostname === 'www.smard.de' && source.pathname.includes('_hour_')) { route = 'smardSeries'; const stamp = source.pathname.split('_hour_').pop().replace('.json', ''); if (stamp.length >= 10 && Number.isFinite(Number(stamp))) source.searchParams.set('timestamp', stamp); }
    if (!route) return null;
    return base + '/' + route + (source.searchParams.size ? '?' + source.searchParams.toString() : '');
  }
  async function json(url, signal) {
    const proxy = workerUrlFor(url);
    const response = await fetch(proxy || url, { signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error((proxy ? 'Edge API ' : 'HTTP ') + response.status);
    const payload = await response.json();
    return proxy && payload && Object.hasOwn(payload, 'data') ? Object.assign(payload.data, { __emonitoMeta: { fetchedAt: payload.fetchedAt, stale: payload.stale } }) : payload;
  }
  async function inspect(point) {
    if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return;
    selected = { latitude: point.latitude, longitude: point.longitude };
    state.location = selected;
    const seq = ++inspectSequence;
    const root = $('emoInspector'); root.hidden = false;
    $('emoCoords').textContent = selected.latitude.toFixed(4) + '°, ' + selected.longitude.toFixed(4) + '°';
    $('emoTemp').textContent = '…'; $('emoHumidity').textContent = '…'; $('emoAqi').textContent = '…'; $('emoElevation').textContent = '…';
    $('emoPointStatus').textContent = 'Загрузка данных открытых моделей…';
    // History is local to this browser; it is not a server-side archive.
    history.unshift({ ...selected, at: Date.now() }); history.splice(20);
    write(STORE.history, history); renderHistory();
    const params = new URLSearchParams({ latitude: String(selected.latitude), longitude: String(selected.longitude), current: 'temperature_2m,relative_humidity_2m,uv_index,precipitation' });
    const airParams = new URLSearchParams({ latitude: String(selected.latitude), longitude: String(selected.longitude), current: 'european_aqi,pm2_5,pm10' });
    const elevationParams = new URLSearchParams({ latitude: String(selected.latitude), longitude: String(selected.longitude) });
    const urls = [
      'https://api.open-meteo.com/v1/forecast?' + params,
      'https://air-quality-api.open-meteo.com/v1/air-quality?' + airParams,
      'https://api.open-meteo.com/v1/elevation?' + elevationParams
    ];
    const results = await Promise.allSettled(urls.map(url => json(url)));
    if (seq !== inspectSequence) return;
    const weather = results[0].status === 'fulfilled' ? results[0].value.current || {} : {};
    const air = results[1].status === 'fulfilled' ? results[1].value.current || {} : {};
    const elevation = results[2].status === 'fulfilled' ? results[2].value.elevation?.[0] : null;
    $('emoTemp').textContent = Number.isFinite(Number(weather.temperature_2m)) ? nfmt(weather.temperature_2m) + ' °C' : 'Н/Д';
    $('emoHumidity').textContent = Number.isFinite(Number(weather.relative_humidity_2m)) ? nfmt(weather.relative_humidity_2m, 0) + '%' : 'Н/Д';
    $('emoAqi').textContent = Number.isFinite(Number(air.european_aqi)) ? nfmt(air.european_aqi, 0) : 'Н/Д';
    $('emoElevation').textContent = Number.isFinite(Number(elevation)) ? nfmt(elevation, 0) + ' м' : 'Н/Д';
    const failures = results.filter(r => r.status === 'rejected').length;
    $('emoPointStatus').textContent = failures === 0 ? 'Модельные данные получены · ' + new Date().toLocaleTimeString() : failures + ' источник(а) недоступны; недостающие значения не подменены.';
    if (Number.isFinite(Number(air.european_aqi)) && Number(air.european_aqi) >= thresholds.aqi) notify('AQI достиг порога ' + thresholds.aqi + ': ' + nfmt(air.european_aqi, 0));
    if (Number.isFinite(Number(weather.uv_index)) && Number(weather.uv_index) >= thresholds.uv) notify('UV достиг порога ' + thresholds.uv + ': ' + nfmt(weather.uv_index, 1));
    renderFavorites();
  }
  function notify(message) {
    $('emoPointStatus').textContent = message;
    const key = 'emonito:last-alert:' + message;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch {}
    const alert = document.createElement('div'); alert.className = 'emo-inline-alert'; alert.textContent = '⚠ ' + message; $('emoInspector').prepend(alert);
    window.setTimeout(() => alert.remove(), 8000);
  }
  async function toggleWake(enable) {
    const button = $('emoWake');
    if (!enable) {
      try { await wakeLock?.release(); } catch {}
      wakeLock = null; button.textContent = 'Экран: авто'; button.setAttribute('aria-pressed', 'false'); return;
    }
    if (!('wakeLock' in navigator)) { button.textContent = 'Wake Lock недоступен'; button.setAttribute('aria-pressed', 'false'); return; }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      button.textContent = 'Экран: включён'; button.setAttribute('aria-pressed', 'true');
      wakeLock.addEventListener('release', () => { wakeLock = null; button.textContent = 'Экран: авто'; button.setAttribute('aria-pressed', 'false'); });
    } catch (error) { button.textContent = 'Wake Lock отказан'; button.setAttribute('aria-pressed', 'false'); console.warn('[EMONITO] Wake Lock unavailable:', error.message); }
  }
  function toggleAmbient(enable) {
    ambient = enable; document.body.classList.toggle('emo-ambient-mode', ambient);
    $('emoAmbient').setAttribute('aria-pressed', String(ambient));
    $('emoAmbient').textContent = ambient ? '× Выйти из Ambient' : '◉ Ambient';
    if (ambient) toggleWake(true); else toggleWake(false);
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }
  map.on('click', event => {
    // The legacy map module also creates a Leaflet popup; close it so the HUD remains the primary interaction.
    window.setTimeout(() => map.closePopup(), 0);
    inspect({ latitude: event.latlng.lat, longitude: event.latlng.lng });
  });
  $('emoClose').addEventListener('click', () => { $('emoInspector').hidden = true; });
  $('emoFavorite').addEventListener('click', () => addFavorite());
  $('emoAddFavorite').addEventListener('click', () => addFavorite());
  $('emoCopyCoords').addEventListener('click', async () => {
    if (!selected) return;
    const value = selected.latitude.toFixed(5) + ', ' + selected.longitude.toFixed(5);
    try { await navigator.clipboard.writeText(value); $('emoPointStatus').textContent = 'Координаты скопированы.'; }
    catch { $('emoPointStatus').textContent = value; }
  });
  $('emoPreset').addEventListener('change', e => applyPreset(e.target.value));
  $('emoSavePreset').addEventListener('click', savePreset);
  $('emoAmbient').addEventListener('click', () => toggleAmbient(!ambient));
  $('emoWake').addEventListener('click', () => toggleWake(!wakeLock));
  $('emoApi').addEventListener('click', () => {
    let current = ''; try { current = localStorage.getItem('emonito:edge-api-base') || ''; } catch {}
    const next = window.prompt('URL развёрнутого Cloudflare Worker (HTTPS). Пустое поле отключает прокси.', current);
    if (next === null) return;
    let cleaned = next.trim(); if (cleaned.endsWith('/')) cleaned = cleaned.slice(0, -1);
    if (cleaned && !cleaned.toLowerCase().startsWith('https://')) { window.alert('Нужен HTTPS URL.'); return; }
    try { if (cleaned) localStorage.setItem('emonito:edge-api-base', cleaned); else localStorage.removeItem('emonito:edge-api-base'); } catch {}
    $('emoApi').textContent = cleaned ? 'Edge API: ON' : 'Edge API';
    $('emoPointStatus').textContent = cleaned ? 'Прокси настроен. Запросы поддерживаемых источников идут через Worker.' : 'Прокси отключён; используются прямые публичные источники.';
  });
  try { if (localStorage.getItem('emonito:edge-api-base')) $('emoApi').textContent = 'Edge API: ON'; } catch {}
  $('mapLocate')?.addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(p => { const point = { latitude: p.coords.latitude, longitude: p.coords.longitude }; map.setView([point.latitude, point.longitude], 7); inspect(point); }, () => { $('emoPointStatus').textContent = 'Геолокация недоступна или запрещена.'; }, { timeout: 10000, maximumAge: 300000 });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ambient && !wakeLock) toggleWake(true); });
  renderFavorites(); renderHistory(); renderPresetOptions();
  const observed = ['mapStatus','weatherUpdated','airUpdated','kpUpdated','infraStatus','envStatus','spaceStatus'];
  const freshness = new Map();
  observed.forEach(id => {
    const node = $(id); if (!node) return;
    freshness.set(id, Date.now());
    new MutationObserver(() => freshness.set(id, Date.now())).observe(node, { childList: true, characterData: true, subtree: true });
  });
  function updateFreshness() {
    const now = Date.now();
    const entries = [...freshness.entries()].filter(([id]) => $(id)).map(([id, at]) => ({ id, age: Math.max(0, Math.floor((now-at)/1000)), status: $(id).textContent.trim() }));
    const recent = entries.filter(e => e.status && !/загруз|loading|init/i.test(e.status)).sort((a,b)=>a.age-b.age)[0];
    $('emoFreshness').textContent = recent ? 'СТАТУС ОБНОВЛЁН ' + recent.age + 'с · ' + recent.id : 'ОЖИДАНИЕ ДАННЫХ';
    $('emoFreshness').title = entries.map(e => e.id + ': ' + (e.status || '—') + ' (' + e.age + 'с)').join('\n');
  }
  updateFreshness(); window.setInterval(updateFreshness, 5000);
  window.addEventListener('beforeunload', () => { if (wakeLock) wakeLock.release().catch(() => {}); });
}
