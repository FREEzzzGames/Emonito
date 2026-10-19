# EMONITO Edge API

This Worker is separate from the GitHub Pages frontend. It proxies the public NOAA SWPC, SMARD, NINA/MoWaS and DWD feeds, stores snapshots in Cloudflare KV, and refreshes them on a 10-minute Cron Trigger.

## Deploy

1. Install Wrangler: `npm i -g wrangler`.
2. Authenticate: `wrangler login`.
3. Create a KV namespace: `wrangler kv namespace create EMO_CACHE`.
4. Replace `REPLACE_WITH_CLOUDFLARE_KV_NAMESPACE_ID` in `wrangler.toml` with the returned ID.
5. Set a private refresh token: `wrangler secret put REFRESH_TOKEN`.
6. Deploy from this directory: `wrangler deploy`.
7. Verify `https://<worker-host>/health` returns `status: ok`, then verify each endpoint: `/xray`, `/alerts`, `/smardIndex`, `/mowas`, `/dwd`.

The public data endpoints are read-only. `/api/refresh` requires the configured bearer token. Do not put that token in browser code.

## Response envelope

Each data endpoint returns `{ fetchedAt, data, stale }`. Consumers must display the snapshot time and must not present stale data as live.

The worker deliberately does not claim that SMARD load is an outage indicator or that warning feeds cover every local infrastructure incident.
