/* EmonitoApiManager: shared bounded requests, localStorage cache, retries and stale-data metadata. */
const CACHE_PREFIX = 'emonito:api:v2:';
const DEFAULT_TIMEOUT = 14000;

function readCache(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && Number.isFinite(value.savedAt) && 'data' in value ? value : null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch (error) {
    // Quota/privacy mode must never break the live request.
    console.warn('[EMONITO API] Cache write skipped:', error.message);
  }
}

export class EmonitoApiManager {
  constructor({ requests = new Map(), timeout = DEFAULT_TIMEOUT, retries = 2 } = {}) {
    this.requests = requests;
    this.timeout = timeout;
    this.retries = retries;
  }

  async request(url, { cacheKey = url, ttl = 300000, timeout = this.timeout, retries = this.retries, force = false } = {}) {
    const cached = readCache(cacheKey);
    if (!force && cached && Date.now() - cached.savedAt < ttl) {
      return { data: cached.data, stale: false, savedAt: cached.savedAt, source: 'cache' };
    }

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const data = await this.#fetchJson(url, timeout);
        writeCache(cacheKey, data);
        return { data, stale: false, savedAt: Date.now(), source: 'network' };
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 350 * (2 ** attempt)));
        }
      }
    }

    if (cached) {
      return { data: cached.data, stale: true, savedAt: cached.savedAt, source: 'stale-cache', error: lastError };
    }
    throw lastError || new Error('Request failed');
  }

  async #fetchJson(url, timeout) {
    const key = String(url);
    const previous = this.requests.get(key);
    if (previous) previous.abort('superseded');
    const controller = new AbortController();
    this.requests.set(key, controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort('timeout');
    }, timeout);

    try {
      const response = await fetch(key, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim());
      try {
        return await response.json();
      } catch (error) {
        throw new Error(`Invalid JSON from ${new URL(key).hostname}: ${error.message}`);
      }
    } catch (error) {
      if (timedOut) throw new Error(`Request timed out after ${timeout} ms`);
      if (controller.signal.aborted) throw new Error('Request superseded by a newer refresh');
      throw error;
    } finally {
      clearTimeout(timer);
      if (this.requests.get(key) === controller) this.requests.delete(key);
    }
  }
}

export function createApi(requests = new Map()) {
  const manager = new EmonitoApiManager({ requests });
  return async function fetchJson(url, timeout = DEFAULT_TIMEOUT) {
    const result = await manager.request(url, { cacheKey: url, ttl: 0, timeout, retries: 1, force: true });
    return result.data;
  };
}
