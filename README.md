# PULSE — Live Culture Deck

PULSE repurposes the former EMONITO dashboard into a mobile-first live culture dashboard for gaming, sport, music and discovery.

## Current MVP
- Responsive dark/neon dashboard, built with plain HTML, CSS and JavaScript.
- Navigation: Now, Gaming, Sport, Culture, Trend Radar, Discover.
- Interest filters and search; preferences are stored locally in this browser only.
- Live optional data: Steam News Atom feed and ESPN English Premier League scoreboard.
- If a feed is blocked, unavailable or empty, the app falls back to clearly labelled direct source links. It does not invent view counts, popularity metrics, or event data.
- Links to official/primary source pages for music, video, esports and local event discovery.
- No accounts, trackers, API secrets, or backend required.

## Run locally
Open `index.html` in a modern browser or serve the repository root with any static HTTP server. The app has no build step and no runtime package dependencies.

## GitHub Pages
The site entry point is `index.html`. Ensure Pages is configured to publish from the `main` branch and repository root. A successful commit or CI run does not by itself verify the deployed site; test the published URL on desktop and mobile.

## Data integrity
Third-party APIs and feeds can change, block browser requests (CORS), rate-limit, or return no events. In those cases the UI explicitly falls back to source links. Trend Radar is a discovery list, not a measured popularity ranking. Local event results are currently a source-link entry point, not a geolocated event feed.
