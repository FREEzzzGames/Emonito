/* Satellite Pass & Footprint visualizer. Orbit states are propagated from public TLE/GP elements. */
export function initSatelliteIntercept({ state }) {
  const $ = (id) => document.getElementById(id);
  const map = state.map;
  if (!map || !window.L) return;
  const L = window.L;
  const layer = L.layerGroup().addTo(map);
  const trackLayer = L.layerGroup().addTo(map);
  const footprintLayer = L.layerGroup().addTo(map);
  const ui = {
    category: $('satelliteCategory'),
    reload: $('satelliteReload'),
    locate: $('satelliteUseLocation'),
    lock: $('satelliteLock'),
    status: $('satelliteInterceptStatus'),
    target: $('satelliteTarget'),
    name: $('satelliteTargetName'),
    position: $('satelliteTargetPosition'),
    altitude: $('satelliteTargetAltitude'),
    speed: $('satelliteTargetSpeed'),
    elevation: $('satelliteTargetElevation'),
    pass: $('satelliteNextPass'),
    age: $('satelliteTleAge'),
    count: $('satelliteCatalogCount'),
    passes: $('satellitePassList'),
    footprint: $('satelliteFootprintToggle'),
    trail: $('satelliteTrailToggle')
  };
  if (!ui.category || !ui.target) return;

  const groups = {
    stations: { label: 'Станции и пилотируемые', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle' },
    starlink: { label: 'Starlink', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle' },
    weather: { label: 'Погодные / NOAA', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle' },
    resource: { label: 'Дистанционное зондирование', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=resource&FORMAT=tle' },
    visual: { label: 'Яркие спутники', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle' }
  };
  const EARTH_RADIUS_KM = 6371;
  let satelliteLib = null;
  let catalog = [];
  let selected = null;
  let timer = 0;
  let locked = false;
  let lastCenter = null;
  let observer = state.location || { latitude: 48.89, longitude: 8.70 };
  let marker = null;
  let passRequest = 0;

  const setStatus = (message, mode = '') => {
    if (!ui.status) return;
    ui.status.textContent = message;
    ui.status.className = 'status ' + mode;
  };
  const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const getPosition = (sat, date = new Date()) => {
    if (!satelliteLib || !sat?.satrec) return null;
    const pv = satelliteLib.propagate(sat.satrec, date);
    if (!pv || !pv.position || typeof pv.position.x !== 'number') return null;
    const gmst = satelliteLib.gstime(date);
    const geo = satelliteLib.eciToGeodetic(pv.position, gmst);
    const latitude = satelliteLib.degreesLat(geo.latitude);
    const longitude = satelliteLib.degreesLong(geo.longitude);
    const altitude = geo.height;
    const velocity = pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : NaN;
    if (![latitude, longitude, altitude].every(Number.isFinite)) return null;
    return { latitude, longitude, altitude, velocity, pv, gmst, geo };
  };
  const lookAtObserver = (position) => {
    if (!position || !satelliteLib) return null;
    const look = satelliteLib.ecfToLookAngles(
      { longitude: observer.longitude * Math.PI / 180, latitude: observer.latitude * Math.PI / 180, height: 0 },
      satelliteLib.eciToEcf(position.pv.position, position.gmst)
    );
    return look;
  };
  const greatCircleKm = (a, b) => {
    const rad = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * rad;
    const dLon = (b.longitude - a.longitude) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
  };
  const clearMapLayers = () => {
    layer.clearLayers();
    trackLayer.clearLayers();
    footprintLayer.clearLayers();
    marker = null;
  };
  const addTrackAndFootprint = () => {
    if (!selected || !satelliteLib) return;
    trackLayer.clearLayers();
    footprintLayer.clearLayers();
    const now = new Date();
    const points = [];
    for (let minute = -15; minute <= 90; minute += 1) {
      const pos = getPosition(selected, new Date(now.getTime() + minute * 60000));
      if (pos) points.push([pos.latitude, pos.longitude]);
    }
    if (points.length > 1 && ui.trail?.checked) {
      L.polyline(points, { color: '#baff45', weight: 2, opacity: 0.85, dashArray: '5 5', interactive: false }).addTo(trackLayer);
    }
    const current = getPosition(selected, now);
    if (!current) return;
    const groundRadiusKm = EARTH_RADIUS_KM * Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + Math.max(0, current.altitude)));
    if (ui.footprint?.checked) {
      L.circle([current.latitude, current.longitude], {
        radius: groundRadiusKm * 1000, color: '#58d9ff', weight: 1, opacity: 0.8,
        fillColor: '#58d9ff', fillOpacity: 0.07, interactive: false
      }).addTo(footprintLayer);
    }
    if (!marker) {
      marker = L.circleMarker([current.latitude, current.longitude], {
        radius: 7, color: '#baff45', weight: 2, fillColor: '#baff45', fillOpacity: 0.9
      }).addTo(layer);
    } else marker.setLatLng([current.latitude, current.longitude]);
    marker.bindPopup('<strong>' + escapeHtml(selected.OBJECT_NAME) + '</strong><br>Расчётная позиция по орбитальным элементам');
    if (locked && (!lastCenter || greatCircleKm(lastCenter, current) > 10)) {
      map.panTo([current.latitude, current.longitude], { animate: false });
      lastCenter = { latitude: current.latitude, longitude: current.longitude };
    }
  };
  const updateReadout = () => {
    if (!selected) return;
    const now = new Date();
    const pos = getPosition(selected, now);
    if (!pos) {
      setStatus('ОРБИТА НЕ РАССЧИТАНА', 'error');
      return;
    }
    const look = lookAtObserver(pos, now);
    const elevation = look && Number.isFinite(look.elevation) ? look.elevation * 180 / Math.PI : NaN;
    const rangeKm = look && Number.isFinite(look.range) ? look.range : NaN;
    if (ui.name) ui.name.textContent = selected.OBJECT_NAME || 'Satellite';
    if (ui.position) ui.position.textContent = fmt(pos.latitude, 2) + '°, ' + fmt(pos.longitude, 2) + '°';
    if (ui.altitude) ui.altitude.textContent = fmt(pos.altitude, 0) + ' km';
    if (ui.speed) ui.speed.textContent = fmt(pos.velocity, 2) + ' km/s';
    if (ui.elevation) ui.elevation.textContent = Number.isFinite(elevation) ? fmt(elevation, 1) + '° · ' + fmt(rangeKm, 0) + ' km' : '—';
    if (ui.age) {
      const epoch = Date.parse(selected.EPOCH || '');
      const ageHours = Number.isFinite(epoch) ? (now.getTime() - epoch) / 3600000 : NaN;
      ui.age.textContent = Number.isFinite(ageHours) ? 'Эпоха TLE: ' + (ageHours < 48 ? fmt(ageHours, 1) + ' ч назад' : fmt(ageHours / 24, 1) + ' дн. назад') : 'Эпоха TLE неизвестна';
    }
    if (ui.pass) {
      if (Number.isFinite(elevation) && elevation > 0) ui.pass.textContent = 'ВИДЕН СЕЙЧАС · уйдёт за горизонт по расчётной модели; обновление уточнит время';
      else ui.pass.textContent = 'Сейчас ниже горизонта · ищем следующий пролёт…';
    }
    addTrackAndFootprint();
    setStatus('РАСЧЁТ ОБНОВЛЯЕТСЯ · ' + now.toLocaleTimeString(), 'ok');
  };
  const predictPasses = async () => {
    const requestId = ++passRequest;
    if (!catalog.length || !satelliteLib || !ui.passes) return;
    ui.passes.replaceChildren();
    const loading = document.createElement('li');
    loading.className = 'empty';
    loading.textContent = 'Расчёт проходов над выбранной точкой…';
    ui.passes.append(loading);
    const start = Date.now();
    const results = [];
    // Coarse 2-minute sampling across 6 hours; refine crossing times to avoid a false minute-level promise.
    for (let index = 0; index < catalog.length; index += 1) {
      if (requestId !== passRequest) return;
      const sat = catalog[index];
      let wasAbove = false;
      let rise = null;
      let peak = -90;
      let peakTime = null;
      for (let offset = 0; offset <= 360; offset += 2) {
        const date = new Date(start + offset * 60000);
        const pos = getPosition(sat, date);
        if (!pos) continue;
        const look = lookAtObserver(pos, date);
        const elevation = look && Number.isFinite(look.elevation) ? look.elevation * 180 / Math.PI : -90;
        if (elevation > peak) { peak = elevation; peakTime = date; }
        if (elevation > 0 && !wasAbove) rise = date;
        if (elevation <= 0 && wasAbove && rise) {
          results.push({ sat, rise, set: date, peak, peakTime });
          break;
        }
        wasAbove = elevation > 0;
      }
      if (index % 8 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    if (requestId !== passRequest) return;
    results.sort((a, b) => a.rise - b.rise);
    ui.passes.replaceChildren();
    const fragment = document.createDocumentFragment();
    results.slice(0, 12).forEach((pass) => {
      const li = document.createElement('li');
      li.className = 'data-row satellite-pass-row';
      const main = document.createElement('div');
      main.className = 'row-main';
      const title = document.createElement('button');
      title.type = 'button';
      title.className = 'row-title satellite-pass-select';
      title.textContent = pass.sat.OBJECT_NAME || 'Satellite';
      title.addEventListener('click', () => selectSatellite(pass.sat.NORAD_CAT_ID));
      const detail = document.createElement('div');
      detail.className = 'row-detail';
      detail.textContent = pass.rise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' — ' + pass.set.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · максимум ' + fmt(pass.peak, 0) + '°';
      main.append(title, detail);
      const value = document.createElement('div');
      value.className = 'row-value';
      value.textContent = Math.max(0, Math.round((pass.rise.getTime() - Date.now()) / 60000)) + ' мин';
      li.append(main, value);
      fragment.append(li);
    });
    ui.passes.append(fragment);
    if (!results.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Нет рассчитанных пролётов над горизонтом за 6 часов в выбранной группе. Попробуйте другую категорию.';
      ui.passes.append(li);
    }
    if (ui.count) ui.count.textContent = catalog.length + ' аппаратов · 6 ч прогноз';
  };
  function selectSatellite(id) {
    selected = catalog.find((sat) => String(sat.NORAD_CAT_ID) === String(id)) || catalog[0] || null;
    if (!selected) return;
    if (ui.target) ui.target.value = String(selected.NORAD_CAT_ID);
    locked = false;
    if (ui.lock) { ui.lock.setAttribute('aria-pressed', 'false'); ui.lock.textContent = '◎ Захват цели'; }
    updateReadout();
    const pos = getPosition(selected);
    if (pos) map.setView([pos.latitude, pos.longitude], Math.max(map.getZoom(), 4), { animate: false });
  }
  async function loadCatalog() {
    if (timer) window.clearInterval(timer);
    passRequest += 1;
    setStatus('ЗАГРУЗКА ОРБИТАЛЬНЫХ ЭЛЕМЕНТОВ…');
    try {
      if (!satelliteLib) satelliteLib = await import('https://esm.sh/satellite.js@6.0.1');
      const key = ui.category.value in groups ? ui.category.value : 'stations';
      const response = await fetch(groups[key].url, { cache: 'no-cache' });
      if (!response.ok) throw new Error('CelesTrak HTTP ' + response.status);
      const tleText = await response.text();
      const lines = tleText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      catalog = [];
      for (let index = 0; index < lines.length - 2; index += 1) {
        const name = lines[index];
        const line1 = lines[index + 1];
        const line2 = lines[index + 2];
        if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue;
        const noradId = line1.slice(2, 7).trim();
        if (!noradId) continue;
        const epochField = line1.slice(18, 32).trim();
        const epochYear = Number(epochField.slice(0, 2));
        const epochDay = Number(epochField.slice(2));
        const fullYear = epochYear < 57 ? 2000 + epochYear : 1900 + epochYear;
        const epoch = Number.isFinite(epochDay)
          ? new Date(Date.UTC(fullYear, 0, 1) + (epochDay - 1) * 86400000).toISOString()
          : '';
        try {
          catalog.push({
            OBJECT_NAME: name,
            NORAD_CAT_ID: noradId,
            EPOCH: epoch,
            satrec: satelliteLib.twoline2satrec(line1, line2)
          });
        } catch { /* Skip malformed elements without blocking the catalog. */ }
        index += 2;
      }
      if (!catalog.length) throw new Error('В источнике нет пригодных орбитальных элементов');
      ui.target.replaceChildren();
      catalog.slice(0, 800).forEach((sat) => {
        const option = document.createElement('option');
        option.value = String(sat.NORAD_CAT_ID);
        option.textContent = sat.OBJECT_NAME || 'NORAD ' + sat.NORAD_CAT_ID;
        ui.target.append(option);
      });
      if (ui.count) ui.count.textContent = catalog.length + ' аппаратов';
      const preferred = catalog.find((sat) => /ISS (ZARYA)/i.test(sat.OBJECT_NAME || '')) || catalog[0];
      selectSatellite(preferred.NORAD_CAT_ID);
      timer = window.setInterval(updateReadout, 5000);
      await predictPasses();
      setStatus('ОРБИТАЛЬНЫЕ ДАННЫЕ ЗАГРУЖЕНЫ', 'ok');
    } catch (error) {
      console.error('[EMONITO satellite intercept]', error);
      setStatus('НЕТ ДАННЫХ · ' + String(error.message || error).slice(0, 70), 'error');
      if (ui.passes) {
        ui.passes.replaceChildren();
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'Не удалось получить GP/TLE-данные или загрузить расчётный модуль. Проверьте сеть и повторите запрос.';
        ui.passes.append(li);
      }
    }
  }

  ui.reload?.addEventListener('click', loadCatalog);
  ui.category.addEventListener('change', loadCatalog);
  ui.target.addEventListener('change', () => selectSatellite(ui.target.value));
  ui.lock?.addEventListener('click', () => {
    locked = !locked;
    if (ui.lock) {
      ui.lock.setAttribute('aria-pressed', String(locked));
      ui.lock.textContent = locked ? '■ Остановить слежение' : '◎ Захват цели';
    }
    const pos = selected && getPosition(selected);
    if (locked && pos) {
      lastCenter = { latitude: pos.latitude, longitude: pos.longitude };
      map.setView([pos.latitude, pos.longitude], Math.max(map.getZoom(), 4), { animate: false });
    }
  });
  ui.footprint?.addEventListener('change', updateReadout);
  ui.trail?.addEventListener('change', updateReadout);
  ui.locate?.addEventListener('click', () => {
    const point = state.location;
    if (!point) {
      setStatus('СНАЧАЛА ВЫБЕРИТЕ ТОЧКУ КАРТЫ ИЛИ РАЗРЕШИТЕ GPS', 'error');
      return;
    }
    observer = { latitude: point.latitude, longitude: point.longitude };
    predictPasses();
  });
  window.addEventListener('beforeunload', () => {
    if (timer) window.clearInterval(timer);
    passRequest += 1;
    clearMapLayers();
  }, { once: true });
  // Do not assume a device location. The observer is the map-selected point or the app's documented default.
  loadCatalog();
}
