/* Leaflet map subsystem. It owns map state and layers, not dashboard data loading. */
let leafletFallbackPromise = null;
function ensureLeaflet() {
  if (window.L) return Promise.resolve(true);
  if (leafletFallbackPromise) return leafletFallbackPromise;
  leafletFallbackPromise = new Promise((resolve) => {
    const sources = [
      'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
    ];
    const load = (index) => {
      if (window.L) { resolve(true); return; }
      if (index >= sources.length) { resolve(false); return; }
      const script = document.createElement('script');
      script.src = sources[index];
      script.crossOrigin = 'anonymous';
      script.onload = () => window.L ? resolve(true) : load(index + 1);
      script.onerror = () => { script.remove(); load(index + 1); };
      document.head.appendChild(script);
    };
    load(0);
  });
  return leafletFallbackPromise;
}
export function initMap(deps) {
  const { state, $, $status, text, fmt, esc, fetchJson, locateUser, loadWeather, loadAir, loadMarine, loadHistory, SOURCES } = deps;
  const Leaflet = window.L;
  const container = $('map');

  if (!container) {
    $status('mapStatus', 'MAP CONTAINER MISSING', 'error');
    return null;
  }
  if (!Leaflet) {
    $status('mapStatus', 'ЗАГРУЗКА БИБЛИОТЕКИ КАРТЫ…', 'loading');
    return ensureLeaflet().then((loaded) => {
      if (loaded) {
        leafletFallbackPromise = null;
        return initMap(deps);
      }
      const error = new Error('Leaflet unavailable from primary and fallback CDNs');
      $status('mapStatus', 'MAP LIBRARY FAILED · CDN UNAVAILABLE', 'error');
      console.error('[EMONITO map] Leaflet fallback failed:', error);
      throw error;
    }).catch((error) => {
      $status('mapStatus', 'MAP LIBRARY FAILED · CDN UNAVAILABLE', 'error');
      console.error('[EMONITO map] Leaflet fallback failed:', error);
      throw error;
    });
  }

  const map = Leaflet.map(container, {
    worldCopyJump: true,
    preferCanvas: true,
    zoomControl: false,
    minZoom: 2,
    maxZoom: 19
  }).setView([20, 0], 2);

  Leaflet.control.zoom({ position: 'bottomright' }).addTo(map);

  // MapLibre is an optional 2D basemap. Leaflet remains the interaction/overlay layer,
  // so all existing data modules and layer toggles keep working in either map mode.
  const mapLibreContainer = $('mapLibreMap');
  const mapLibreButton = $('mapEngineMapLibre');
  const leafletButton = $('mapEngineLeaflet');
  let mapLibreInstance = null;
  let mapEngine = 'leaflet';
  let cameraSyncFrame = 0;

  function setMapEngine(engine) {
    if (engine === 'maplibre' && !window.maplibregl) {
      $status('mapStatus', 'MAPLIBRE UNAVAILABLE · CHECK CDN', 'error');
      return;
    }
    if (engine === 'maplibre' && !mapLibreInstance) {
      mapLibreInstance = new window.maplibregl.Map({
        container: mapLibreContainer,
        style: {
          version: 8,
          sources: {
            osmRaster: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors'
            }
          },
          layers: [{ id: 'osm-raster', type: 'raster', source: 'osmRaster', minzoom: 0, maxzoom: 19 }]
        },
        center: [map.getCenter().lng, map.getCenter().lat],
        zoom: map.getZoom(),
        minZoom: 2,
        maxZoom: 19,
        attributionControl: true,
        cooperativeGestures: false,
        interactive: false
      });
      mapLibreInstance.on('error', (event) => {
        if (event?.error) console.warn('[EMONITO MapLibre]', event.error.message || event.error);
      });
      mapLibreInstance.on('load', () => {
        const center = map.getCenter();
        mapLibreInstance.jumpTo({ center: [center.lng, center.lat], zoom: map.getZoom() });
        $status('mapStatus', 'MAPLIBRE 2D READY', 'ok');
      });
    }
    mapEngine = engine;
    const useMapLibre = engine === 'maplibre';
    if (mapLibreContainer) mapLibreContainer.hidden = !useMapLibre;
    if (mapLibreContainer) mapLibreContainer.style.display = useMapLibre ? 'block' : 'none';
    container.classList.toggle('maplibre-overlay-active', useMapLibre);
    const tilePane = map.getPane('tilePane');
    const imageryMode = $('imageryMode')?.value || 'street';
    if (useMapLibre) {
      map.removeLayer(base);
      if (imageryMode === 'street') {
        map.removeLayer(satellite);
        map.removeLayer(clouds);
        if (tilePane) tilePane.style.display = 'none';
      } else {
        map.removeLayer(imageryMode === 'satellite' ? clouds : satellite);
        (imageryMode === 'satellite' ? satellite : clouds).addTo(map);
        if (tilePane) tilePane.style.display = '';
      }
    } else {
      base.addTo(map);
      if (tilePane) tilePane.style.display = '';
    }
    if (mapEngineMapLibre) {
      mapEngineMapLibre.classList.toggle('active', useMapLibre);
      mapEngineMapLibre.setAttribute('aria-pressed', String(useMapLibre));
    }
    if (leafletButton) {
      leafletButton.classList.toggle('active', !useMapLibre);
      leafletButton.setAttribute('aria-pressed', String(!useMapLibre));
    }
    requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      if (useMapLibre && mapLibreInstance) {
        mapLibreInstance.resize();
        const center = map.getCenter();
        mapLibreInstance.jumpTo({ center: [center.lng, center.lat], zoom: map.getZoom() });
        $status('mapStatus', 'MAPLIBRE 2D · LAYERS ACTIVE', 'ok');
      } else {
        $status('mapStatus', 'LEAFLET · LAYERS ACTIVE', 'ok');
      }
    });
  }

  mapEngineMapLibre?.addEventListener('click', () => setMapEngine('maplibre'));
  leafletButton?.addEventListener('click', () => setMapEngine('leaflet'));
  window.addEventListener('resize', () => {
    if (mapEngine === 'maplibre' && mapLibreInstance) mapLibreInstance.resize();
  }, { passive: true });

  // Leaflet owns gestures and existing data overlays; MapLibre is a synchronized
  // WebGL basemap underneath it, so markers/popups remain fully interactive.
  map.on('move', () => {
    if (mapEngine !== 'maplibre' || !mapLibreInstance || cameraSyncFrame) return;
    cameraSyncFrame = requestAnimationFrame(() => {
      cameraSyncFrame = 0;
      if (mapEngine !== 'maplibre' || !mapLibreInstance) return;
      const center = map.getCenter();
      mapLibreInstance.jumpTo({ center: [center.lng, center.lat], zoom: map.getZoom() });
    });
  });

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

  // In MapLibre mode, imagery overlays are rendered in Leaflet's transparent
  // tile pane above the GL basemap. The normal OSM Leaflet base stays hidden.
  $('imageryMode')?.addEventListener('change', () => {
    if (mapEngine !== 'maplibre') return;
    const mode = $('imageryMode').value;
    const tilePane = map.getPane('tilePane');
    map.removeLayer(base);
    map.removeLayer(satellite);
    map.removeLayer(clouds);
    if (mode === 'street') {
      if (tilePane) tilePane.style.display = 'none';
    } else {
      (mode === 'satellite' ? satellite : clouds).addTo(map);
      if (tilePane) tilePane.style.display = '';
    }
  });

  const solarTerminator = Leaflet.polyline([], {
    color: '#58d9ff', weight: 2, opacity: 0.95, dashArray: '5 5',
    interactive: false, className: 'solar-terminator-line'
  });
  function updateSolarTerminator() {
    const now = new Date();
    const start = Date.UTC(now.getUTCFullYear(), 0, 0);
    const day = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - start) / 86400000;
    const gamma = 2 * Math.PI / 365 * (day - 1 + (now.getUTCHours() - 12) / 24);
    const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
      - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
      - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
    const equationOfTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
      - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
    const subsolarLongitude = 180 - (utcMinutes + equationOfTime) / 4;
    const points = [];
    for (let longitude = -180; longitude <= 180; longitude += 2) {
      const hourAngle = (longitude - subsolarLongitude) * Math.PI / 180;
      const latitude = Math.atan2(-Math.cos(hourAngle), Math.tan(declination)) * 180 / Math.PI;
      if (Number.isFinite(latitude)) points.push([Math.max(-89.8, Math.min(89.8, latitude)), longitude]);
    }
    solarTerminator.setLatLngs(points);
  }
  updateSolarTerminator();
  window.setInterval(updateSolarTerminator, 60000);

  state.map = map;
  state.layers = {
    base,
    satellite,
    clouds,
    solarTerminator,
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
