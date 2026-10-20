/* EMONITO POI layers: bounded, on-demand OpenStreetMap Overpass queries. */
const LAYER_CONFIG = {
  museums: { label: 'Музеи', query: 'node["tourism"="museum"]({bbox});way["tourism"="museum"]({bbox});relation["tourism"="museum"]({bbox});', color: '#ffbd59', minZoom: 8 },
  theatres: { label: 'Театры', query: 'node["amenity"="theatre"]({bbox});way["amenity"="theatre"]({bbox});relation["amenity"="theatre"]({bbox});', color: '#ff6b9a', minZoom: 8 },
  exhibitions: { label: 'Галереи / выставки', query: 'node["tourism"="gallery"]({bbox});way["tourism"="gallery"]({bbox});relation["tourism"="gallery"]({bbox});node["amenity"="arts_centre"]({bbox});way["amenity"="arts_centre"]({bbox});relation["amenity"="arts_centre"]({bbox});', color: '#b6a0ff', minZoom: 8 },
  shops: { label: 'Магазины', query: 'node["shop"]({bbox});way["shop"]({bbox});', color: '#66fcf1', minZoom: 12 }
};
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const MAX_FEATURES = 180;

export function initPoiLayers({ state, $, $status, text, esc }) {
  if (!state?.map || !window.L) return;
  const map = state.map;
  const layerGroups = {};
  const pending = new Map();
  const escapeHtml = esc || (value => String(value ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])));

  for (const [key, config] of Object.entries(LAYER_CONFIG)) {
    layerGroups[key] = window.L.layerGroup();
    state.layers[key] = layerGroups[key];
  }

  function makeQuery(key, bounds) {
    const bbox = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]
      .map(value => Number(value).toFixed(5)).join(',');
    return '[out:json][timeout:15];(' + LAYER_CONFIG[key].query.replaceAll('{bbox}', bbox) + ');out center tags ' + MAX_FEATURES + ';';
  }

  async function fetchOverpass(query, signal) {
    let lastError;
    for (const endpoint of ENDPOINTS) {
      try {
        const response = await fetch(endpoint + '?data=' + encodeURIComponent(query), {
          signal, headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (!Array.isArray(data.elements)) throw new Error('Unexpected Overpass response');
        return data.elements;
      } catch (error) {
        lastError = error;
        if (signal.aborted) throw error;
      }
    }
    throw lastError || new Error('Overpass unavailable');
  }

  async function loadLayer(key) {
    const config = LAYER_CONFIG[key];
    if (!config) return;
    if (map.getZoom() < config.minZoom) {
      const nextZoom = config.minZoom;
      $status(key + 'Status', 'УВЕЛИЧИВАЕМ МАСШТАБ…', 'loading');
      map.flyTo(map.getCenter(), nextZoom, { duration: 0.45 });
      map.once('moveend', () => loadLayer(key));
      return;
    }
    pending.get(key)?.abort();
    const controller = new AbortController();
    pending.set(key, controller);
    const timer = setTimeout(() => controller.abort('timeout'), 18000);
    $status(key + 'Status', 'ЗАПРОС К OPENSTREETMAP…', 'loading');
    try {
      const elements = await fetchOverpass(makeQuery(key, map.getBounds()), controller.signal);
      if (pending.get(key) !== controller) return;
      const group = layerGroups[key];
      group.clearLayers();
      const list = [];
      for (const item of elements) {
        if (list.length >= MAX_FEATURES) break;
        const lat = item.lat ?? item.center?.lat;
        const lon = item.lon ?? item.center?.lon;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const tags = item.tags || {};
        const name = tags.name || tags['name:en'] || tags['name:de'] || config.label;
        const detail = [tags['addr:city'], tags['addr:street'], tags.opening_hours].filter(Boolean).join(' · ') || 'OpenStreetMap · объект в текущей области карты';
        const marker = window.L.circleMarker([lat, lon], {
          radius: key === 'shops' ? 4 : 6,
          color: config.color, fillColor: config.color, fillOpacity: 0.78, weight: 1
        });
        const osmUrl = 'https://www.openstreetmap.org/' + item.type + '/' + item.id;
        marker.bindPopup('<div class="map-popup"><strong>' + escapeHtml(name) + '</strong><p>' + escapeHtml(detail) + '</p><p>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</p><a href="' + osmUrl + '" target="_blank" rel="noopener noreferrer">Источник OpenStreetMap ↗</a></div>');
        marker.on('click', () => {
          state.location = { latitude: lat, longitude: lon };
          text('selectedCoords', lat.toFixed(3) + '°, ' + lon.toFixed(3) + '°');
          text('mobileSelectedCoords', lat.toFixed(3) + '°, ' + lon.toFixed(3) + '°');
          const follow = $('mapFollow');
          if (follow) follow.disabled = false;
        });
        marker.addTo(group);
        list.push({ name, detail, lat, lon });
      }
      if (document.querySelector('[data-layer-toggle="' + key + '"]')?.checked) group.addTo(map);
      $status(key + 'Status', 'ГОТОВО · ' + list.length + ' ОБЪЕКТОВ', 'ok');
      const listNode = $(key + 'List');
      if (listNode) {
        listNode.replaceChildren();
        if (!list.length) {
          const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'В текущей области объектов не найдено.'; listNode.append(li);
        } else {
          list.slice(0, 8).forEach(item => {
            const li = document.createElement('li'); li.className = 'data-row';
            const main = document.createElement('div'); main.className = 'row-main';
            const title = document.createElement('div'); title.className = 'row-title'; title.textContent = item.name;
            const sub = document.createElement('div'); sub.className = 'row-detail'; sub.textContent = item.detail;
            main.append(title, sub); li.append(main);
            const button = document.createElement('button'); button.type = 'button'; button.className = 'poi-follow'; button.textContent = 'К ТОЧКЕ';
            button.addEventListener('click', () => {
              state.location = { latitude: item.lat, longitude: item.lon };
              map.flyTo([item.lat, item.lon], Math.max(map.getZoom(), 15), { duration: 0.7 });
              text('selectedCoords', item.lat.toFixed(3) + '°, ' + item.lon.toFixed(3) + '°');
              text('mobileSelectedCoords', item.lat.toFixed(3) + '°, ' + item.lon.toFixed(3) + '°');
              const follow = $('mapFollow'); if (follow) follow.disabled = false;
            });
            li.append(button); listNode.append(li);
          });
        }
      }
    } catch (error) {
      if (controller.signal.aborted && pending.get(key) !== controller) return;
      $status(key + 'Status', 'НЕДОСТУПНО · ПОВТОРИТЕ ЗАПРОС', 'error');
      console.warn('[EMONITO POI]', key, error.message);
    } finally {
      clearTimeout(timer);
      if (pending.get(key) === controller) pending.delete(key);
    }
  }

  for (const key of Object.keys(LAYER_CONFIG)) {
    const input = document.querySelector('[data-layer-toggle="' + key + '"]');
    const status = $(key + 'Status');
    if (status) {
      status.title = 'Статус источника. Нажмите, чтобы повторить запрос после ошибки.';
      status.style.cursor = 'pointer';
      status.tabIndex = 0;
      status.setAttribute('role', 'button');
      const retry = () => { if (input?.checked) loadLayer(key); };
      status.addEventListener('click', retry);
      status.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); retry(); }
      });
    }
    input?.addEventListener('change', () => {
      if (input.checked) {
        layerGroups[key].addTo(map);
        loadLayer(key);
      } else {
        map.removeLayer(layerGroups[key]);
        pending.get(key)?.abort();
        $status(key + 'Status', 'ВЫКЛЮЧЕН');
      }
    });
  }

  $('mapFollow')?.addEventListener('click', () => {
    if (!state.location) return;
    map.flyTo([state.location.latitude, state.location.longitude], Math.max(map.getZoom(), 13), { duration: 0.8 });
  });
  $('map')?.addEventListener('click', () => {
    const follow = $('mapFollow');
    if (follow && state.location) follow.disabled = false;
  });
  window.addEventListener('emonito:map-ready', () => {
    const follow = $('mapFollow');
    if (follow && state.location) follow.disabled = false;
  });
}
