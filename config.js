/* Shared, non-secret application configuration. */
export const DEFAULT_LOCATION = Object.freeze({ latitude: 48.89, longitude: 8.70 });
export const GLOBAL_VIEW = Object.freeze({ latitude: 20, longitude: 0, zoom: 2 });
export const SOURCES = {
    usgs:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    eonet:'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100',
    iss:'https://api.wheretheiss.at/v1/satellites/25544',
    weather:'https://api.open-meteo.com/v1/forecast',
    air:'https://air-quality-api.open-meteo.com/v1/air-quality',
    swpc:'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
    solar:'https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json',
    neo:'https://api.nasa.gov/neo/rest/v1/feed?api_key=DEMO_KEY',
    openSky:'https://opensky-network.org/api/states/all',
    energy:'https://ourworldindata.org/grapher/electricity-prod-source-stacked.csv'
  };
