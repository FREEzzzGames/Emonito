# EMONITO — Earth Monitoring System

EMONITO is a mobile-first, dark scientific dashboard for exploring public Earth, weather, space, transport, energy and local-place data. It is a static GitHub Pages application: no account, backend or embedded API secrets are required for the current client-side modules.

## Map engines

- **Leaflet** is the primary interaction and overlay engine. Existing markers, popups, thematic layers, location selection and map-dependent modules remain attached to it.
- **MapLibre GL JS** is an optional **2D WebGL basemap**. Choose it with the MAPLIBRE GL control above the map. Leaflet continues to own gestures and interactive overlays; its camera is synchronized to the MapLibre basemap.
- **3D/globe mode is intentionally not included** in this iteration.
- Both basemaps use OpenStreetMap raster tiles and attribution. Network restrictions, tile limits or a blocked CDN can make a basemap unavailable; the map status reports initialization and tile errors.

## Current map features

- Global geographic map with street, NASA satellite imagery and cloud-top imagery modes.
- Live public-data overlays for earthquakes, natural events, ISS position and trail, transport features, aircraft where the provider permits requests, and the day/night terminator.
- On-demand local POI layers sourced from OpenStreetMap Overpass: **museums, theatres, galleries/exhibition spaces and shops**. Queries are bounded to the current map viewport; shop queries require a closer zoom to limit load on public infrastructure.
- Click a point or a POI to select its coordinates. **К ВЫБРАННОЙ ТОЧКЕ** returns the map to that point without opening a separate navigation app. Browser geolocation is requested only after the user presses the location control.
- POI statuses show loading, success or unavailable states. Clicking a status after an error retries the query.

## Monitoring modules

The dashboard also includes weather and recent hourly history, air quality, space weather, solar-cycle data, near-Earth-object close approaches, marine model data, energy history, satellite passes, local zenith information, infrastructure references, an ambient sound mode, and a planet explorer with saved local interests. Provider availability and coverage vary. The UI should report unavailable data rather than invent measurements.

## Run and deploy

The app uses plain HTML, CSS and JavaScript modules; there is no application build step. GitHub Pages publishes the repository root from main.

- Entry point: index.html
- Main startup and data orchestration: app.js
- Map implementation: map.js
- Shared source configuration: config.js
- Request handling/cache/retry logic: api.js
- Local POI layers: poi-layers.js
- Mobile panels: ui.js

## Validation

GitHub Actions validates JavaScript syntax, ESLint, Stylelint and static HTML/DOM-ID references. A successful CI run does not prove that third-party tiles or APIs are reachable on every mobile network. Before declaring a release fully verified, also open the deployed page on a phone and test both map modes, zoom/pan, point selection, geolocation permission, each POI layer, retry behavior and the existing dashboard modules.

## Data integrity and limits

Public endpoints may impose CORS, rate limits, quotas, licensing restrictions or outages. Overpass queries are viewport-bounded and should be used deliberately; very dense areas may return only the first 180 objects per selected category. Weather and marine values may be model output, not direct station observations. A layer's presence does not imply complete local coverage.
