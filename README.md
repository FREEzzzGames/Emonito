# EMONITO — Earth Monitor

A static, GitHub Pages-hosted global monitoring dashboard using public data sources. Dark HUD design, responsive layout, interactive map, and explicit source/error states.

## Monitoring domains

1. Earth geography and NASA GIBS satellite imagery
2. Weather and atmospheric conditions (Open-Meteo)
3. Earthquakes (USGS)
4. Natural events and disasters (NASA EONET)
5. Oceans and water data catalog (Copernicus Marine, USGS Water Data, NOAA)
6. Air quality (Open-Meteo Air Quality)
7. Solar and geomagnetic weather (NOAA SWPC)
8. ISS position and near-Earth objects (WhereTheISS.at, NASA NEO DEMO_KEY; orbital catalogs linked)
9. Transport infrastructure (OpenStreetMap Overpass query for current map viewport; aviation sources linked)
10. Energy data (Our World in Data historical CSV; ENTSO-E requires a private API token)
11. Geography, land use and population reference layers (OpenStreetMap, NASA Earth Observatory, WorldPop)
12. Historical weather analytics (Open-Meteo archive and charts)

## Deployment

GitHub Actions deploys the repository root to GitHub Pages on every push to `main`. In **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.

## Current implementation status

- Interactive Leaflet map with OpenStreetMap basemap and optional NASA GIBS satellite/cloud layers.
- Live USGS earthquake markers and NASA EONET event markers, where source requests succeed.
- ISS current position plus a sampled trail collected during this browser session; the trail is not a reconstructed historical orbit.
- Weather and air-quality values, Open-Meteo marine wave model, NOAA planetary K-index, NASA near-Earth object feed, historical weather charts, and regional OpenStreetMap/OpenSky queries.
- Each source reports an unavailable or restricted state when its request fails. The validation workflow checks JavaScript syntax, lint rules, CSS, and static DOM references.
- Mobile browser smoke tests exercise the published map, tap-to-inspect HUD, category navigation, layer menu, and Ambient Mode.
- Tap-to-Inspect shows selected coordinates, modelled weather/AQI, elevation when available, nearest loaded earthquake, and distance to the current ISS position (not a future pass prediction).
- Favorites, layer presets, scan history, and AQI/UV/solar-activity thresholds are stored locally in the current browser.
- Ambient Mode provides a map-first view and optional Screen Wake Lock; browser/OS policies may refuse or release Wake Lock.
- Infrastructure live feeds are not queried directly from the browser. Until the optional Edge Worker is deployed and configured, EMONITO shows official source links and an explicit not-configured state.

## Optional Edge API (Cloudflare Worker)

The Worker source is in `workers/`. It provides a whitelisted proxy/cache for NOAA SWPC, SMARD, NINA/MoWaS, DWD, Open-Meteo weather/air/elevation, plus a 10-minute scheduled refresh for fixed feeds. It is a separate deployment from GitHub Pages and is **not automatically deployed by the Pages workflow**.

Follow `workers/README.md` to create a Cloudflare KV namespace and deploy the Worker. Then use the Edge API button in the map controls to set the HTTPS Worker URL in this browser. Without that external deployment/configuration, live infrastructure feeds remain disabled on the client; the official links remain available.

## Data and security notes

- This is a static client-side app; no API secrets are embedded.
- Some sources may impose quotas, require registration, or block browser requests. The UI reports unavailable sources rather than inventing values.
- The Edge Worker uses only whitelisted upstream endpoints and no embedded private API keys. Its refresh endpoint requires a server-side `REFRESH_TOKEN`; never put that token in frontend code.
- Local favorites, presets, inspection history, proxy URL, and alert thresholds are stored in browser local storage/session storage; they are not synced between devices.
- NASA GIBS satellite imagery can be delayed relative to acquisition. Imagery timestamps and product-specific cadence must be checked before treating a layer as real-time.
- Air quality and weather products may be model output, not direct station measurements.
- OpenStreetMap and Overpass usage is subject to their usage policies. Do not poll Overpass aggressively.
- Near-real-time ENTSO-E and NASA FIRMS access may require tokens; add a server-side proxy only if those sources are approved and needed.
- Attribution is shown in the dashboard and map.
