/* Leaflet map subsystem. It owns map state and layers, not dashboard data loading. */
export function initMap(deps) {
  const { state, $, $status, text, fmt, esc, fetchJson, locateUser, loadWeather, loadAir, loadMarine, loadHistory, SOURCES } = deps;
  const Leaflet = window.L;
  const container = $('map');

  if (!container) {
    $status('mapStatus', 'MAP CONTAINER MISSING', 'error');
    return null;
  }
  if (!Leaflet) {
    $status('mapStatus', 'MAP LIBRARY FAILED · CHECK NETWORK', 'error');
    return null;
  }

  const map = Leaflet.map(container, {
    worldCopyJump: true,
    preferCanvas: true,
    zoomControl: false,
    minZoom: 2,
    maxZoom: 19
  }).setView([20, 0], 2);

  Leaflet.control.zoom({ position: 'bottomright' }).addTo(map);

  const base = Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  const imageryDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const satellite = Leaflet.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', {
    layers: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    format: 'image/jpeg',
    transparent: false,
    version: '1.1.1',
    time: imageryDate,
    attribution: 'NASA GIBS / EOSDIS',
    tileSize: 256
  });

  const clouds = Leaflet.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', {
    layers: 'MODIS_Terra_Cloud_Top_Temp_Day',
    format: 'image/png',
    transparent: true,
    version: '1.1.1',
    attribution: 'NASA GIBS / EOSDIS'
  });

  let baseTilesLoaded = false;
  base.on('tileload', () => {
    baseTilesLoaded = true;
    $status('mapStatus', 'STREET MAP OK', 'ok');
  });
  base.on('tileerror', () => {
    if (!baseTilesLoaded) $status('mapStatus', 'MAP TILES UNAVAILABLE · CHECK NETWORK', 'error');
  });
  satellite.on('tileload', () => $status('mapStatus', 'NASA IMAGERY LOADED', 'ok'));
  satellite.on('tileerror', () => $status('mapStatus', 'NASA IMAGERY UNAVAILABLE', 'error'));
  clouds.on('tileload', () => $status('mapStatus', 'CLOUD LAYER LOADED', 'ok'));
  clouds.on('tileerror', () => $status('mapStatus', 'CLOUD LAYER UNAVAILABLE', 'error'));

  state.map = map;
  state.layers = {
    base,
    satellite,
    clouds,
    quakes: Leaflet.layerGroup().addTo(map),
    events: Leaflet.layerGroup().addTo(map),
    iss: Leaflet.layerGroup().addTo(map),
    issTrail: Leaflet.layerGroup().addTo(map),
    air: Leaflet.layerGroup(),
    transport: Leaflet.layerGroup(),
    aircraft: Leaflet.layerGroup(),
    energy: Leaflet.layerGroup()
  };

  const updateSelectedLocation = (point) => {
    state.location = point;
    const coords = `${fmt(point.latitude, 3)}°, ${fmt(point.longitude, 3)}°`;
    text('selectedCoords', coords);
    text('mobileSelectedCoords', coords);
  };

  map.on('click', async (event) => {
    const point = { latitude: event.latlng.lat, longitude: event.latlng.lng };
    updateSelectedLocation(point);
    const popup = Leaflet.popup({ maxWidth: 280 })
      .setLatLng(event.latlng)
      .setContent('<div class="map-popup"><strong>Сводка по точке</strong><p>Загружаем погоду…</p><p>Сейсмика: поиск ближайших событий…</p></div>')
      .openOn(map);

    const nearest = (state.quakeFeatures || [])
      .map((feature) => {
        const coordinates = feature.geometry?.coordinates || [];
        if (coordinates.length < 2) return null;
        const lat = point.latitude * Math.PI / 180;
        const dLat = (coordinates[1] - point.latitude) * Math.PI / 180;
        const dLon = (coordinates[0] - point.longitude) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat) * Math.cos(coordinates[1] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return { feature, km: 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) };
      })
      .filter(Boolean)
      .sort((a, b) => a.km - b.km)[0];

    let weather = 'Погода: данные недоступны';
    try {
      const url = new URL(SOURCES.weather);
      url.search = new URLSearchParams({
        latitude: String(point.latitude),
        longitude: String(point.longitude),
        current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation',
        timezone: 'auto'
      }).toString();
      const data = await fetchJson(url.toString());
      const current = data.current || {};
      weather = `Погода: ${fmt(current.temperature_2m, 1)} °C · влажность ${fmt(current.relative_humidity_2m, 0)}% · ветер ${fmt(current.wind_speed_10m, 1)} км/ч`;
    } catch (error) {
      console.warn('[EMONITO map] Point weather unavailable:', error.message);
    }

    const quakeSummary = nearest && nearest.km < 500
      ? `Ближайшее землетрясение: M ${fmt(nearest.feature.properties?.mag, 1)} · ${Math.round(nearest.km)} км · ${esc(nearest.feature.properties?.place || 'место неизвестно')}`
      : 'В радиусе 500 км нет событий в загруженном фиде за 24 часа';
    const kp = `Космическая погода: Kp ${esc($('kpValue')?.textContent || '—')}`;

    if (state.map === map && popup.isOpen()) {
      popup.setContent(`<div class="map-popup"><strong>Сводка · ${fmt(point.latitude, 3)}°, ${fmt(point.longitude, 3)}°</strong><p>${esc(weather)}</p><p>${quakeSummary}</p><p>${kp}</p></div>`);
    }
    loadWeather();
    loadAir();
    loadMarine();
    loadHistory();
  });

  $('mapLocate')?.addEventListener('click', () => locateUser());
  $('mapReset')?.addEventListener('click', () => {
    state.location = null;
    map.setView([20, 0], 2);
    text('selectedCoords', 'GLOBAL VIEW');
    text('mobileSelectedCoords', 'GLOBAL VIEW');
    loadWeather();
    loadAir();
    loadMarine();
    loadHistory();
  });

  // GitHub Pages/mobile browsers may calculate map size before fonts and layout settle.
  requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  window.addEventListener('orientationchange', () => {
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }, { passive: true });
  $status('mapStatus', 'MAP READY · LOADING TILES', 'ok');
  return map;
}
