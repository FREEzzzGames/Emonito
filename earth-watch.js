/* EMONITO: local environment, space-weather and infrastructure watch.
 * Public endpoints only; failures are shown as unavailable, never replaced with fabricated readings.
 */
export function initEarthWatch({ state }) {
  const $ = (id) => document.getElementById(id);
  const map = state.map;
  const fmt = (value, digits = 1) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—';
  const set = (id, value) => { const el = $(id); if (el) el.textContent = value == null ? '—' : String(value); };
  const mark = (id, label, error = false) => { const el = $(id); if (el) { el.textContent = label; el.className = 'status' + (error ? ' error' : ' ok'); } };
  const get = async (url) => {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  };
  let point = state.location || { latitude: 48.89, longitude: 8.70 };
  const coords = () => ({ latitude: Number(point.latitude), longitude: Number(point.longitude) });
  const showPoint = () => set('envPoint', fmt(point.latitude, 3) + '°, ' + fmt(point.longitude, 3) + '°');
  async function loadEnvironment() {
    const { latitude, longitude } = coords();
    showPoint();
    mark('envStatus', 'ЗАГРУЗКА');
    const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
    weatherUrl.search = new URLSearchParams({
      latitude, longitude, current: 'temperature_2m,relative_humidity_2m,precipitation,uv_index,wind_speed_10m',
      hourly: 'uv_index', daily: 'sunrise,sunset,uv_index_max', forecast_days: '1', timezone: 'auto'
    }).toString();
    const airUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    airUrl.search = new URLSearchParams({
      latitude, longitude,
      current: 'european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone',
      hourly: 'alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen',
      forecast_days: '1', timezone: 'auto'
    }).toString();
    const elevationUrl = new URL('https://api.open-meteo.com/v1/elevation');
    elevationUrl.search = new URLSearchParams({ latitude, longitude }).toString();
    const results = await Promise.allSettled([get(weatherUrl), get(airUrl), get(elevationUrl)]);
    const [weather, air, elevation] = results;
    if (weather.status === 'fulfilled') {
      const c = weather.value.current || {}, d = weather.value.daily || {};
      set('envTemp', fmt(c.temperature_2m, 1) + ' °C');
      set('envHumidity', fmt(c.relative_humidity_2m, 0) + ' %');
      set('envRain', fmt(c.precipitation, 1) + ' mm');
      set('envUv', fmt(c.uv_index, 1));
      set('envWind', fmt(c.wind_speed_10m, 1) + ' km/h');
      set('envUvMax', 'UV max: ' + fmt(d.uv_index_max?.[0], 1));
      set('envSun', (d.sunrise?.[0] ? new Date(d.sunrise[0]).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—') + ' / ' + (d.sunset?.[0] ? new Date(d.sunset[0]).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'));
    } else {
      ['envTemp','envHumidity','envRain','envUv','envWind','envUvMax','envSun'].forEach(id => set(id, 'Недоступно'));
    }
    if (air.status === 'fulfilled') {
      const c = air.value.current || {}, hourly = air.value.hourly || {};
      set('envAqi', c.european_aqi == null ? '—' : c.european_aqi);
      set('envPm25', fmt(c.pm2_5, 1) + ' µg/m³');
      set('envPm10', fmt(c.pm10, 1) + ' µg/m³');
      set('envNo2', fmt(c.nitrogen_dioxide, 1) + ' µg/m³');
      set('envOzone', fmt(c.ozone, 1) + ' µg/m³');
      const pollenNames = [['alder_pollen','Ольха'],['birch_pollen','Берёза'],['grass_pollen','Злаки'],['mugwort_pollen','Полынь'],['ragweed_pollen','Амброзия']];
      const pollen = pollenNames.map(([key, name]) => {
        const values = hourly[key] || [];
        const next = values.find(v => Number.isFinite(Number(v)));
        return name + ': ' + (next == null ? '—' : fmt(next, 0) + ' grains/m³');
      });
      set('envPollen', pollen.join(' · '));
      set('envAirTime', 'Время источника: ' + (c.time || 'не указано'));
    } else {
      ['envAqi','envPm25','envPm10','envNo2','envOzone','envPollen'].forEach(id => set(id, 'Недоступно'));
      set('envAirTime', 'Источник качества воздуха недоступен');
    }
    if (elevation.status === 'fulfilled' && Array.isArray(elevation.value.elevation)) set('envElevation', fmt(elevation.value.elevation[0], 0) + ' m');
    else set('envElevation', 'Недоступно');
    const ok = results.some(r => r.status === 'fulfilled');
    mark('envStatus', ok ? 'ИСТОЧНИКИ ОТВЕТИЛИ' : 'НЕТ ДАННЫХ', !ok);
  }
  async function loadSpaceWatch() {
    mark('flareStatus', 'ЗАГРУЗКА');
    const url = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json';
    try {
      const data = await get(url);
      const rows = (Array.isArray(data) ? data : []).filter(row => Number.isFinite(Number(row.flux)) && row.energy === '0.1-0.8nm');
      const latest = rows.at(-1);
      if (!latest) throw new Error('NOAA returned no X-ray flux');
      const flux = Number(latest.flux);
      const cls = flux >= 1e-4 ? 'X' : flux >= 1e-5 ? 'M' : flux >= 1e-6 ? 'C' : flux >= 1e-7 ? 'B' : 'A';
      const exponent = Math.floor(Math.log10(Math.max(flux, 1e-12)));
      set('flareClass', cls + (flux / Math.pow(10, exponent)).toFixed(1));
      set('flareFlux', flux.toExponential(2) + ' W/m² · ' + (latest.time_tag || 'время не указано'));
      const peak = rows.slice(-60).reduce((best, row) => Number(row.flux) > Number(best.flux) ? row : best, rows.at(-1));
      set('flarePeak', 'Максимум в доступном срезе: ' + Number(peak.flux).toExponential(2) + ' W/m²');
      mark('flareStatus', 'NOAA GOES · РЕНТГЕН', false);
    } catch (error) {
      set('flareClass', '—'); set('flareFlux', 'Данные NOAA недоступны: ' + error.message); set('flarePeak', 'Без подтверждённых измерений');
      mark('flareStatus', 'НЕТ ДАННЫХ', true);
    }
    mark('spaceAlertsStatus', 'ЗАГРУЗКА');
    try {
      const alerts = await get('https://services.swpc.noaa.gov/products/alerts.json');
      const rows = Array.isArray(alerts) ? alerts.slice(1).filter(row => Array.isArray(row) && row.length >= 3).slice(-8).reverse() : [];
      const list = $('spaceAlerts'); list.replaceChildren();
      if (!rows.length) throw new Error('Нет сообщений в ответе');
      rows.forEach(row => {
        const li = document.createElement('li'); li.className = 'data-row';
        const left = document.createElement('div'); left.className = 'row-main';
        const title = document.createElement('div'); title.className = 'row-title'; title.textContent = row[1] || 'NOAA SWPC alert';
        const detail = document.createElement('div'); detail.className = 'row-detail'; detail.textContent = row[0] || 'Время не указано';
        const body = document.createElement('div'); body.className = 'row-detail'; body.textContent = String(row[2] || '').slice(0, 220);
        left.append(title, detail, body); li.append(left); list.append(li);
      });
      mark('spaceAlertsStatus', 'NOAA · ' + rows.length + ' СООБЩ.', false);
    } catch (error) {
      const list = $('spaceAlerts'); list.replaceChildren(); const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Оповещения NOAA недоступны: ' + error.message; list.append(li);
      mark('spaceAlertsStatus', 'НЕТ ДАННЫХ', true);
    }
  }
  async function loadInfrastructure() {
    mark('infraStatus', 'ПРОВЕРКА ИСТОЧНИКОВ');
    const checks = [
      { name: 'SMARD · энергосистема Германии', detail: 'Публичные графики нагрузки, производства и биржевых цен; это не карта аварийных отключений.', url: 'https://www.smard.de/home' },
      { name: 'Bundesnetzagentur · Stromversorgung', detail: 'Официальная информация о надёжности и состоянии электроснабжения.', url: 'https://www.bundesnetzagentur.de/EN/Areas/Energy/Companies/SecurityOfSupply/start.html' },
      { name: 'Deutsche Bahn · актуальные сообщения', detail: 'Ограничения и нарушения движения; актуальность зависит от выбранного региона и доступности сервиса.', url: 'https://www.bahn.de/service/fahrplaene/aktuell' },
      { name: 'Autobahn GmbH · дорожная обстановка', detail: 'Работы, закрытия и дорожные сообщения на федеральных автомагистралях.', url: 'https://www.autobahn.de/die-autobahn/verkehrsmeldungen' },
      { name: 'NINA · предупреждения гражданской защиты', detail: 'Официальные предупреждения и опасные ситуации в Германии.', url: 'https://warnung.bund.de/' }
    ];
    const list = $('infraSources'); list.replaceChildren();
    checks.forEach(item => {
      const li = document.createElement('li'); li.className = 'data-row';
      const left = document.createElement('div'); left.className = 'row-main';
      const title = document.createElement('a'); title.className = 'row-title'; title.textContent = item.name; title.href = item.url; title.target = '_blank'; title.rel = 'noopener noreferrer';
      const detail = document.createElement('div'); detail.className = 'row-detail'; detail.textContent = item.detail;
      left.append(title, detail); li.append(left); list.append(li);
    });
    set('infraCoverage', '5 официальных/публичных источников');
    set('infraNotice', 'Пока подключён каталог первоисточников, а не единый live-поток аварий. Статус аварии не выводится без машинно-читаемого подтверждения.');
    mark('infraStatus', 'КАТАЛОГ ИСТОЧНИКОВ', false);
  }
  function usePoint(next) {
    if (!next || !Number.isFinite(Number(next.latitude)) || !Number.isFinite(Number(next.longitude))) return;
    point = { latitude: Number(next.latitude), longitude: Number(next.longitude) };
    state.location = point;
    showPoint(); loadEnvironment();
  }
  $('envUseMap')?.addEventListener('click', () => {
    if (state.location) usePoint(state.location);
    else set('envAirTime', 'Сначала нажмите на точку карты.');
  });
  $('envLocate')?.addEventListener('click', () => {
    if (!navigator.geolocation) { set('envAirTime', 'Геолокация не поддерживается этим браузером.'); return; }
    navigator.geolocation.getCurrentPosition(p => usePoint({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      e => set('envAirTime', e.code === 1 ? 'Доступ к геолокации запрещён.' : 'Не удалось определить местоположение.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });
  $('envRefresh')?.addEventListener('click', loadEnvironment);
  $('flareRefresh')?.addEventListener('click', loadSpaceWatch);
  $('infraRefresh')?.addEventListener('click', loadInfrastructure);
  map?.on('click', event => {
    // The map module updates state.location on the same click; use the clicked point explicitly.
    usePoint({ latitude: event.latlng.lat, longitude: event.latlng.lng });
  });
  showPoint();
  loadEnvironment(); loadSpaceWatch(); loadInfrastructure();
  window.setInterval(loadSpaceWatch, 5 * 60 * 1000);
  window.setInterval(loadEnvironment, 10 * 60 * 1000);
}
