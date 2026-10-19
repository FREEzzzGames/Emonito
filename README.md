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

## Data and security notes

- This is a static client-side app; no API secrets are embedded.
- Some sources may impose quotas, require registration, or block browser requests. The UI reports unavailable sources rather than inventing values.
- NASA GIBS satellite imagery can be delayed relative to acquisition. Imagery timestamps and product-specific cadence must be checked before treating a layer as real-time.
- Air quality and weather products may be model output, not direct station measurements.
- OpenStreetMap and Overpass usage is subject to their usage policies. Do not poll Overpass aggressively.
- Near-real-time ENTSO-E and NASA FIRMS access may require tokens; add a server-side proxy only if those sources are approved and needed.
- Attribution is shown in the dashboard and map.
